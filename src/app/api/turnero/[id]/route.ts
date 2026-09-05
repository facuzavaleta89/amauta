import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { turnoUpdateWithDatesSchema } from '@/lib/validations/turno.schema'
import { buscarSolapamientos } from '@/lib/agenda/solapamiento'
import { uuidSchema } from '@/lib/validations/shared'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { resolverAcceso } from '@/lib/auth/tenant'
import { verificarPacienteDelTenant } from '@/lib/pacientes/verificar-paciente'
import type { TurnoCategoria } from '@/types'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * Proyección del fetch ÚNICO del turno actual que hace el PATCH. Trae lo mínimo que
 * necesitan sus tres validaciones: las dos fechas (solapamiento) y `categoria` +
 * `paciente_id` (el cruce de la regla del turno médico).
 */
interface TurnoActual {
  fecha_inicio: string
  fecha_fin: string
  categoria: TurnoCategoria
  paciente_id: string | null
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params

    const idValidation = uuidSchema.safeParse(id)
    if (!idValidation.success) {
      return NextResponse.json({ error: 'ID de turno inválido' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const rl = await rateLimit(request, {
      key: `turnero_patch:${user.id}`,
      limit: 60,
      windowMs: 60 * 60 * 1000 // 1 hour
    })
    if (!rl.success) {
      return rateLimitResponse(rl.retryAfter!)
    }

    const acceso = await resolverAcceso(supabase, user.id, 'gestionar_turnos')
    if (!acceso.ok) {
      const msg = acceso.motivo === 'sin-permiso' ? 'No tenés permisos para modificar la agenda.'
                : acceso.motivo === 'sin-tenant'  ? 'Tenant inválido'
                : 'Perfil no encontrado'
      return NextResponse.json({ error: msg }, { status: 403 })
    }
    const tenantMedicoId = acceso.tenantMedicoId

    const body = await request.json()
    // Usar el esquema de actualización que tiene los refines cruzados si vienen ambas fechas
    const result = turnoUpdateWithDatesSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: result.error.format() },
        { status: 400 }
      )
    }

    const updates = result.data

    // ── Fetch ÚNICO del turno actual ───────────────────────────────────────────
    // Antes este fetch vivía DENTRO de la rama de solapamiento y proyectaba solo las dos
    // fechas. Se subió acá y se amplió porque ahora hay TRES validaciones que necesitan la
    // fila guardada, y hacer un fetch por cada una sería pegarle tres veces a la misma fila.
    //
    // ⚠ Un PATCH es PARCIAL: el body trae solo lo que cambió. Para validar hace falta el
    // valor EFECTIVO de cada campo — el del body si vino, el de la fila si no —, y de ahí
    // sale la necesidad de leer el turno.
    //
    // ⚠ Se lee SOLO si alguna validación lo va a usar. Un PATCH que cambia únicamente
    // estado, motivo o notas no necesita nada de esto y no paga la query, igual que antes.
    // `!== undefined` y no truthy: `paciente_id: null` es un valor legítimo (desvincular).
    const tocaHorario = updates.fecha_inicio !== undefined || updates.fecha_fin !== undefined
    const tocaPaciente = updates.paciente_id !== undefined || updates.categoria !== undefined

    let existing: TurnoActual | null = null

    if (tocaHorario || tocaPaciente) {
      const { data, error: fetchError } = await supabase
        .from('turnos')
        .select('fecha_inicio, fecha_fin, categoria, paciente_id')
        .eq('id', id)
        .eq('medico_id', tenantMedicoId)
        .single<TurnoActual>()

      if (fetchError || !data) {
        return NextResponse.json({ error: 'Turno no encontrado o sin permisos' }, { status: 404 })
      }
      existing = data
    }

