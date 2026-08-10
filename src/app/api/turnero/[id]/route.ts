import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { turnoUpdateWithDatesSchema } from '@/lib/validations/turno.schema'
import { buscarSolapamientos } from '@/lib/agenda/solapamiento'
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

    // ── Verificación de solapamiento si el PATCH toca el horario ───────────────
    // ⚠ La guarda es `||`, no `&&`. Antes pedía las DOS fechas, así que un PATCH con una
    // sola (p. ej. alargar un turno moviendo solo `fecha_fin`) salteaba el chequeo por
    // completo. Ahora, si viene al menos una, la que falta se resuelve desde la fila
    // existente con `??` — el mismo patrón que ya usaba el PATCH de bloqueos.
    // Un PATCH que NO toca fechas (cambiar estado, motivo, notas) sigue sin chequear:
    // no mueve nada en la agenda, y chequear ahí rechazaría con 409 la edición de un
    // turno que ya convivía con otro.
    if (updates.fecha_inicio || updates.fecha_fin) {
      const { data: existing, error: fetchError } = await supabase
        .from('turnos')
        .select('fecha_inicio, fecha_fin')
        .eq('id', id)
        .eq('medico_id', tenantMedicoId)
        .single()

      if (fetchError || !existing) {
        return NextResponse.json({ error: 'Turno no encontrado o sin permisos' }, { status: 404 })
      }

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
