import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { ESTUDIOS_BUCKET } from '@/lib/supabase/storage'
import { sanitizePdfFilename } from '@/lib/utils'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

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

// ── GET /api/estudios/[id]?disposition=inline|attachment ──────────
// Proxy de los bytes del archivo (opción b): el servidor descarga el objeto de
// Storage y lo transmite. Nunca se expone la URL de Storage al navegador, y es
// consistente con cómo el proyecto ya sirve los PDFs (renderToBuffer → NextResponse).
//   · disposition=attachment (default) → descarga con el nombre original.
//   · disposition=inline               → para previsualizar (img/iframe embebido).
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rl = rateLimit(request, { key: `estudio_file:${user.id}`, limit: 60, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const ctx = await getTenantContext(supabase, user.id)
    if (!ctx) return NextResponse.json({ error: 'Sin permisos para ver estudios' }, { status: 403 })

    const dispositionParam = new URL(request.url).searchParams.get('disposition')
    const disposition = dispositionParam === 'inline' ? 'inline' : 'attachment'

    // RLS de estudios (ver_historia_clinica + tenant) hace de filtro real.
    const { data: estudio, error } = await supabase
      .from('estudios')
      .select('storage_path, file_name, mime_type')
      .eq('id', id)
      .single()

    if (error || !estudio) {
      return NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 })
    }

    // Descarga del objeto con el cliente de sesión: la RLS de storage.objects
    // garantiza que solo se baje un objeto del propio tenant y con permiso.
    const { data: blob, error: downloadError } = await supabase.storage
      .from(ESTUDIOS_BUCKET)
      .download(estudio.storage_path)

    if (downloadError || !blob) {
      console.error('[GET /api/estudios/[id]] download:', downloadError)
      return NextResponse.json({ error: 'No se pudo obtener el archivo' }, { status: 500 })
    }

    const arrayBuffer = await blob.arrayBuffer()
    const filename = sanitizePdfFilename(estudio.file_name)

    return new NextResponse(new Uint8Array(arrayBuffer), {
      status: 200,
      headers: {
        'Content-Type': estudio.mime_type ?? 'application/octet-stream',
        'Content-Disposition': `${disposition}; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error: unknown) {
    console.error('[GET /api/estudios/[id]]', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

// ── DELETE /api/estudios/[id] — solo el médico ─────────────────
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rl = rateLimit(request, { key: `estudio_delete:${user.id}`, limit: 20, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const ctx = await getTenantContext(supabase, user.id)
    if (!ctx) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

    // Borrar es exclusivo del médico (validación explícita, además de la RLS).
    if (ctx.role !== 'medico') {
      return NextResponse.json({ error: 'Solo el médico puede eliminar estudios' }, { status: 403 })
    }

    // Traer el estudio (RLS aísla por tenant) para conocer su path y su paciente.
    const { data: estudio, error: findError } = await supabase
      .from('estudios')
      .select('storage_path, paciente_id')
      .eq('id', id)
      .single()

    if (findError || !estudio) {
      return NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 })
    }

    // Paciente archivado → solo lectura (regla de negocio 9). Admin: el médico
    // siempre ve a sus pacientes, pero mantenemos el mismo patrón acotado al tenant.
    const admin = createAdminClient()
    const { data: pac } = await admin
      .from('pacientes')
      .select('archivado_at')
      .eq('id', estudio.paciente_id)
      .eq('creado_por', ctx.tenantMedicoId)
      .single()

    if (pac?.archivado_at) {
      return NextResponse.json(
        { error: 'El paciente está archivado. Desarchivalo para eliminar estudios.' },
        { status: 409 },
      )
    }

    // Borrar primero la fila (RLS exige rol médico + tenant); confirmamos que borró algo.
    const { data: borrada, error: deleteError } = await supabase
      .from('estudios')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle()

    if (deleteError) {
      console.error('[DELETE /api/estudios/[id]] delete fila:', deleteError)
      return NextResponse.json({ error: 'No se pudo eliminar el estudio' }, { status: 500 })
    }
    if (!borrada) {
      return NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 })
    }

    // La fila ya no existe: quitar el objeto de Storage. Si falla, el sistema queda
    // consistente de cara al usuario (el estudio desapareció); solo queda un objeto
    // huérfano que se registra para limpieza posterior.
    const { error: storageError } = await supabase.storage
      .from(ESTUDIOS_BUCKET)
      .remove([estudio.storage_path])
    if (storageError) {
      console.error(
        '[DELETE /api/estudios/[id]] fila borrada pero quedó objeto huérfano en Storage:',
        estudio.storage_path,
        storageError,
      )
    }

    return NextResponse.json({ error: null })
  } catch (error: unknown) {
    console.error('[DELETE /api/estudios/[id]]', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
