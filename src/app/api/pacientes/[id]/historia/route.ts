import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { historiaSchema } from '@/lib/validations/historia.schema'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const profileRes = await supabase.from('profiles').select('id').eq('id', user.id).single()
  if (profileRes.error) {
    return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })
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
    // Actualizar si ya existe
    response = await supabase
      .from('historia_clinica')
      .update(updateData)
      .eq('paciente_id', id)
      .select()
      .single()
  } else {
    // Crear si no existe
    response = await supabase
      .from('historia_clinica')
      .insert({ ...updateData, creado_por: user.id })
      .select()
      .single()
  }

  if (response.error) {
    console.error("Error guardando historia:", response.error)
    return NextResponse.json({ error: response.error.message }, { status: 500 })
  }

  return NextResponse.json({ data: response.data })
}
