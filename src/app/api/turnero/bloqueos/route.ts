import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { bloqueoAgendaSchema } from '@/lib/validations/turno.schema'
import { buscarSolapamientos } from '@/lib/agenda/solapamiento'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const rl = await rateLimit(request, {
      key: `bloqueos_post:${user.id}`,
      limit: 20,
      windowMs: 60 * 60 * 1000 // 1 hour
    })
    if (!rl.success) {
      return rateLimitResponse(rl.retryAfter!)
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, medico_id, gestionar_turnos')
      .eq('id', user.id)
      .single()

    if (profile?.role === 'asistente' && profile?.gestionar_turnos === false) {
      return NextResponse.json({ error: 'No tenés permisos para modificar la agenda.' }, { status: 403 })
    }

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

    // ── Verificación de solapamiento ───────────────────────────
    // Criterio único del proyecto: `lib/agenda/solapamiento.ts`. Un bloqueo pisa turnos de
    // CUALQUIER categoría (curso, personal, administrativo…), no solo los turno_medico —
    // eso ya era así acá y el helper lo mantiene, ahora para todos los sitios por igual.
    // También choca contra otros bloqueos.
    const { hayTurnoSolapado, hayBloqueoSolapado } = await buscarSolapamientos({
      supabase,
      medicoId: tenantMedicoId,
      inicio: b.fecha_inicio,
      fin: b.fecha_fin,
    })

    if (hayTurnoSolapado) {
      return NextResponse.json({ error: 'Este bloqueo se solapa con turnos ya agendados. Cancele o mueva los turnos primero.' }, { status: 409 })
    }

    if (hayBloqueoSolapado) {
      return NextResponse.json({ error: 'Este bloqueo se solapa con otro bloqueo ya existente en la agenda.' }, { status: 409 })
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
  } catch (error) {
    console.error('Error creating bloqueo:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
