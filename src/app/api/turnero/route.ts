import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { turnoSchema } from '@/lib/validations/turno.schema'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, medico_id')
      .eq('id', user.id)
      .single()

    const tenantMedicoId =
      profile?.role === 'medico' ? user.id :
      profile?.role === 'asistente' ? profile?.medico_id :
      null

    if (!tenantMedicoId) {
      return NextResponse.json({ error: `Tenant inválido. Profile: ${JSON.stringify(profile)}. Error: ${JSON.stringify(profileError)}. Role: ${profile?.role}` }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('start')
    const endDate = searchParams.get('end')

    // Start building queries
    let turnosQuery = supabase
      .from('turnos')
      .select('*, paciente:paciente_id (id, nombre_completo)')
      .eq('medico_id', tenantMedicoId)

    let bloqueosQuery = supabase
      .from('bloqueos_agenda')
      .select('*')
      .eq('medico_id', tenantMedicoId)

    if (startDate && endDate) {
      turnosQuery = turnosQuery.gte('fecha_inicio', startDate).lte('fecha_fin', endDate)
      bloqueosQuery = bloqueosQuery.gte('fecha_inicio', startDate).lte('fecha_fin', endDate)
    }

    const [turnosRes, bloqueosRes] = await Promise.all([turnosQuery, bloqueosQuery])

    if (turnosRes.error) throw turnosRes.error
    if (bloqueosRes.error) throw bloqueosRes.error

    return NextResponse.json({
      turnos: turnosRes.data,
      bloqueos: bloqueosRes.data
    })
  } catch (error: any) {
    console.error('Error fetching turnos:', error)
    return NextResponse.json({ error: error.message || 'Error del servidor' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, medico_id')
      .eq('id', user.id)
      .single()

    const tenantMedicoId =
      profile?.role === 'medico' ? user.id :
      profile?.role === 'asistente' ? profile?.medico_id :
      null

    if (!tenantMedicoId) {
      return NextResponse.json({ error: `Tenant inválido. Profile: ${JSON.stringify(profile)}. Error: ${JSON.stringify(profileError)}. Role: ${profile?.role}` }, { status: 403 })
    }

    const body = await request.json()
    const result = turnoSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: result.error.format() },
        { status: 400 }
      )
    }

    const t = result.data

    // Check for overlaps in Turnos
    const { data: superpuestosTurnos, error: errT } = await supabase
      .from('turnos')
      .select('id')
      .eq('medico_id', tenantMedicoId)
      .lt('fecha_inicio', t.fecha_fin)
      .gt('fecha_fin', t.fecha_inicio)

    if (errT) throw errT

    if (superpuestosTurnos && superpuestosTurnos.length > 0) {
      return NextResponse.json({ error: 'El horario seleccionado se solapa con otro turno.' }, { status: 409 })
    }

    // Check overlaps with Bloqueos
    const { data: superpuestosBloques, error: errB } = await supabase
      .from('bloqueos_agenda')
      .select('id')
      .eq('medico_id', tenantMedicoId)
      .lt('fecha_inicio', t.fecha_fin)
      .gt('fecha_fin', t.fecha_inicio)

    if (errB) throw errB

    if (superpuestosBloques && superpuestosBloques.length > 0) {
      return NextResponse.json({ error: 'El horario coincide con un bloqueo de la agenda del médico.' }, { status: 409 })
    }

    const { data: nuevoTurno, error: insertError } = await supabase
      .from('turnos')
      .insert({
        ...t,
        medico_id: tenantMedicoId,
        agendado_por: user.id
      })
      .select()
      .single()

    if (insertError) throw insertError

    // -- INICIO NOTIFICACIONES --
    if (profile?.role === 'asistente') {
      const asistenteName = user.user_metadata?.nombre_completo || user.email || 'Un asistente';
      const pacienteInfo = t.paciente_nombre_libre || 'un paciente';
      const fechaCorta = new Date(t.fecha_inicio).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
      
      await supabase.from('notificaciones').insert({
        medico_id: tenantMedicoId,
        titulo: 'Nuevo turno agendado',
        mensaje: `${asistenteName} agendó un turno para ${pacienteInfo} el ${fechaCorta}`,
        tipo: 'turno_creado',
        payload: { turno_id: nuevoTurno.id, fecha: t.fecha_inicio }
      })
    }
    // -- FIN NOTIFICACIONES --

    return NextResponse.json({ data: nuevoTurno }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating turno:', error)
    return NextResponse.json({ error: error.message || 'Error del servidor' }, { status: 500 })
  }
}
