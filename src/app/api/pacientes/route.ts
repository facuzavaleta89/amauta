import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { pacienteSchema } from '@/lib/validations/paciente.schema'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { resolverAcceso } from '@/lib/auth/tenant'
import { sanitizarTextoBusqueda } from '@/lib/validations/shared'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const rl = await rateLimit(request, {
      key: `pacientes_get:${user.id}`,
      limit: 60,
      windowMs: 60 * 1000 // 1 minute
    })
    if (!rl.success) {
      return rateLimitResponse(rl.retryAfter!)
    }

    const acceso = await resolverAcceso(supabase, user.id, 'ver_pacientes')
    if (!acceso.ok) {
      const msg = acceso.motivo === 'sin-permiso' ? 'Sin permisos para ver pacientes'
                : acceso.motivo === 'sin-tenant'  ? 'No autorizado: sin tenant asignado'
                : 'Perfil no encontrado'
      return NextResponse.json({ error: msg }, { status: 403 })
    }
    const tenantMedicoId = acceso.tenantMedicoId

    const { searchParams } = new URL(request.url)
    // Criterio compartido de escapado de LIKE: trim + tope de 100 + escape de %, _ y \.
    const sanitizedQuery = sanitizarTextoBusqueda(searchParams.get('q'))

    let dbQuery = supabase
      .from('pacientes')
      .select('id, nombre_completo, dni, fecha_nacimiento, obra_social_id, obra_social_otro, numero_afiliado, telefono, email, obras_sociales ( nombre )')
      .eq('creado_por', tenantMedicoId)
      .is('archivado_at', null) // no ofrecer pacientes archivados al emitir documentos/turnos

    if (sanitizedQuery.length > 0) {
      dbQuery = dbQuery.or(`nombre_completo.ilike.%${sanitizedQuery}%,dni.ilike.%${sanitizedQuery}%`)
    }

    const { data: pacientes, error } = await dbQuery.order('nombre_completo', { ascending: true }).limit(20)

    if (error) {
      console.error('SUPABASE BUSCAR PACIENTE ERROR:', error)
      return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
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
    // ⚠ El alta exige `editar_pacientes` (no existe `crear_pacientes`): es el mismo
    // permiso que pide la RLS `pacientes_insert`.
    const acceso = await resolverAcceso(supabase, user.id, 'editar_pacientes')
    if (!acceso.ok) {
      const msg = acceso.motivo === 'sin-permiso' ? 'Sin permisos para dar de alta pacientes'
                : acceso.motivo === 'sin-tenant'  ? 'No autorizado: sin tenant asignado'
                : 'Perfil no encontrado'
      return NextResponse.json({ error: msg }, { status: 403 })
    }
    const tenantMedicoId = acceso.tenantMedicoId

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
      console.error('Error insertando paciente:', error)
      return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
    }

    // ⚠ Acá se creaba una fila VACÍA en `historia_clinica` (modelo viejo de HC: un
    // documento único de antecedentes por paciente). Se quitó al dar de baja ese modelo:
    // la historia clínica viva es el conjunto de `consultas`, que nacen del flujo de la HC.
    // La tabla NO se dropeó —queda dormida por la conservación de la HC (Ley 26.529)—,
    // pero ya no recibe filas nuevas. No re-agregar este insert.

    return NextResponse.json({ data: paciente }, { status: 201 })
  } catch (error) {
    console.error('Error al registrar paciente:', error)
    return NextResponse.json(
      { error: 'Ocurrió un error inesperado al procesar la solicitud' },
      { status: 500 }
    )
  }
}