    // ── Validación de TENANT del paciente ──────────────────────────────────────
    // ⚠⚠ No es UX: es aislamiento. La RLS de `turnos` solo valida `medico_id` (el del
    // TURNO) y la FK a `pacientes` NO filtra tenant, así que sin este chequeo un PATCH
    // podría asignarle a un turno propio un paciente de OTRO consultorio. El criterio vive
    // en `lib/pacientes/verificar-paciente.ts`, que además cubre la regla de negocio 9
    // (un archivado no admite escritura). Ver el JSDoc del helper.
    //
    // Solo corre si el body trae un `paciente_id` NO NULO: mandar `null` es desvincular, y
    // eso no necesita validar nada.
    //
    // ⚠⚠ EL CHEQUEO DE ARCHIVADO SOLO APLICA SI EL PACIENTE **CAMBIA**, y el de tenant
    // SIEMPRE. La asimetría corrige un bug de la tanda anterior: el formulario manda
    // SIEMPRE el `paciente_id` al editar (lo siembra desde `initialData`), así que con la
    // guarda de archivado incondicional un paciente archivado DESPUÉS de tener turnos
    // dejaba esos turnos imposibles de editar — mover la hora daba 409 para siempre. La
    // regla de negocio 9 prohíbe agendarle turnos NUEVOS a un archivado, no administrar los
    // que ya tenía.
    // El de TENANT no se relaja: es el que cierra la fuga de aislamiento y no depende de si
    // el valor cambió.
    if (updates.paciente_id) {
      // `existing` está garantizado acá (`paciente_id !== undefined` ⇒ `tocaPaciente` ⇒ se
      // leyó la fila), pero TS no lo infiere. Con `?.` un `existing` nulo daría `undefined`
      // y la comparación resultaría "cambió" → se chequea igual: el default es fail-closed.
      const cambiaPaciente = updates.paciente_id !== existing?.paciente_id

      const chequeo = await verificarPacienteDelTenant(updates.paciente_id, tenantMedicoId)

      if (!chequeo.ok) {
        if (chequeo.motivo === 'no-encontrado') {
          // Tenant: siempre rechaza. No existe, o es de otro consultorio.
          return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 })
        }
        // 'archivado' — el paciente ES del tenant (el helper lo encontró con su `creado_por`),
        // así que el aislamiento ya está verificado. Solo se rechaza si se lo está ASIGNANDO.
        if (cambiaPaciente) {
          return NextResponse.json(
            { error: 'El paciente está archivado. Desarchivalo para agendarle turnos.' },
            { status: 409 }
          )
        }
      }
    }

    // ── Cruce categoría / paciente ─────────────────────────────────────────────
    // La regla de la base es `check_paciente_id_required_for_turno_medico`:
    // `categoria <> 'turno_medico' OR paciente_id IS NOT NULL`.
    //
    // ⚠ Sin esta guarda el update llegaría a Postgres, violaría la CHECK y saldría por el
    // `catch` genérico como **500 "Error del servidor"** — indistinguible de una caída de
    // base. En todo `src/` no hay ningún manejo de `23514`, así que el error correcto hay
    // que producirlo acá.
    //
    // ⚠ Los valores son los EFECTIVOS, no los del body: este PATCH puede mandar la
    // categoría sin el paciente (o al revés) y el dato que falta está en la fila. Por eso
    // no se puede validar en el schema Zod — ver el comentario de `turnoUpdateWithDatesSchema`.
    if (tocaPaciente && existing) {
      const categoriaEfectiva = updates.categoria ?? existing.categoria
      const pacienteEfectivo =
        updates.paciente_id !== undefined ? updates.paciente_id : existing.paciente_id

      if (categoriaEfectiva === 'turno_medico' && !pacienteEfectivo) {
        return NextResponse.json(
          { error: 'Un turno médico requiere un paciente. Seleccioná uno o cambiá el tipo de evento.' },
          { status: 400 }
        )
      }
    }

    // ── Verificación de solapamiento si el PATCH toca el horario ───────────────
    // ⚠ La guarda es `||`, no `&&`. Antes pedía las DOS fechas, así que un PATCH con una
    // sola (p. ej. alargar un turno moviendo solo `fecha_fin`) salteaba el chequeo por
    // completo. Ahora, si viene al menos una, la que falta se resuelve desde la fila
    // existente con `??` — el mismo patrón que ya usaba el PATCH de bloqueos.
    // Un PATCH que NO toca fechas (cambiar estado, motivo, notas) sigue sin chequear:
    // no mueve nada en la agenda, y chequear ahí rechazaría con 409 la edición de un
    // turno que ya convivía con otro.
    //
    // ⚠ Un cambio de paciente o de categoría NO entra acá, y está bien: no mueve el turno,
    // y `buscarSolapamientos` no mira ninguno de los dos campos (nota técnica 23).
    if (tocaHorario && existing) {
      const inicio = updates.fecha_inicio ?? existing.fecha_inicio
      const fin    = updates.fecha_fin    ?? existing.fecha_fin

      const { hayTurnoSolapado, hayBloqueoSolapado } = await buscarSolapamientos({
        supabase,
        medicoId: tenantMedicoId,
        inicio,
        fin,
        excluirTurnoId: id,
      })

      if (hayTurnoSolapado) {
        return NextResponse.json({ error: 'El horario se solapa con otro turno.' }, { status: 409 })
      }

      if (hayBloqueoSolapado) {
        return NextResponse.json({ error: 'El horario se solapa con un bloqueo.' }, { status: 409 })
      }
    }

    // ── Normalización de `paciente_nombre_libre`: '' → NULL ────────────────────
    // Mismo criterio que el POST (ver su comentario): `''` no es NULL y rompe los fallbacks
    // `??` de `turno-form.tsx` y de `next-appointments.tsx`.
    // ⚠ Solo si la clave VINO en el body: un PATCH parcial que no la manda NO debe recibirla
    // acá, o el `.update()` le pisaría el nombre guardado con un null.
    const updatesNormalizados =
      updates.paciente_nombre_libre === undefined
        ? updates
        : { ...updates, paciente_nombre_libre: (updates.paciente_nombre_libre ?? '').trim() || null }

    const { data: updated, error: updateError } = await supabase
      .from('turnos')
      .update(updatesNormalizados)
      .eq('id', id)
      .eq('medico_id', tenantMedicoId)
      .select()

    if (updateError) throw updateError
    
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: 'Turno no encontrado o sin permisos' }, { status: 404 })
    }

    return NextResponse.json({ data: updated[0] })
  } catch (error) {
    console.error('Error updating turno:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params

    const idValidation = uuidSchema.safeParse(id)
    if (!idValidation.success) {
      return NextResponse.json({ error: 'ID de turno inválido' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const rl = await rateLimit(request, {
      key: `turnero_delete:${user.id}`,
      limit: 20,
      windowMs: 60 * 60 * 1000 // 1 hour
    })
    if (!rl.success) {
      return rateLimitResponse(rl.retryAfter!)
    }

    const acceso = await resolverAcceso(supabase, user.id, 'gestionar_turnos')
    if (!acceso.ok) {
      const msg = acceso.motivo === 'sin-permiso' ? 'No tenés permisos para modificar la agenda.'
                : acceso.motivo === 'sin-tenant'  ? 'Tenant inválido'
                : 'Perfil no encontrado'
      return NextResponse.json({ error: msg }, { status: 403 })
    }
    const tenantMedicoId = acceso.tenantMedicoId

    const { data: deleted, error: deleteError } = await supabase
      .from('turnos')
      .delete()
      .eq('id', id)
      .eq('medico_id', tenantMedicoId)
      .select('id')

    if (deleteError) {
      throw deleteError
    }

    // Guarda de "0 filas". A diferencia de bloqueos, este handler NO hace fetch previo
    // del turno: la pertenencia va solo por el .eq('medico_id', ...). Por eso las 0 filas
    // colapsan tres causas indistinguibles (no existe / otro tenant / RLS lo filtró), y el
    // código honesto es 404 genérico — igual que el PATCH de este mismo archivo (que ya
    // devuelve 404 'Turno no encontrado o sin permisos' en su propia guarda).
    if (!deleted || deleted.length === 0) {
      return NextResponse.json(
        { error: 'Turno no encontrado o sin permisos' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting turno:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
