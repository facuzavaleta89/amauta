import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { pacienteSchema } from '@/lib/validations/paciente.schema'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await request.json()

    // Validar con zod
    const result = pacienteSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: result.error.format() },
        { status: 400 }
      )
    }

    // Insertar usando Supabase
    // El RLS permite a cualquier autenticado hacer INSERT en pacientes
    const { data: paciente, error } = await supabase
      .from('pacientes')
      .insert({
        ...result.data,
        creado_por: user.id
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') { // unique violation
        return NextResponse.json(
          { error: 'Ya existe un paciente registrado con este DNI' },
          { status: 400 }
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    // Crear historia clinica generica empty for the user immediately
    await supabase.from('historia_clinica').insert({
      paciente_id: paciente.id,
      creado_por: user.id
    })

    return NextResponse.json({ data: paciente }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: 'Ocurrió un error inesperado al procesar la solicitud' },
      { status: 500 }
    )
  }
}
