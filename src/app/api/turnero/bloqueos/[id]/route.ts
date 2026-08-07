import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { bloqueoAgendaUpdateSchema } from '@/lib/validations/turno.schema'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const rl = await rateLimit(request, {
      key: `bloqueos_patch:${user.id}`,
      limit: 20,
      windowMs: 60 * 60 * 1000 // 1 hour
    })
    if (!rl.success) {
      return rateLimitResponse(rl.retryAfter!)
    }

    // 1. Obtener perfil
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
      return NextResponse.json({ error: 'Error: No se encontró un médico asociado a tu perfil.' }, { status: 403 })
    }

    const body = await request.json()
    const result = bloqueoAgendaUpdateSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: result.error.format() },
        { status: 400 }
      )
    }

    const updates = result.data

    // 2. Fetch del registro existente y validación manual de pertenencia
    const { data: existing, error: fetchError } = await supabase
      .from('bloqueos_agenda')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Bloqueo no encontrado.' }, { status: 404 })
    }

    // Validación manual del "Tenant"
    if (existing.medico_id !== tenantMedicoId) {
       console.error('[API VERIFICATION FAIL]', {
         request_tenant: tenantMedicoId,
         db_row_tenant: existing.medico_id,
         role: profile?.role
       });
       return NextResponse.json({
         error: 'Permiso denegado: este bloqueo pertenece a otra agenda.',
       }, { status: 403 })
    }

    // 3. Verificar solapamiento si se cambian fechas
    const inicio = updates.fecha_inicio ?? existing.fecha_inicio
    const fin    = updates.fecha_fin    ?? existing.fecha_fin

    // Los cancelados y los pendientes de confirmar NO ocupan la franja: mismo criterio (y
    // misma forma) que el POST de /api/turnero. Sin filtro de `categoria`, por lo mismo
    // que en el POST de bloqueos: un bloqueo pisa turnos de cualquier categoría.
    const { data: overT } = await supabase
      .from('turnos')
      .select('id')
      .eq('medico_id', tenantMedicoId)
      .not('estado', 'in', '(pendiente_confirmar,cancelado)')
      .lt('fecha_inicio', fin)
      .gt('fecha_fin', inicio)

    if (overT && overT.length > 0) {
      return NextResponse.json({ error: 'El bloqueo se solapa con turnos ya agendados.' }, { status: 409 })
    }

    const { data: overB } = await supabase
      .from('bloqueos_agenda')
      .select('id')
      .eq('medico_id', tenantMedicoId)
      .neq('id', id)
      .lt('fecha_inicio', fin)
      .gt('fecha_fin', inicio)

    if (overB && overB.length > 0) {
      return NextResponse.json({ error: 'El bloqueo se solapa con otro bloqueo existente.' }, { status: 409 })
    }

    // 4. Ejecutar actualización
    const { data: updated, error: updateError } = await supabase
      .from('bloqueos_agenda')
      .update(updates)
      .eq('id', id)
      .select()

    if (updateError) {
      throw updateError
    }

    // Guarda de "0 filas": existencia y tenant ya se validaron arriba (fetch previo),
    // así que si la RLS filtró la fila el UPDATE no falla — afecta 0 filas en silencio.
    // Sin esto, un fallo de permisos sale como 200 con el cuerpo vacío.
    // (Nota: .select() también pasa por bloqueos_select; hoy es tenant-only, así que
    //  si algún día se endurece esa política habría que revisar esta guarda.)
    if (!updated || updated.length === 0) {
      return NextResponse.json(
        { error: 'No se pudo actualizar el bloqueo: la base de datos rechazó la modificación.' },
        { status: 403 }
      )
    }

    return NextResponse.json({ data: updated[0] })
  } catch (error) {
    console.error('Error updating bloqueo:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const rl = await rateLimit(request, {
      key: `bloqueos_delete:${user.id}`,
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

    // 1. Fetch previo para ver si existe y a quién pertenece
    const { data: existing, error: fetchError } = await supabase
      .from('bloqueos_agenda')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
       return NextResponse.json({ error: 'El bloqueo ya no existe o no se pudo encontrar.' }, { status: 404 })
    }

    // 2. Validación manual
    if (existing.medico_id !== tenantMedicoId) {
       return NextResponse.json({ error: 'Permiso denegado para eliminar este bloqueo.' }, { status: 403 })
    }

    // 3. Ejecutar borrado por ID
    const { data: deleted, error: deleteError } = await supabase
      .from('bloqueos_agenda')
      .delete()
      .eq('id', id)
      .select('id')

    if (deleteError) {
      throw deleteError
    }

    // Misma guarda que en el PATCH: la RLS filtra en silencio, no lanza.
    if (!deleted || deleted.length === 0) {
      return NextResponse.json(
        { error: 'No se pudo eliminar el bloqueo: la base de datos rechazó el borrado.' },
        { status: 403 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting bloqueo:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
