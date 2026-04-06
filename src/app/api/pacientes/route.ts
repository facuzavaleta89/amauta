import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { pacienteSchema } from '@/lib/validations/paciente.schema'

export async function GET(request: NextRequest) {
  try {
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
      profile?.role === 'medico'    ? user.id :
      profile?.role === 'asistente' ? profile.medico_id :
      null

    if (!tenantMedicoId) {
      return NextResponse.json({ error: 'No autorizado: sin tenant asignado' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || ''

    let dbQuery = supabase
      .from('pacientes')
      .select('id, nombre_completo, dni, obra_social_id, numero_afiliado, telefono, email')
      .eq('creado_por', tenantMedicoId)

    if (query && query.trim().length > 0) {
      dbQuery = dbQuery.or(`nombre_completo.ilike.%${query.trim()}%,dni.ilike.%${query.trim()}%`)
    }

    const { data: pacientes, error } = await dbQuery.order('nombre_completo', { ascending: true }).limit(20)

    if (error) {
      console.error('SUPABASE BUSCAR PACIENTE ERROR:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: pacientes })
  } catch (error) {
    console.error('Error fetching pacientes:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Determinar el medico_id del tenant:
    // - Si es médico: su propio id
    // - Si es asistente: el medico_id al que está vinculado
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, medico_id')
      .eq('id', user.id)
      .single()

    const tenantMedicoId =
      profile?.role === 'medico'    ? user.id :
      profile?.role === 'asistente' ? profile.medico_id :
      null

    if (!tenantMedicoId) {
      return NextResponse.json({ error: 'No autorizado: sin tenant asignado' }, { status: 403 })
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

    // Insertar usando el medico_id del tenant como creado_por
    const { data: paciente, error } = await supabase
      .from('pacientes')
      .insert({
        ...result.data,
        creado_por: tenantMedicoId   // ← siempre el ID del médico, no del asistente
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

    // Crear historia clínica vacía para el paciente
    await supabase.from('historia_clinica').insert({
      paciente_id: paciente.id,
      creado_por: tenantMedicoId   // ← ídem: ID del médico
    })

    return NextResponse.json({ data: paciente }, { status: 201 })
  } catch (error) {
    console.error('Error al registrar paciente:', error)
    return NextResponse.json(
      { error: 'Ocurrió un error inesperado al procesar la solicitud' },
      { status: 500 }
    )
  }
}

