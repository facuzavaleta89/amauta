import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { certificadoSchema } from '@/lib/validations/pedido.schema'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { congelarPdfDocumento, getBaseUrl, construirEmisorSnapshot } from '@/lib/pdf/documentos'
import { resolverAcceso } from '@/lib/auth/tenant'
import { hoyAR } from '@/lib/utils/format-date'

// ── GET /api/certificados ─────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rl = await rateLimit(request, { key: `certificados_get:${user.id}`, limit: 60, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const acceso = await resolverAcceso(supabase, user.id, 'ver_certificados')
    if (!acceso.ok) {
      const msg = acceso.motivo === 'sin-permiso' ? 'Sin permisos para ver certificados'
                : acceso.motivo === 'sin-tenant'  ? 'Sin tenant asignado'
                : 'Perfil no encontrado'
      return NextResponse.json({ error: msg }, { status: 403 })
    }
    const tenantMedicoId = acceso.tenantMedicoId

    const { searchParams } = new URL(request.url)
    const pacienteId = searchParams.get('paciente_id')
    const rawQ = searchParams.get('q')
    const q = rawQ ? rawQ.slice(0, 100) : null

    let query = supabase
      .from('certificados')
      .select(`
        id, paciente_id, paciente_nombre, paciente_dni,
        tipo, tipo_descripcion, fecha_certificado,
        pdf_path, created_at, codigo_verificacion, estado
      `)
      .eq('firmado_por', tenantMedicoId)
      .order('fecha_certificado', { ascending: false })

    if (pacienteId) query = query.eq('paciente_id', pacienteId)
    if (q) query = query.ilike('paciente_nombre', `%${q}%`)

    const { data, error } = await query.limit(50)
    if (error) {
      console.error('[GET /api/certificados] DB error:', error)
      return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('[GET /api/certificados]', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

// ── POST /api/certificados ────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rl = await rateLimit(request, { key: `certificados_post:${user.id}`, limit: 30, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const acceso = await resolverAcceso(supabase, user.id, 'crear_certificados')
    if (!acceso.ok) {
      const msg = acceso.motivo === 'sin-permiso' ? 'Sin permisos para emitir certificados'
                : acceso.motivo === 'sin-tenant'  ? 'Sin tenant asignado'
                : 'Perfil no encontrado'
      return NextResponse.json({ error: msg }, { status: 403 })
    }
    const tenantMedicoId = acceso.tenantMedicoId

    const body = await request.json()
    const result = certificadoSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: result.error.format() }, { status: 400 })
    }

    const insertData = result.data

    // ── Rechazar emisión para pacientes archivados (regla de negocio 9) ──────
    // Un paciente archivado no admite escritura (emitir documentos incluido). Se lee
    // con admin client (bypass RLS): quien emite puede no tener ver_pacientes, y el
    // chequeo debe ser confiable. Se acota al tenant. (Patrón de POST /api/consultas.)
    const admin = createAdminClient()
    const { data: pac, error: pacError } = await admin
      .from('pacientes')
      .select('archivado_at')
      .eq('id', insertData.paciente_id)
      .eq('creado_por', tenantMedicoId)
      .single()

    if (pacError || !pac) {
      return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 })
    }
    if (pac.archivado_at) {
      return NextResponse.json(
        { error: 'El paciente está archivado. Desarchivalo para emitir documentos.' },
        { status: 409 },
      )
    }

    // ── Snapshot del emisor: OBLIGATORIO (a diferencia del PDF, que es best-effort) ──
    // Sin datos del médico no hay documento válido. Si la carga falla, NO se emite.
    let emisorSnapshot
    try {
      emisorSnapshot = await construirEmisorSnapshot(tenantMedicoId)
    } catch (snapErr) {
      console.error('[POST /api/certificados] no se pudo cargar el emisor:', snapErr)
      return NextResponse.json(
        { error: 'No se pudieron cargar los datos del médico firmante; el documento no se emitió.' },
        { status: 500 },
      )
    }

    const { data, error } = await supabase
      .from('certificados')
      .insert({
        ...insertData,
        firmado_por: tenantMedicoId,
        fecha_certificado: insertData.fecha_certificado || hoyAR(),
        emisor_snapshot: emisorSnapshot,
      })
      .select()
      .single()

    if (error) {
      console.error('[POST /api/certificados] DB error:', error)
      return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
    }

    // ── Congelar el PDF al emitir (best-effort) ──────────────────────────────
    // congelarPdfDocumento nunca lanza y corre bajo timeout: si Storage falla o
    // tarda, el certificado queda emitido con pdf_path NULL y la descarga lo regenera.
    const pdfPath = await congelarPdfDocumento('certificado', data, tenantMedicoId, supabase, getBaseUrl(request))
    if (pdfPath) data.pdf_path = pdfPath

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/certificados]', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
