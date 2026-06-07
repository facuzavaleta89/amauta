import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { historiaSchema } from '@/lib/validations/historia.schema'
import { uuidSchema } from '@/lib/validations/shared'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params

  const idValidation = uuidSchema.safeParse(id)
  if (!idValidation.success) {
    return NextResponse.json({ error: 'ID de paciente inválido' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, medico_id, ver_historia_clinica')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })
  }

  // Asistentes necesitan permiso explícito para modificar historias clínicas
  if (profile.role === 'asistente' && !profile.ver_historia_clinica) {
    return NextResponse.json({ error: 'Sin permisos para modificar historias clínicas' }, { status: 403 })
  }

  const tenantMedicoId =
    profile.role === 'medico'    ? user.id :
    profile.role === 'asistente' ? profile.medico_id :
    null

  if (!tenantMedicoId) {
    return NextResponse.json({ error: 'No autorizado: sin tenant asignado' }, { status: 403 })
  }

  // Verificar que el paciente pertenece al tenant antes de tocar su historia
  const { data: paciente } = await supabase
    .from('pacientes')
    .select('id')
    .eq('id', id)
    .eq('creado_por', tenantMedicoId)
    .single()

  if (!paciente) {
    return NextResponse.json({ error: 'Paciente no encontrado o sin permisos' }, { status: 404 })
  }

  const body = await request.json()
  const result = historiaSchema.safeParse(body)

  if (!result.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: result.error.format() },
      { status: 400 }
    )
  }

  const updateData = {
    ...result.data,
    paciente_id: id,
    updated_by: user.id
  }

  const { data: existing } = await supabase
    .from('historia_clinica')
    .select('id')
    .eq('paciente_id', id)
    .single()

  let response;

  if (existing) {
    response = await supabase
      .from('historia_clinica')
      .update(updateData)
      .eq('paciente_id', id)
      .select()
      .single()
  } else {
    response = await supabase
      .from('historia_clinica')
      .insert({ ...updateData, creado_por: tenantMedicoId })
      .select()
      .single()
  }

  if (response.error) {
    console.error('Error guardando historia:', response.error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }

  return NextResponse.json({ data: response.data })
}
