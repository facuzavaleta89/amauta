import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { pedidoSchema } from '@/lib/validations/pedido.schema'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { congelarPdfDocumento, getBaseUrl, construirEmisorSnapshot } from '@/lib/pdf/documentos'

// ── Helpers ──────────────────────────────────────────────────

async function getTenantMedicoId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, medico_id')
    .eq('id', userId)
    .single()

  if (!profile) return null
  return profile.role === 'medico' ? userId : profile.medico_id ?? null
}

// ── GET /api/pedidos ──────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rl = rateLimit(request, { key: `pedidos_get:${user.id}`, limit: 60, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const tenantMedicoId = await getTenantMedicoId(supabase, user.id)
    if (!tenantMedicoId) return NextResponse.json({ error: 'Sin tenant asignado' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const pacienteId = searchParams.get('paciente_id')
    const rawQ = searchParams.get('q')
    const q = rawQ ? rawQ.slice(0, 100) : null

    let query = supabase
      .from('pedidos')
      .select(`
        id, paciente_id, paciente_nombre, paciente_dni,
        diagnostico, estudios_pedidos, fecha_pedido,
        pdf_path, created_at, codigo_verificacion, estado
      `)
      .order('fecha_pedido', { ascending: false })

    // Filtrar por tenant (via pacientes.creado_por)
    // RLS ya filtra, pero añadimos explícito para el join
    if (pacienteId) {
      query = query.eq('paciente_id', pacienteId)
    }
    if (q) {
      query = query.ilike('paciente_nombre', `%${q}%`)
    }

    const { data, error } = await query.limit(50)
    if (error) {
      console.error('[GET /api/pedidos] DB error:', error)
      return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('[GET /api/pedidos]', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

// ── POST /api/pedidos ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rl = rateLimit(request, { key: `pedidos_post:${user.id}`, limit: 30, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const tenantMedicoId = await getTenantMedicoId(supabase, user.id)
    if (!tenantMedicoId) return NextResponse.json({ error: 'Sin tenant asignado' }, { status: 403 })

    const body = await request.json()
    const result = pedidoSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: result.error.format() }, { status: 400 })
    }

    // ── Rechazar emisión para pacientes archivados (regla de negocio 9) ──────
    // Un paciente archivado no admite escritura (emitir documentos incluido). Se lee
    // con admin client (bypass RLS): quien emite puede no tener ver_pacientes, y el
    // chequeo debe ser confiable. Se acota al tenant. (Patrón de POST /api/consultas.)
    const admin = createAdminClient()
    const { data: pac, error: pacError } = await admin
      .from('pacientes')
      .select('archivado_at')
      .eq('id', result.data.paciente_id)
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
      console.error('[POST /api/pedidos] no se pudo cargar el emisor:', snapErr)
      return NextResponse.json(
        { error: 'No se pudieron cargar los datos del médico firmante; el documento no se emitió.' },
        { status: 500 },
      )
    }

    const { data, error } = await supabase
      .from('pedidos')
      .insert({
        ...result.data,
        firmado_por: tenantMedicoId,
        fecha_pedido: result.data.fecha_pedido || new Date().toISOString().slice(0, 10),
        emisor_snapshot: emisorSnapshot,
      })
      .select()
      .single()

    if (error) {
      console.error('[POST /api/pedidos] DB error:', error)
      return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
    }

    // ── Congelar el PDF al emitir (best-effort) ──────────────────────────────
    // congelarPdfDocumento nunca lanza y corre bajo timeout: si Storage falla o
    // tarda, el pedido queda emitido con pdf_path NULL y la descarga lo regenera.
    const pdfPath = await congelarPdfDocumento('pedido', data, tenantMedicoId, supabase, getBaseUrl(request))
    if (pdfPath) data.pdf_path = pdfPath

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/pedidos]', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
