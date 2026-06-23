import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { uuidSchema } from '@/lib/validations/shared'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const idValidation = uuidSchema.safeParse(id)
    if (!idValidation.success) {
      return NextResponse.json({ error: 'ID de pedido inválido' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rl = rateLimit(request, { key: `pedidos_anular:${user.id}`, limit: 10, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    // Obtener rol y verificar que sea médico
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'medico') {
      return NextResponse.json({ error: 'Solo el médico titular puede anular documentos' }, { status: 403 })
    }

    // Actualizar estado del pedido a 'revocado'
    const { data, error } = await supabase
      .from('pedidos')
      .update({ estado: 'revocado' })
      .eq('id', id)
      .eq('firmado_por', user.id) // El médico es dueño de sus pedidos firmados
      .select()
      .single()

    if (error || !data) {
      console.error('[POST /api/pedidos/[id]/anular] Error:', error)
      return NextResponse.json({ error: 'Pedido no encontrado o sin permisos' }, { status: 404 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('[POST /api/pedidos/[id]/anular]', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
