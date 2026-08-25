import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { turnoSchema } from '@/lib/validations/turno.schema'
import { buscarSolapamientos } from '@/lib/agenda/solapamiento'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { formatFechaAR } from '@/lib/utils/format-date'
import { resolverAcceso } from '@/lib/auth/tenant'

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

    const acceso = await resolverAcceso(supabase, user.id, ['ver_turnos', 'gestionar_turnos'])
    if (!acceso.ok) {
      const msg = acceso.motivo === 'sin-permiso' ? 'No tenés permisos para ver los turnos.'
                : acceso.motivo === 'sin-tenant'  ? 'Sin tenant asignado'
                : 'Perfil no encontrado'
      return NextResponse.json({ error: msg }, { status: 403 })
    }
    const tenantMedicoId = acceso.tenantMedicoId

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
  } catch (error) {
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

    const acceso = await resolverAcceso(supabase, user.id, 'gestionar_turnos')
    if (!acceso.ok) {
      const msg = acceso.motivo === 'sin-permiso' ? 'No tenés permisos para modificar la agenda.'
                : acceso.motivo === 'sin-tenant'  ? 'Sin tenant asignado'
                : 'Perfil no encontrado'
      return NextResponse.json({ error: msg }, { status: 403 })
    }
    const tenantMedicoId = acceso.tenantMedicoId

    const body = await request.json()
    const result = turnoSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: result.error.format() },
        { status: 400 }
      )
    }

    const t = result.data

    // ── Verificación de solapamiento ───────────────────────────
    // Criterio único del proyecto: `lib/agenda/solapamiento.ts`. Dos cambios respecto de
    // lo que había acá inline: los estados que ocupan ahora son una lista de INCLUSIÓN, y
    // el chequeo turno-vs-turno **ya no filtra por categoría** — la agenda modela la
    // disponibilidad física del médico, así que un curso o un turno personal ocupan la
    // franja igual que un turno_medico. Por eso tampoco hay guarda `if (categoria === …)`:
    // TODAS las categorías se chequean contra turnos y contra bloqueos.
    const { hayTurnoSolapado, hayBloqueoSolapado } = await buscarSolapamientos({
      supabase,
      medicoId: tenantMedicoId,
      inicio: t.fecha_inicio,
      fin: t.fecha_fin,
    })

    if (hayTurnoSolapado) {
      return NextResponse.json({ error: 'El horario seleccionado se solapa con otro turno de la agenda.' }, { status: 409 })
    }

    if (hayBloqueoSolapado) {
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
        medico_id:            tenantMedicoId,
        agendado_por:         user.id,
      })
      .select()
      .single()

    if (insertError) throw insertError

    // -- INICIO NOTIFICACIONES --
    // El rol sale del mismo profile que ya leyó `resolverAcceso`.
    if (acceso.role === 'asistente') {
      const asistenteName = user.user_metadata?.nombre_completo || user.email || 'Un asistente';
      const pacienteInfo = t.paciente_nombre_libre || 'un paciente';
      const fechaCorta = formatFechaAR(t.fecha_inicio, 'dd/MM/yyyy HH:mm');
      
      const { error: notifError } = await supabase.from('notificaciones').insert({
        medico_id: tenantMedicoId,
        titulo: 'Nuevo turno agendado',
        mensaje: `${asistenteName} agendó un turno para ${pacienteInfo} el ${fechaCorta}`,
        tipo: 'turno_creado',
        payload: { turno_id: nuevoTurno.id, fecha: t.fecha_inicio }
      })

      // El aviso es secundario: el turno YA se creó, así que un fallo acá NO debe
      // tumbar el POST. Pero tampoco puede pasar en silencio (antes ni siquiera se
      // miraba el error). Se loguea SIN datos personales del paciente (Ley 25.326):
      // solo el id del turno y el error de Postgres.
      if (notifError) {
        console.error(`Error creando la notificación del turno ${nuevoTurno.id}:`, notifError)
      }
    }
    // -- FIN NOTIFICACIONES --
    // Sin `revalidatePath` a propósito: este POST corre en la request del ASISTENTE,
    // y el badge del médico se arma en el layout que renderiza SU sesión, en SU
    // navegador. Invalidar caché acá no cruza de una sesión a la otra, así que no
    // adelantaría nada. Que el aviso aparezca al instante es trabajo del Realtime
    // sobre `notificaciones` (tanda aparte: requiere sumarla a la publicación
    // supabase_realtime). Hasta entonces el médico lo ve en su próxima carga completa.

    return NextResponse.json({ data: nuevoTurno }, { status: 201 })
  } catch (error) {
    console.error('Error creating turno:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
