import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { turnoUpdateWithDatesSchema } from '@/lib/validations/turno.schema'
import { uuidSchema } from '@/lib/validations/shared'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

interface RouteContext {
  params: Promise<{ id: string }>
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
      return NextResponse.json({ error: 'Tenant inválido' }, { status: 403 })
    }

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

    // If updating times, check for overlaps
    if (updates.fecha_inicio && updates.fecha_fin) {
        const { data: overT } = await supabase
          .from('turnos')
          .select('id')
          .eq('medico_id', tenantMedicoId)
          .neq('id', id)
          .lt('fecha_inicio', updates.fecha_fin)
          .gt('fecha_fin', updates.fecha_inicio)

        if (overT && overT.length > 0) {
          return NextResponse.json({ error: 'El horario se solapa con otro turno.' }, { status: 409 })
        }

        const { data: overB } = await supabase
          .from('bloqueos_agenda')
          .select('id')
          .eq('medico_id', tenantMedicoId)
          .lt('fecha_inicio', updates.fecha_fin)
          .gt('fecha_fin', updates.fecha_inicio)

        if (overB && overB.length > 0) {
          return NextResponse.json({ error: 'El horario se solapa con un bloqueo.' }, { status: 409 })
        }
    }

    const { data: updated, error: updateError } = await supabase
      .from('turnos')
      .update(updates)
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
      return NextResponse.json({ error: 'Tenant inválido' }, { status: 403 })
    }

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
