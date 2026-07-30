import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { turnoSchema } from '@/lib/validations/turno.schema'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { formatFechaAR } from '@/lib/utils/format-date'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const rl = await rateLimit(request, { key: `turnero_get:${user.id}`, limit: 120, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, medico_id, ver_turnos')
      .eq('id', user.id)
      .single()

    if (profile?.role === 'asistente' && profile?.ver_turnos === false) {
      return NextResponse.json({ error: 'No tenés permisos para ver los turnos.' }, { status: 403 })
    }

    const tenantMedicoId =
      profile?.role === 'medico' ? user.id :
      profile?.role === 'asistente' ? profile?.medico_id :
      null

    if (!tenantMedicoId) {
      return NextResponse.json({ error: 'Sin tenant asignado' }, { status: 403 })
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
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const rl = await rateLimit(request, {
      key: `turnero_post:${user.id}`,
      limit: 30,
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
      return NextResponse.json({ error: 'Sin tenant asignado' }, { status: 403 })
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

    // ── Verificación de solapamiento según categoría ──────────
    // turno_medico: verifica contra otros turno_medico activos (excluye pendiente_confirmar y cancelado)
    // otras categorías: solo verifica contra bloqueos de agenda
    if (t.categoria === 'turno_medico') {
      const { data: superpuestosTurnos, error: errT } = await supabase
        .from('turnos')
        .select('id')
        .eq('medico_id', tenantMedicoId)
        .eq('categoria', 'turno_medico')
        .not('estado', 'in', '(pendiente_confirmar,cancelado)')
        .lt('fecha_inicio', t.fecha_fin)
        .gt('fecha_fin', t.fecha_inicio)

      if (errT) throw errT
      if (superpuestosTurnos && superpuestosTurnos.length > 0) {
        return NextResponse.json({ error: 'El horario seleccionado se solapa con otro turno médico.' }, { status: 409 })
      }
    }

    // Todos verifican contra bloqueos
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
        paciente_id:          t.paciente_id ?? null,
        paciente_nombre_libre: t.paciente_nombre_libre ?? null,
        fecha_inicio:         t.fecha_inicio,
        fecha_fin:            t.fecha_fin,
        motivo:               t.motivo ?? null,
        notas:                t.notas ?? null,
        estado:               t.estado ?? 'pendiente',
        categoria:            t.categoria ?? 'turno_medico',
        origen:               t.origen ?? 'manual',
        consulta_id:          t.consulta_id ?? null,
        color:                t.color ?? null,
        medico_id:            tenantMedicoId,
        agendado_por:         user.id,
      })
      .select()
      .single()

    if (insertError) throw insertError

    // -- INICIO NOTIFICACIONES --
    if (profile?.role === 'asistente') {
      const asistenteName = user.user_metadata?.nombre_completo || user.email || 'Un asistente';
      const pacienteInfo = t.paciente_nombre_libre || 'un paciente';
      const fechaCorta = formatFechaAR(t.fecha_inicio, 'dd/MM/yyyy HH:mm');
      
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
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
