import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { consultaSchema } from '@/lib/validations/consulta.schema'
import { buscarSolapamientos, DURACION_TURNO_CONTROL_MS } from '@/lib/agenda/solapamiento'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { formatFechaAR } from '@/lib/utils/format-date'
import { resolverAcceso } from '@/lib/auth/tenant'

export const dynamic = 'force-dynamic'

// ── Helpers ────────────────────────────────────────────────────

// ── GET /api/consultas?paciente_id=&page=&limit= ───────────────

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rl = await rateLimit(request, { key: `consultas_get:${user.id}`, limit: 60, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const acceso = await resolverAcceso(supabase, user.id, 'ver_historia_clinica')
    if (!acceso.ok) {
      const msg = acceso.motivo === 'sin-permiso' ? 'Sin permisos para ver historias clínicas'
                : acceso.motivo === 'sin-tenant'  ? 'No tenés un médico asignado'
                : 'Perfil no encontrado'
      return NextResponse.json({ error: msg }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const pacienteId = searchParams.get('paciente_id')
    const page  = Math.max(1, parseInt(searchParams.get('page')  || '1'))
    const limit = Math.min(50, parseInt(searchParams.get('limit') || '20'))
    const from  = (page - 1) * limit
    const to    = from + limit - 1

    if (!pacienteId) {
      return NextResponse.json({ error: 'paciente_id es requerido' }, { status: 400 })
    }

    const { data, error, count } = await supabase
      .from('consultas')
      .select('*', { count: 'exact' })
      .eq('paciente_id', pacienteId)
      .eq('medico_id', acceso.tenantMedicoId)
      .order('fecha_hora', { ascending: false })
      .range(from, to)

    if (error) throw error

    return NextResponse.json({
      data,
      meta: { total: count ?? 0, page, limit },
    })
  } catch (error) {
    console.error('[GET /api/consultas]', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

// ── POST /api/consultas ────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rl = await rateLimit(request, { key: `consultas_post:${user.id}`, limit: 20, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const acceso = await resolverAcceso(supabase, user.id, 'crear_consultas')
    if (!acceso.ok) {
      const msg = acceso.motivo === 'sin-permiso' ? 'Sin permisos para registrar consultas'
                : acceso.motivo === 'sin-tenant'  ? 'No tenés un médico asignado'
                : 'Perfil no encontrado'
      return NextResponse.json({ error: msg }, { status: 403 })
    }

    const body = await request.json()
    const result = consultaSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: result.error.format() },
        { status: 400 }
      )
    }

    const consulta = result.data

    // ── Rechazar consultas para pacientes archivados (P5) ──────
    // Un paciente archivado conserva su HC (lectura), pero no admite consultas nuevas.
    // Se lee con admin client (bypass RLS): quien crea consultas puede no tener
    // ver_pacientes, y aun así el chequeo debe ser confiable. Se acota al tenant.
    const admin = createAdminClient()
    const { data: pac, error: pacError } = await admin
      .from('pacientes')
      .select('archivado_at')
      .eq('id', consulta.paciente_id)
      .eq('creado_por', acceso.tenantMedicoId)
      .single()

    if (pacError || !pac) {
      return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 })
    }
    if (pac.archivado_at) {
      return NextResponse.json(
        { error: 'El paciente está archivado. Desarchivalo para registrar nuevas consultas.' },
        { status: 409 }
      )
    }

    // ── ¿Corresponde agendar el turno del próximo control? ─────────────────────
    // SOLO si la consulta NACE finalizada. El formulario usa POST cuando la consulta
    // es nueva, así que por acá pasan los dos casos: "guardar borrador" (provisorio,
    // no agenda nada) y "cargar y finalizar de una" (el flujo normal del médico, que
    // SÍ agenda). Por eso el bloque de creación del turno no se elimina: se condiciona.
    const debeAgendarTurno = consulta.estado === 'finalizada' && !!consulta.proximo_turno_sugerido

    // ── Validar solapamiento del próximo control ANTES de guardar ──
    // Bajo la MISMA condición que la creación: si el turno no se va a crear, un
    // solapamiento no tiene por qué rechazar con 409 el guardado de un borrador.
    //
    // El criterio de "franja ocupada" sale de `lib/agenda/solapamiento.ts`, igual que en
    // los 4 sitios del turnero. ⚠ Eso CAMBIA el criterio que había acá: antes se excluía
    // solo `cancelado` y se filtraba `categoria = 'turno_medico'`; ahora ocupan los cuatro
    // estados vivos y choca contra turnos de cualquier categoría. Es intencional — este
    // endpoint tenía su propia definición de "ocupado", distinta de la del turnero.
    if (debeAgendarTurno) {
      const fechaBase      = new Date(consulta.proximo_turno_sugerido!)
      const fechaFin       = new Date(fechaBase.getTime() + DURACION_TURNO_CONTROL_MS)
      const fechaIsoInicio = fechaBase.toISOString()
      const fechaIsoFin    = fechaFin.toISOString()

      const { hayTurnoSolapado, hayBloqueoSolapado } = await buscarSolapamientos({
        supabase,
        medicoId: acceso.tenantMedicoId,
        inicio: fechaIsoInicio,
        fin: fechaIsoFin,
      })

      if (hayTurnoSolapado || hayBloqueoSolapado) {
        return NextResponse.json(
          { error: 'El horario del próximo control se solapa con un bloqueo o turno existente. Elegí otro horario o dejá el campo vacío.' },
          { status: 409 }
        )
      }
    }

    // ── Insertar la consulta ──────────────────────────────────
    const { data: nueva, error: insertError } = await supabase
      .from('consultas')
      .insert({
        ...consulta,
        medico_id: acceso.tenantMedicoId,
        // Autor de la consulta (migración 038). `medico_id` es el TENANT, no quién
        // la escribió: sin esta columna la regla "descarta el médico o el asistente
        // que lo creó" no se puede expresar. Lo fija el servidor, nunca el cliente.
        creado_por: user.id,
      })
      .select()
      .single()

    if (insertError) throw insertError

    // ── Agendar el turno de control — solo si la consulta nace finalizada ──
    // ⚠ La consulta YA está guardada. Si el turno falla, NO se revierte nada ni se
    // responde error: se informa con `turnoAgendado: false` y la UI avisa. Misma
    // política que el insert de la notificación en `api/turnero/route.ts`.
    //
    // `turnoAgendado` viaja SOLO cuando correspondía agendar algo: undefined → no había
    // nada que agendar · true → quedó en la agenda · false → no se pudo (+ `turnoError`).
    // Los `undefined` los descarta JSON.stringify, así que la respuesta de un borrador
    // queda idéntica a la de antes: `{ data }` y nada más.
    let turnoAgendado: boolean | undefined
    let turnoError: string | undefined

    if (debeAgendarTurno) {
      const fechaBase      = new Date(consulta.proximo_turno_sugerido!)
      const fechaFin       = new Date(fechaBase.getTime() + DURACION_TURNO_CONTROL_MS)
      const fechaIsoInicio = fechaBase.toISOString()
      const fechaIsoFin    = fechaFin.toISOString()

      // Evitar duplicado: si ya existe un turno desde HC para esta consulta
      const { data: existente } = await supabase
        .from('turnos')
        .select('id')
        .eq('consulta_id', nueva.id)
        .maybeSingle()

      if (!existente) {
        // ⚠ Zona AR fija: este texto se PERSISTE en `turnos.notas`. Con el
        // `toLocaleDateString` anterior se formateaba en la zona del runtime (UTC en
        // Vercel), así que una consulta cargada después de las 21:00 ART quedaba con la
        // fecha del día siguiente escrita en la nota, para siempre. `dd/MM/yyyy` replica
        // exactamente la forma que producía es-AR con day/month '2-digit' (13/08/2026).
        const fechaConsulta = formatFechaAR(consulta.fecha_hora, 'dd/MM/yyyy')
        const { error: insertTurnoError } = await supabase.from('turnos').insert({
          paciente_id:  consulta.paciente_id,
          fecha_inicio: fechaIsoInicio,
          fecha_fin:    fechaIsoFin,
          motivo:       'Control médico programado',
          notas:        `Turno generado desde historia clínica — Consulta del ${fechaConsulta}`,
          estado:       'confirmado',
          categoria:    'turno_medico',
          origen:       'desde_hc',
          consulta_id:  nueva.id,
          medico_id:    acceso.tenantMedicoId,
          agendado_por: user.id,
        })

        if (insertTurnoError) {
          // Causa típica: asistente sin `gestionar_turnos` (turnos_insert lo rechaza).
          // Se loguea sin datos del paciente (Ley 25.326): solo el id de la consulta.
          console.error('[POST /api/consultas] turno no agendado', { consultaId: nueva.id, error: insertTurnoError })
          turnoAgendado = false
          turnoError = 'No se pudo agendar el turno de control en la agenda.'
        } else {
          turnoAgendado = true
        }
      } else {
        // Ya había un turno para esta consulta: nada que hacer, y no es un fallo.
        turnoAgendado = true
      }
    }

    return NextResponse.json({ data: nueva, turnoAgendado, turnoError }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/consultas]', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
