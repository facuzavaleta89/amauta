import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { bloqueoAgendaSchema } from '@/lib/validations/turno.schema'

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

    // 1. Obtener perfil
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, medico_id')
      .eq('id', user.id)
      .single()

    const tenantMedicoId =
      profile?.role === 'medico' ? user.id :
      profile?.role === 'asistente' ? profile?.medico_id :
      null

    if (!tenantMedicoId) {
      return NextResponse.json({ error: 'Error: No se encontró un médico asociado a tu perfil.' }, { status: 403 })
    }

    const body = await request.json()
    const result = bloqueoAgendaSchema.partial().safeParse(body)
    
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
         diagnostic: { got: tenantMedicoId, expected: existing.medico_id } 
       }, { status: 403 })
    }

    // 3. Ejecutar actualización con el filtro de ID solamente (para máxima compatibilidad RLS)
    const { data: updated, error: updateError } = await supabase
      .from('bloqueos_agenda')
      .update(updates)
      .eq('id', id)
      .select()

    if (updateError) {
       // Si falla aquí, es 100% RLS en Supabase
       if (updateError.code === '42501') {
          return NextResponse.json({ error: 'Error de Permisos (Supabase RLS): Tu rol no permite modificar bloqueos en la base de datos.' }, { status: 403 })
       }
       throw updateError
    }
    
    return NextResponse.json({ data: updated[0] })
  } catch (error: any) {
    console.error('Error updating bloqueo:', error)
    return NextResponse.json({ error: error.message || 'Error del servidor' }, { status: 500 })
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

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, medico_id')
      .eq('id', user.id)
      .single()

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
    const { error: deleteError } = await supabase
      .from('bloqueos_agenda')
      .delete()
      .eq('id', id)

    if (deleteError) {
      if (deleteError.code === '42501') {
         return NextResponse.json({ error: 'Error de Permisos (Supabase RLS): La base de datos denegó el borrado de este bloqueo.' }, { status: 403 })
      }
      throw deleteError
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting bloqueo:', error)
    return NextResponse.json({ error: error.message || 'Error del servidor' }, { status: 500 })
  }
}
