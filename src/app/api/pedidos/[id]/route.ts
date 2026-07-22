import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { pedidoSchema } from '@/lib/validations/pedido.schema'
import { uuidSchema } from '@/lib/validations/shared'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

interface RouteParams {
  params: Promise<{ id: string }>
}

async function getTenantMedicoId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, medico_id')
    .eq('id', userId)
    .single()
  return profile?.role === 'medico' ? userId : profile?.medico_id ?? null
}

// ── GET /api/pedidos/[id] ─────────────────────────────────────

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const idValidation = uuidSchema.safeParse(id)
    if (!idValidation.success) {
      return NextResponse.json({ error: 'ID de pedido inválido' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rl = rateLimit(request, { key: `pedidos_get_one:${user.id}`, limit: 120, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const tenantMedicoId = await getTenantMedicoId(supabase, user.id)
    if (!tenantMedicoId) return NextResponse.json({ error: 'Sin tenant asignado' }, { status: 403 })

    const { data, error } = await supabase
      .from('pedidos')
      .select('*')
      .eq('id', id)
      .eq('firmado_por', tenantMedicoId)
      .single()

    if (error || !data) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    return NextResponse.json({ data })
  } catch (err) {
    console.error('[GET /api/pedidos/[id]]', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

// ── PATCH /api/pedidos/[id] ───────────────────────────────────
// Solo permite actualizar campos clínicos, nunca metadatos como firmado_por o paciente_id

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const idValidation = uuidSchema.safeParse(id)
    if (!idValidation.success) {
      return NextResponse.json({ error: 'ID de pedido inválido' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rl = rateLimit(request, { key: `pedidos_patch:${user.id}`, limit: 30, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const tenantMedicoId = await getTenantMedicoId(supabase, user.id)
    if (!tenantMedicoId) return NextResponse.json({ error: 'Sin tenant asignado' }, { status: 403 })

    // Verificar tenant
    const { data: existing, error: findError } = await supabase
      .from('pedidos')
      .select('id')
      .eq('id', id)
      .eq('firmado_por', tenantMedicoId)
      .single()

    if (findError || !existing) {
      return NextResponse.json({ error: 'Pedido no encontrado o sin permisos' }, { status: 404 })
    }

    const body = await request.json()

    // Validar con schema parcial — nunca pasamos firmado_por ni paciente_id en el update
    const result = pedidoSchema
      .pick({ diagnostico: true, estudios_pedidos: true, indicaciones: true, fecha_pedido: true })
      .partial()
      .safeParse(body)

    if (!result.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: result.error.format() }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('pedidos')
      .update(result.data)
      .eq('id', id)
      .eq('firmado_por', tenantMedicoId)
      .select()
      .single()

    if (error) {
      console.error('[PATCH /api/pedidos/[id]] DB error:', error)
      return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('[PATCH /api/pedidos/[id]]', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

// Los pedidos no se borran: se ANULAN (ver /api/pedidos/[id]/anular). La documentación
// clínica debe conservarse (Ley 26.529). El handler DELETE fue removido a propósito.
