import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { bloqueoAgendaUpdateSchema } from '@/lib/validations/turno.schema'
import { buscarSolapamientos } from '@/lib/agenda/solapamiento'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { resolverAcceso } from '@/lib/auth/tenant'

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
    const acceso = await resolverAcceso(supabase, user.id, 'gestionar_turnos')
    if (!acceso.ok) {
      const msg = acceso.motivo === 'sin-permiso' ? 'No tenés permisos para modificar la agenda.'
                : acceso.motivo === 'sin-tenant'  ? 'Error: No se encontró un médico asociado a tu perfil.'
                : 'Perfil no encontrado'
      return NextResponse.json({ error: msg }, { status: 403 })
    }
    const tenantMedicoId = acceso.tenantMedicoId

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
         role: acceso.role
       });
       return NextResponse.json({
         error: 'Permiso denegado: este bloqueo pertenece a otra agenda.',
       }, { status: 403 })
    }

    // 3. Verificar solapamiento si se cambian fechas
    const inicio = updates.fecha_inicio ?? existing.fecha_inicio
    const fin    = updates.fecha_fin    ?? existing.fecha_fin

    // Criterio único del proyecto: `lib/agenda/solapamiento.ts`. Un bloqueo pisa turnos de
    // cualquier categoría, y se excluye a sí mismo del chequeo bloqueo-vs-bloqueo.
    const { hayTurnoSolapado, hayBloqueoSolapado } = await buscarSolapamientos({
      supabase,
      medicoId: tenantMedicoId,
      inicio,
      fin,
      excluirBloqueoId: id,
    })

    if (hayTurnoSolapado) {
      return NextResponse.json({ error: 'El bloqueo se solapa con turnos ya agendados.' }, { status: 409 })
    }

    if (hayBloqueoSolapado) {
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
    // (Nota: el .select() también pasa por `bloqueos_select`, que desde la migración 037
    //  exige `ver_turnos` OR `gestionar_turnos`. Ese OR está elegido justamente para que
    //  esta guarda siga siendo correcta: quien pasa el chequeo de permiso del endpoint
    //  —`gestionar_turnos`— pasa también el SELECT, así que no hay 403 falsos.)
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

    const acceso = await resolverAcceso(supabase, user.id, 'gestionar_turnos')
    if (!acceso.ok) {
      const msg = acceso.motivo === 'sin-permiso' ? 'No tenés permisos para modificar la agenda.'
                : acceso.motivo === 'sin-tenant'  ? 'Tenant inválido'
                : 'Perfil no encontrado'
      return NextResponse.json({ error: msg }, { status: 403 })
    }
    const tenantMedicoId = acceso.tenantMedicoId

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
