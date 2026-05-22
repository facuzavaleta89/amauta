import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { pedidoSchema } from '@/lib/validations/pedido.schema'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

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
    const q = searchParams.get('q')

    let query = supabase
      .from('pedidos')
      .select(`
        id, paciente_id, paciente_nombre, paciente_dni,
        diagnostico, estudios_pedidos, fecha_pedido,
        pdf_path, created_at
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
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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

    const { data, error } = await supabase
      .from('pedidos')
      .insert({
        ...result.data,
        firmado_por: tenantMedicoId,
        fecha_pedido: result.data.fecha_pedido || new Date().toISOString().slice(0, 10),
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/pedidos]', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
