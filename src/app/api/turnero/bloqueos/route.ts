import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { bloqueoAgendaSchema } from '@/lib/validations/turno.schema'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const rl = rateLimit(request, {
      key: `bloqueos_post:${user.id}`,
      limit: 20,
      windowMs: 60 * 60 * 1000 // 1 hour
    })
    if (!rl.success) {
      return rateLimitResponse(rl.retryAfter!)
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, medico_id')
      .eq('id', user.id)
      .single()

    const tenantMedicoId =
      profile?.role === 'medico' ? user.id :
      profile?.role === 'asistente' ? profile?.medico_id :
      null

    if (!tenantMedicoId) {
      return NextResponse.json({ error: 'Tenant inválido' }, { status: 403 })
    }

    const body = await request.json()
    const result = bloqueoAgendaSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: result.error.format() },
        { status: 400 }
      )
    }

    const b = result.data

    // Optionally check if a turn currently falls strictly into this completely new blockage
    const { data: superpuestosTurnos, error: errT } = await supabase
      .from('turnos')
      .select('id')
      .eq('medico_id', tenantMedicoId)
      .lt('fecha_inicio', b.fecha_fin)
      .gt('fecha_fin', b.fecha_inicio)

    if (errT) throw errT

    if (superpuestosTurnos && superpuestosTurnos.length > 0) {
      return NextResponse.json({ error: 'Este bloqueo se solapa con turnos ya agendados. Cancele o mueva los turnos primero.' }, { status: 409 })
    }

    const { data: nuevoBloqueo, error: insertError } = await supabase
      .from('bloqueos_agenda')
      .insert({
        ...b,
        medico_id: tenantMedicoId,
        creado_por: user.id
      })
      .select()
      .single()

    if (insertError) throw insertError

    return NextResponse.json({ data: nuevoBloqueo }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating bloqueo:', error)
    return NextResponse.json({ error: error.message || 'Error del servidor' }, { status: 500 })
  }
}
