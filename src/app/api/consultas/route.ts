import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { consultaSchema } from '@/lib/validations/consulta.schema'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// ── Helpers ────────────────────────────────────────────────────

async function getTenantContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  permisoRequerido: string
) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, medico_id, ver_pacientes, editar_pacientes, ver_historia_clinica, crear_consultas, finalizar_consultas, ver_turnos, gestionar_turnos, ver_pedidos, crear_pedidos, ver_certificados, crear_certificados')
    .eq('id', userId)
    .single()

  if (!profile) return null

  // Si es asistente y no tiene el permiso requerido
  if (profile.role === 'asistente' && !(profile as any)[permisoRequerido]) {
    return null
  }

  const tenantMedicoId =
    profile.role === 'medico'    ? userId :
    profile.role === 'asistente' ? profile.medico_id :
    null

  return tenantMedicoId ? { tenantMedicoId, role: profile.role } : null
}

// ── GET /api/consultas?paciente_id=&page=&limit= ───────────────

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rl = rateLimit(request, { key: `consultas_get:${user.id}`, limit: 60, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const ctx = await getTenantContext(supabase, user.id, 'ver_historia_clinica')
    if (!ctx) return NextResponse.json({ error: 'Sin permisos para ver historias clínicas' }, { status: 403 })

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
      .eq('medico_id', ctx.tenantMedicoId)
      .order('fecha_hora', { ascending: false })
      .range(from, to)

    if (error) throw error

    return NextResponse.json({
      data,
      meta: { total: count ?? 0, page, limit },
    })
  } catch (error: any) {
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

    const rl = rateLimit(request, { key: `consultas_post:${user.id}`, limit: 20, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const ctx = await getTenantContext(supabase, user.id, 'crear_consultas')
    if (!ctx) return NextResponse.json({ error: 'Sin permisos para registrar consultas' }, { status: 403 })

    const body = await request.json()
    const result = consultaSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: result.error.format() },
        { status: 400 }
      )
    }

    const consulta = result.data

    // ── Validar solapamiento del próximo control ANTES de guardar ──
    if (consulta.proximo_turno_sugerido) {
      const fechaBase      = new Date(consulta.proximo_turno_sugerido)
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

    // ── Insertar la consulta ──────────────────────────────────
    const { data: nueva, error: insertError } = await supabase
      .from('consultas')
      .insert({
        ...consulta,
        medico_id: ctx.tenantMedicoId,
      })
      .select()
      .single()

    if (insertError) throw insertError

    // ── Crear turno automático si se sugirió próximo control ──
    if (consulta.proximo_turno_sugerido) {
      const fechaBase      = new Date(consulta.proximo_turno_sugerido)
      const fechaFin       = new Date(fechaBase.getTime() + 10 * 60 * 1000)
      const fechaIsoInicio = fechaBase.toISOString()
      const fechaIsoFin    = fechaFin.toISOString()

      // Evitar duplicado: si ya existe un turno desde HC para esta consulta
      const { data: existente } = await supabase
        .from('turnos')
        .select('id')
        .eq('consulta_id', nueva.id)
        .maybeSingle()

      if (!existente) {
        const fechaConsulta = new Date(consulta.fecha_hora).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        await supabase.from('turnos').insert({
          paciente_id:  consulta.paciente_id,
          fecha_inicio: fechaIsoInicio,
          fecha_fin:    fechaIsoFin,
          motivo:       'Control médico programado',
          notas:        `Turno generado desde historia clínica — Consulta del ${fechaConsulta}`,
          estado:       'confirmado',
          categoria:    'turno_medico',
          origen:       'desde_hc',
          consulta_id:  nueva.id,
          medico_id:    ctx.tenantMedicoId,
          agendado_por: user.id,
        })
      }
    }

    return NextResponse.json({ data: nueva }, { status: 201 })
  } catch (error: any) {
    console.error('[POST /api/consultas]', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
