import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { consultaSchema } from '@/lib/validations/consulta.schema'
import { buscarSolapamientos, DURACION_TURNO_CONTROL_MS } from '@/lib/agenda/solapamiento'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { formatFechaAR } from '@/lib/utils/format-date'
import { resolverAcceso } from '@/lib/auth/tenant'

interface RouteContext {
  params: Promise<{ id: string }>
}

// ── GET /api/consultas/[id] ───────────────────────────────────

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rl = await rateLimit(request, { key: `consulta_get_one:${user.id}`, limit: 120, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const acceso = await resolverAcceso(supabase, user.id, 'ver_historia_clinica')
    if (!acceso.ok) {
      const msg = acceso.motivo === 'sin-permiso' ? 'Sin permisos'
                : acceso.motivo === 'sin-tenant'  ? 'No tenés un médico asignado'
                : 'Perfil no encontrado'
      return NextResponse.json({ error: msg }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('consultas')
      .select('*')
      .eq('id', id)
      .eq('medico_id', acceso.tenantMedicoId)
      .single()

    if (error || !data) return NextResponse.json({ error: 'Consulta no encontrada' }, { status: 404 })

    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

// ── PATCH /api/consultas/[id] ─────────────────────────────────
// Solo permite editar consultas en estado 'borrador'

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rl = await rateLimit(request, { key: `consulta_patch:${user.id}`, limit: 30, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const body = await request.json()
    const requiereFinalizar = body.estado === 'finalizada'
    const permiso = requiereFinalizar ? 'finalizar_consultas' : 'crear_consultas'

    const acceso = await resolverAcceso(supabase, user.id, permiso)
    if (!acceso.ok) {
      const msg = acceso.motivo === 'sin-permiso' ? 'Sin permisos'
                : acceso.motivo === 'sin-tenant'  ? 'No tenés un médico asignado'
                : 'Perfil no encontrado'
      return NextResponse.json({ error: msg }, { status: 403 })
    }

    // Verificar que la consulta existe y pertenece al tenant
    const { data: existing, error: fetchError } = await supabase
      .from('consultas')
      // `proximo_turno_sugerido` ya no se proyecta: se usaba solo para el viejo
      // `turnoHaCambiado`, y esa comparación no decide nada ahora (decide finalizar).
      .select('id, estado')
      .eq('id', id)
      .eq('medico_id', acceso.tenantMedicoId)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Consulta no encontrada' }, { status: 404 })
    }

    if (existing.estado === 'finalizada') {
      return NextResponse.json(
        { error: 'Una consulta finalizada no puede editarse.' },
        { status: 403 }
      )
    }

    // Para PATCH no requerimos paciente_id (ya existe)
    const result = consultaSchema.safeParse({ ...body, paciente_id: body.paciente_id || 'placeholder-will-not-insert' })

    if (!result.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: result.error.format() },
        { status: 400 }
      )
    }

    const { paciente_id: _pid, ...updates } = result.data

    const nuevoTurno = updates.proximo_turno_sugerido

    // ── ¿Corresponde agendar el turno del próximo control? ─────────────────────
    // SOLO en la TRANSICIÓN borrador → finalizada. Un borrador es provisorio: mientras
    // la consulta no se finaliza, su próximo control es una intención, no un turno.
    // (Hasta esta tanda, guardar un borrador ya metía un turno real en la agenda.)
    //
    // `requiereFinalizar` (:97) ES esa transición, sin necesidad de comparar contra el
    // estado anterior: la guarda de más arriba rechaza con 403 toda consulta que YA
    // estuviera finalizada, así que acá `existing.estado` solo puede ser 'borrador'.
    // Se lo chequea igual como defensa en profundidad — si alguien aflojara esa guarda,
    // esta condición evita que re-guardar una finalizada vuelva a agendar el turno.
    const debeAgendarTurno = requiereFinalizar && existing.estado === 'borrador' && !!nuevoTurno

    // ── Validar solapamiento del próximo control ANTES de actualizar ──
    // Va bajo la MISMA condición que la creación: si el turno no se va a crear, un
    // solapamiento no tiene por qué rechazar con 409 el guardado de un borrador.
    //
    // El criterio de "franja ocupada" sale de `lib/agenda/solapamiento.ts`, igual que en
    // los 4 sitios del turnero. ⚠ Eso CAMBIA el criterio que había acá: antes se excluía
    // solo `cancelado` y se filtraba `categoria = 'turno_medico'`; ahora ocupan los cuatro
    // estados vivos y choca contra turnos de cualquier categoría. Es intencional — este
    // endpoint tenía su propia definición de "ocupado", distinta de la del turnero.
    if (debeAgendarTurno) {
      const fechaBase      = new Date(nuevoTurno!)
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

    const { data: updated, error: updateError } = await supabase
      .from('consultas')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (updateError) throw updateError

    // ── Agendar el turno de control — solo al finalizar (ver `debeAgendarTurno`) ──
    // ⚠ La consulta YA quedó finalizada arriba. Si el turno falla, NO se revierte nada
    // ni se responde error: se informa con `turnoAgendado: false` y la UI avisa. Misma
    // política que el insert de la notificación en `api/turnero/route.ts` — el acto
    // principal ya ocurrió, el secundario no puede tumbarlo.
    // `turnoAgendado` viaja en la respuesta SOLO cuando correspondía agendar algo:
    // undefined → no había nada que agendar (no fue una finalización, o sin próximo
    // control) · true → el turno quedó en la agenda · false → no se pudo, y va con
    // `turnoError`. Los `undefined` los descarta JSON.stringify, así que la respuesta
    // de un guardado de borrador queda idéntica a la de antes: `{ data }` y nada más.
    let turnoAgendado: boolean | undefined
    let turnoError: string | undefined

    if (debeAgendarTurno) {
      const fechaBase      = new Date(nuevoTurno!)
      const fechaFin       = new Date(fechaBase.getTime() + DURACION_TURNO_CONTROL_MS)
      const fechaIsoInicio = fechaBase.toISOString()
      const fechaIsoFin    = fechaFin.toISOString()

      const pacienteRes = await supabase
        .from('consultas')
        .select('paciente_id, fecha_hora')
        .eq('id', id)
        .single()

      if (pacienteRes.data) {
        // Evitar duplicado para la misma consulta
        const { data: existente } = await supabase
          .from('turnos')
          .select('id')
          .eq('consulta_id', id)
          .maybeSingle()

        if (!existente) {
          // ⚠ Zona AR fija: este texto se PERSISTE en `turnos.notas`. Ver el mismo
          // bloque en `api/consultas/route.ts` — `dd/MM/yyyy` replica la forma que
          // producía el `toLocaleDateString('es-AR', …)` anterior (13/08/2026), que
          // formateaba en la zona del runtime (UTC en Vercel).
          const fechaConsulta = formatFechaAR(pacienteRes.data.fecha_hora, 'dd/MM/yyyy')
          const { error: insertTurnoError } = await supabase.from('turnos').insert({
            paciente_id:  pacienteRes.data.paciente_id,
            fecha_inicio: fechaIsoInicio,
            fecha_fin:    fechaIsoFin,
            motivo:       'Control médico programado',
            notas:        `Turno generado desde historia clínica — Consulta del ${fechaConsulta}`,
            estado:       'confirmado',
            categoria:    'turno_medico',
            origen:       'desde_hc',
            consulta_id:  id,
            medico_id:    acceso.tenantMedicoId,
            agendado_por: user.id,
          })

          if (insertTurnoError) {
            // Causa típica: asistente sin `gestionar_turnos` (turnos_insert lo rechaza).
            // Se loguea sin datos del paciente (Ley 25.326): solo el id de la consulta.
            console.error('[PATCH /api/consultas/[id]] turno no agendado', { consultaId: id, error: insertTurnoError })
            turnoAgendado = false
            turnoError = 'No se pudo agendar el turno de control en la agenda.'
          } else {
            turnoAgendado = true
          }
        } else {
          // Ya había un turno para esta consulta: nada que hacer, y no es un fallo.
          turnoAgendado = true
        }
      } else {
        console.error('[PATCH /api/consultas/[id]] turno no agendado: consulta ilegible', { consultaId: id })
        turnoAgendado = false
        turnoError = 'No se pudo agendar el turno de control en la agenda.'
      }
    }

    return NextResponse.json({ data: updated, turnoAgendado, turnoError })
  } catch (error) {
    console.error('[PATCH /api/consultas/[id]]', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

// ── DELETE /api/consultas/[id] ────────────────────────────────
// Solo permite eliminar borradores

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rl = await rateLimit(request, { key: `consulta_delete:${user.id}`, limit: 10, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const acceso = await resolverAcceso(supabase, user.id, 'crear_consultas')
    if (!acceso.ok) {
      const msg = acceso.motivo === 'sin-permiso' ? 'Sin permisos'
                : acceso.motivo === 'sin-tenant'  ? 'No tenés un médico asignado'
                : 'Perfil no encontrado'
      return NextResponse.json({ error: msg }, { status: 403 })
    }

    const { data: existing } = await supabase
      .from('consultas')
      .select('id, estado, creado_por, paciente_id')
      .eq('id', id)
      .eq('medico_id', acceso.tenantMedicoId)
      .single()

    if (!existing) return NextResponse.json({ error: 'Consulta no encontrada' }, { status: 404 })

    if (existing.estado === 'finalizada') {
      return NextResponse.json({ error: 'No se puede eliminar una consulta finalizada.' }, { status: 403 })
    }

    // Descartar un borrador: el médico (cualquiera de su tenant) o el asistente que lo
    // creó. Validación explícita además de la RLS (migración 038), mismo criterio que el
    // DELETE de estudios. ⚠ `creado_por` es NULL en los borradores anteriores a esa
    // migración: sin autor conocido, solo el médico puede descartarlos.
    if (acceso.role !== 'medico' && existing.creado_por !== user.id) {
      return NextResponse.json(
        { error: 'Solo el médico o quien creó el borrador puede descartarlo' },
        { status: 403 }
      )
    }

    // Paciente archivado → solo lectura (regla de negocio 9). Se lee con admin client
    // (bypass RLS) porque quien descarta puede no tener `ver_pacientes`, igual que en el
    // POST; acotado al tenant.
    const admin = createAdminClient()
    const { data: pac } = await admin
      .from('pacientes')
      .select('archivado_at')
      .eq('id', existing.paciente_id)
      .eq('creado_por', acceso.tenantMedicoId)
      .single()

    if (pac?.archivado_at) {
      return NextResponse.json(
        { error: 'El paciente está archivado. Desarchivalo para descartar borradores.' },
        { status: 409 }
      )
    }

    // ⚠ Guarda de "0 filas": una denegación de RLS en DELETE no levanta error, filtra
    // filas — devolvería `error: null` y el usuario vería un falso éxito (la lección de
    // la migración 033). El `.select('id')` es lo que permite contarlas.
    const { data: borrada, error } = await supabase
      .from('consultas')
      .delete()
      .eq('id', id)
      .eq('medico_id', acceso.tenantMedicoId)
      .select('id')
      .maybeSingle()

    if (error) throw error
    if (!borrada) {
      return NextResponse.json(
        { error: 'La base de datos rechazó la eliminación del borrador.' },
        { status: 403 }
      )
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
