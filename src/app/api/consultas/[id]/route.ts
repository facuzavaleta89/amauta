import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { consultaSchema } from '@/lib/validations/consulta.schema'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import type { PermisosAsistente, UserRole } from '@/types'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * Los permisos que el `select` de `getTenantContext` REALMENTE proyecta: 11 de los 12.
 *
 * ⚠ `acceso_mensajeria` se omite a propósito, porque no está en la proyección. Tipar la fila
 * con `PermisosAsistente` completo mentiría, y dejar `permisoRequerido: PermisoKey` habilitaría
 * pedir una clave que la query no trajo: el chequeo leería `undefined` y **denegaría en
 * silencio**. Si alguna vez hace falta ese permiso acá, hay que sumarlo al `select` (cambio de
 * runtime), no ensanchar el tipo.
 */
type PermisosProyectados = Omit<PermisosAsistente, 'acceso_mensajeria'>

/** Permisos que este helper puede exigir: solo los proyectados. */
type PermisoProyectado = keyof PermisosProyectados

/** Fila devuelta por el `select` de abajo: rol, tenant y los 11 permisos proyectados. */
type ProfileTenantRow = PermisosProyectados & {
  role: UserRole
  medico_id: string | null
}

async function getTenantContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  permisoRequerido: PermisoProyectado
) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, medico_id, ver_pacientes, editar_pacientes, ver_historia_clinica, crear_consultas, finalizar_consultas, ver_turnos, gestionar_turnos, ver_pedidos, crear_pedidos, ver_certificados, crear_certificados')
    .eq('id', userId)
    .single<ProfileTenantRow>()

  if (!profile) return null
  if (profile.role === 'asistente' && !profile[permisoRequerido]) return null

  const tenantMedicoId =
    profile.role === 'medico'    ? userId :
    profile.role === 'asistente' ? profile.medico_id :
    null

  return tenantMedicoId ? { tenantMedicoId, role: profile.role } : null
}

// ── GET /api/consultas/[id] ───────────────────────────────────

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rl = await rateLimit(_request, { key: `consulta_get_one:${user.id}`, limit: 120, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const ctx = await getTenantContext(supabase, user.id, 'ver_historia_clinica')
    if (!ctx) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

    const { data, error } = await supabase
      .from('consultas')
      .select('*')
      .eq('id', id)
      .eq('medico_id', ctx.tenantMedicoId)
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

    const ctx = await getTenantContext(supabase, user.id, permiso)
    if (!ctx) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

    // Verificar que la consulta existe y pertenece al tenant
    const { data: existing, error: fetchError } = await supabase
      .from('consultas')
      .select('id, estado, proximo_turno_sugerido')
      .eq('id', id)
      .eq('medico_id', ctx.tenantMedicoId)
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

    const nuevoTurno      = updates.proximo_turno_sugerido
    const turnoHaCambiado = nuevoTurno && nuevoTurno !== existing.proximo_turno_sugerido

    // ── Validar solapamiento del próximo control ANTES de actualizar ──
    if (turnoHaCambiado) {
      const fechaBase      = new Date(nuevoTurno!)
      const fechaFin       = new Date(fechaBase.getTime() + 10 * 60 * 1000)
      const fechaIsoInicio = fechaBase.toISOString()
      const fechaIsoFin    = fechaFin.toISOString()

      const [{ data: bloquesSolapados }, { data: turnosSolapados }] = await Promise.all([
        supabase
          .from('bloqueos_agenda')
          .select('id')
          .eq('medico_id', ctx.tenantMedicoId)
          .lt('fecha_inicio', fechaIsoFin)
          .gt('fecha_fin', fechaIsoInicio),
        supabase
          .from('turnos')
          .select('id')
          .eq('medico_id', ctx.tenantMedicoId)
          .eq('categoria', 'turno_medico')
          .not('estado', 'in', '(cancelado)')
          .lt('fecha_inicio', fechaIsoFin)
          .gt('fecha_fin', fechaIsoInicio),
      ])

      if ((bloquesSolapados && bloquesSolapados.length > 0) || (turnosSolapados && turnosSolapados.length > 0)) {
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

    // ── Crear turno automático si el próximo turno cambió ──
    if (turnoHaCambiado) {
      const fechaBase      = new Date(nuevoTurno!)
      const fechaFin       = new Date(fechaBase.getTime() + 10 * 60 * 1000)
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
          const fechaConsulta = new Date(pacienteRes.data.fecha_hora).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
          await supabase.from('turnos').insert({
            paciente_id:  pacienteRes.data.paciente_id,
            fecha_inicio: fechaIsoInicio,
            fecha_fin:    fechaIsoFin,
            motivo:       'Control médico programado',
            notas:        `Turno generado desde historia clínica — Consulta del ${fechaConsulta}`,
            estado:       'confirmado',
            categoria:    'turno_medico',
            origen:       'desde_hc',
            consulta_id:  id,
            medico_id:    ctx.tenantMedicoId,
            agendado_por: user.id,
          })
        }
      }
    }

    return NextResponse.json({ data: updated })
  } catch (error) {
    console.error('[PATCH /api/consultas/[id]]', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

// ── DELETE /api/consultas/[id] ────────────────────────────────
// Solo permite eliminar borradores

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rl = await rateLimit(_request, { key: `consulta_delete:${user.id}`, limit: 10, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const ctx = await getTenantContext(supabase, user.id, 'crear_consultas')
    if (!ctx) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

    const { data: existing } = await supabase
      .from('consultas')
      .select('id, estado')
      .eq('id', id)
      .eq('medico_id', ctx.tenantMedicoId)
      .single()

    if (!existing) return NextResponse.json({ error: 'Consulta no encontrada' }, { status: 404 })

    if (existing.estado === 'finalizada') {
      return NextResponse.json({ error: 'No se puede eliminar una consulta finalizada.' }, { status: 403 })
    }

    const { error } = await supabase.from('consultas').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
