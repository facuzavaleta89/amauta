import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { consultaSchema } from '@/lib/validations/consulta.schema'

interface RouteContext {
  params: Promise<{ id: string }>
}

async function getTenantContext(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, medico_id, puede_ver_historias')
    .eq('id', userId)
    .single()

  if (!profile) return null
  if (profile.role === 'asistente' && !profile.puede_ver_historias) return null

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

    const ctx = await getTenantContext(supabase, user.id)
    if (!ctx) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

    const { data, error } = await supabase
      .from('consultas')
      .select('*')
      .eq('id', id)
      .eq('medico_id', ctx.tenantMedicoId)
      .single()

    if (error || !data) return NextResponse.json({ error: 'Consulta no encontrada' }, { status: 404 })

    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error del servidor' }, { status: 500 })
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

    const ctx = await getTenantContext(supabase, user.id)
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

    const body = await request.json()

    // Para PATCH no requerimos paciente_id (ya existe)
    const result = consultaSchema.safeParse({ ...body, paciente_id: body.paciente_id || 'placeholder-will-not-insert' })

    if (!result.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: result.error.format() },
        { status: 400 }
      )
    }

    const { paciente_id: _pid, ...updates } = result.data

    const { data: updated, error: updateError } = await supabase
      .from('consultas')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (updateError) throw updateError

    // Si se actualiza proximo_turno_sugerido y es distinto al anterior, crear turno
    const nuevoTurno = result.data.proximo_turno_sugerido
    if (nuevoTurno && nuevoTurno !== existing.proximo_turno_sugerido) {
      const pacienteRes = await supabase
        .from('consultas')
        .select('paciente_id')
        .eq('id', id)
        .single()

      if (pacienteRes.data) {
        const fechaBase = new Date(`${nuevoTurno}T09:00:00`)
        const fechaFin  = new Date(`${nuevoTurno}T09:30:00`)
        await supabase.from('turnos').insert({
          paciente_id:  pacienteRes.data.paciente_id,
          fecha_inicio: fechaBase.toISOString(),
          fecha_fin:    fechaFin.toISOString(),
          motivo:       'Control médico programado (generado desde HC)',
          estado:       'pendiente',
          medico_id:    ctx.tenantMedicoId,
          agendado_por: user.id,
        })
      }
    }

    return NextResponse.json({ data: updated })
  } catch (error: any) {
    console.error('[PATCH /api/consultas/[id]]', error)
    return NextResponse.json({ error: error.message || 'Error del servidor' }, { status: 500 })
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

    const ctx = await getTenantContext(supabase, user.id)
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error del servidor' }, { status: 500 })
  }
}
