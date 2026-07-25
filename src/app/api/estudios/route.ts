import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { estudioMetadataSchema, validateEstudioFile } from '@/lib/validations/estudio.schema'
import { ESTUDIOS_BUCKET, buildEstudioPath } from '@/lib/supabase/storage'

export const dynamic = 'force-dynamic'

// ── Helpers ────────────────────────────────────────────────────

/**
 * Resuelve el tenant del usuario y valida ver_historia_clinica.
 * Médico → siempre; asistente → solo con el permiso. Null si no está autorizado.
 */
async function getTenantContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, medico_id, ver_historia_clinica')
    .eq('id', userId)
    .single()

  if (!profile) return null
  if (profile.role === 'asistente' && !profile.ver_historia_clinica) return null

  const tenantMedicoId =
    profile.role === 'medico'    ? userId :
    profile.role === 'asistente' ? profile.medico_id :
    null

  return tenantMedicoId ? { tenantMedicoId, role: profile.role as 'medico' | 'asistente' } : null
}

// ── GET /api/estudios?paciente_id= ─────────────────────────────
// Lista los estudios de un paciente (orden: fecha_estudio desc, created_at desc).
// La RLS ya aísla por tenant, pero validamos igual.
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rl = await rateLimit(request, { key: `estudios_get:${user.id}`, limit: 60, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const ctx = await getTenantContext(supabase, user.id)
    if (!ctx) return NextResponse.json({ error: 'Sin permisos para ver estudios' }, { status: 403 })

    const pacienteId = new URL(request.url).searchParams.get('paciente_id')
    if (!pacienteId) {
      return NextResponse.json({ error: 'paciente_id es requerido' }, { status: 400 })
    }

    // Validar que el paciente sea del tenant (admin: quien ve HC puede no tener ver_pacientes).
    const admin = createAdminClient()
    const { data: pac } = await admin
      .from('pacientes')
      .select('id')
      .eq('id', pacienteId)
      .eq('creado_por', ctx.tenantMedicoId)
      .single()
    if (!pac) return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 })

    const { data, error } = await supabase
      .from('estudios')
      .select('*')
      .eq('paciente_id', pacienteId)
      .order('fecha_estudio', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ data: data ?? [], error: null })
  } catch (error: unknown) {
    console.error('[GET /api/estudios]', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

// ── POST /api/estudios (FormData) ──────────────────────────────
// Sube un archivo a Storage e inserta la fila. Si el insert falla, borra el objeto
// para no dejar huérfanos (rollback).
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rl = await rateLimit(request, { key: `estudios_post:${user.id}`, limit: 20, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const ctx = await getTenantContext(supabase, user.id)
    if (!ctx) return NextResponse.json({ error: 'Sin permisos para subir estudios' }, { status: 403 })

    // ── Parseo del FormData ────────────────────────────────────
    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No se recibió ningún archivo' }, { status: 400 })
    }

    const meta = estudioMetadataSchema.safeParse({
      paciente_id: formData.get('paciente_id'),
      nombre: formData.get('nombre'),
      tipo: formData.get('tipo') || null,
      fecha_estudio: formData.get('fecha_estudio') || null,
      descripcion: formData.get('descripcion') || null,
    })
    if (!meta.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: meta.error.format() },
        { status: 400 },
      )
    }

    // ── Validación del archivo REAL (tamaño y MIME, no lo declarado) ──
    const fileError = validateEstudioFile({ size: file.size, type: file.type })
    if (fileError) return NextResponse.json({ error: fileError }, { status: 400 })

    // ── Paciente: del tenant y NO archivado (admin, como POST /api/consultas) ──
    const admin = createAdminClient()
    const { data: pac, error: pacError } = await admin
      .from('pacientes')
      .select('archivado_at')
      .eq('id', meta.data.paciente_id)
      .eq('creado_por', ctx.tenantMedicoId)
      .single()

    if (pacError || !pac) {
      return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 })
    }
    if (pac.archivado_at) {
      return NextResponse.json(
        { error: 'El paciente está archivado. Desarchivalo para subir estudios.' },
        { status: 409 },
      )
    }

    // ── Subida a Storage (cliente de sesión → RLS aísla por tenant) ──
    const storagePath = buildEstudioPath(
      ctx.tenantMedicoId,
      meta.data.paciente_id,
      file.name,
      file.type,
    )

    const { error: uploadError } = await supabase.storage
      .from(ESTUDIOS_BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: false })

    if (uploadError) {
      console.error('[POST /api/estudios] upload:', uploadError)
      return NextResponse.json({ error: 'No se pudo subir el archivo' }, { status: 500 })
    }

    // ── Insert de la fila. Rollback del objeto si falla. ──────
    const { error: insertError } = await supabase.from('estudios').insert({
      paciente_id: meta.data.paciente_id,
      nombre: meta.data.nombre,
      tipo: meta.data.tipo ?? null,
      fecha_estudio: meta.data.fecha_estudio || null,
      descripcion: meta.data.descripcion ?? null,
      storage_path: storagePath,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      subido_por: user.id,
    })

    if (insertError) {
      // Rollback: borrar el objeto recién subido para no dejar huérfanos.
      const { error: cleanupError } = await supabase.storage
        .from(ESTUDIOS_BUCKET)
        .remove([storagePath])
      if (cleanupError) {
        console.error('[POST /api/estudios] rollback de Storage falló:', storagePath, cleanupError)
      }
      console.error('[POST /api/estudios] insert:', insertError)
      return NextResponse.json({ error: 'No se pudo registrar el estudio' }, { status: 500 })
    }

    return NextResponse.json({ error: null }, { status: 201 })
  } catch (error: unknown) {
    console.error('[POST /api/estudios]', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
