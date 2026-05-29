import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { consultaSchema } from '@/lib/validations/consulta.schema'

export const dynamic = 'force-dynamic'

// ── Helpers ────────────────────────────────────────────────────

async function getTenantContext(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, medico_id, puede_ver_historias')
    .eq('id', userId)
    .single()

  if (!profile) return null

  // Asistentes no tienen permiso a HC por defecto
  if (profile.role === 'asistente' && !profile.puede_ver_historias) {
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

    const ctx = await getTenantContext(supabase, user.id)
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

    const ctx = await getTenantContext(supabase, user.id)
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

    // ── Validar próximo turno sugerido antes de crear consulta ──
    if (consulta.proximo_turno_sugerido) {
      const tieneHora = consulta.proximo_turno_sugerido.includes('T') && consulta.proximo_turno_sugerido.includes(':');
      if (!tieneHora) {
        return NextResponse.json({ error: 'Debés ingresar una fecha y hora completa para el próximo turno sugerido.' }, { status: 400 })
      }

      const fechaBase = new Date(consulta.proximo_turno_sugerido)
      if (isNaN(fechaBase.getTime())) {
        return NextResponse.json({ error: 'La fecha y hora del próximo turno sugerido no es válida.' }, { status: 400 })
      }

      const fechaFin = new Date(fechaBase.getTime() + 30 * 60 * 1000)

      // Verificar solapamiento
      const { data: overT } = await supabase
        .from('turnos')
        .select('id')
        .eq('medico_id', ctx.tenantMedicoId)
        .lt('fecha_inicio', fechaFin.toISOString())
        .gt('fecha_fin', fechaBase.toISOString())

      const { data: overB } = await supabase
        .from('bloqueos_agenda')
        .select('id')
        .eq('medico_id', ctx.tenantMedicoId)
        .lt('fecha_inicio', fechaFin.toISOString())
        .gt('fecha_fin', fechaBase.toISOString())

      if ((overT && overT.length > 0) || (overB && overB.length > 0)) {
        return NextResponse.json({
          error: 'El próximo turno sugerido se solapa con otro turno o bloqueo en la agenda. Por favor, seleccioná otro horario.'
        }, { status: 409 })
      }
    }

    const { data: nueva, error: insertError } = await supabase
      .from('consultas')
      .insert({
        ...consulta,
        medico_id: ctx.tenantMedicoId,
      })
      .select()
      .single()

    if (insertError) throw insertError

    // ── Crear turno automático si todo está ok ──
    if (consulta.proximo_turno_sugerido) {
      const fechaBase = new Date(consulta.proximo_turno_sugerido)
      const fechaFin = new Date(fechaBase.getTime() + 30 * 60 * 1000)

      await supabase.from('turnos').insert({
        paciente_id:  consulta.paciente_id,
        fecha_inicio: fechaBase.toISOString(),
        fecha_fin:    fechaFin.toISOString(),
        motivo:       'Control médico programado (generado desde HC)',
        estado:       'pendiente',
        medico_id:    ctx.tenantMedicoId,
        agendado_por: user.id,
      })
    }

    return NextResponse.json({ data: nueva }, { status: 201 })
  } catch (error: any) {
    console.error('[POST /api/consultas]', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
