import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { pacienteSchema } from '@/lib/validations/paciente.schema'
import { uuidSchema } from '@/lib/validations/shared'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

interface RouteContext {
  params: Promise<{ id: string }>
}

async function getTenantMedicoId(supabase: any, userId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, medico_id')
    .eq('id', userId)
    .single()

  if (!profile) return null
  return profile.role === 'medico' ? userId : profile.medico_id ?? null
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params

    // Validar UUID
    const idValidation = uuidSchema.safeParse(id)
    if (!idValidation.success) {
      return NextResponse.json({ error: 'ID de paciente inválido' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Rate Limiting
    const rl = rateLimit(request, { key: `paciente_get_one:${user.id}`, limit: 120, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const tenantMedicoId = await getTenantMedicoId(supabase, user.id)
    if (!tenantMedicoId) {
      return NextResponse.json({ error: 'Sin tenant asignado' }, { status: 403 })
    }

    const { data: paciente, error } = await supabase
      .from('pacientes')
      .select('*, obras_sociales ( nombre )')
      .eq('id', id)
      .eq('creado_por', tenantMedicoId)
      .single()

    if (error || !paciente) {
      return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ data: paciente })
  } catch (error: any) {
    console.error('Error GET /api/pacientes/[id]:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params

    // Validar UUID
    const idValidation = uuidSchema.safeParse(id)
    if (!idValidation.success) {
      return NextResponse.json({ error: 'ID de paciente inválido' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Rate Limiting
    const rl = rateLimit(request, { key: `paciente_patch:${user.id}`, limit: 30, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const tenantMedicoId = await getTenantMedicoId(supabase, user.id)
    if (!tenantMedicoId) {
      return NextResponse.json({ error: 'Sin tenant asignado' }, { status: 403 })
    }

    // Verificar pertenencia al tenant antes de actualizar
    const { data: existing, error: findError } = await supabase
      .from('pacientes')
      .select('id')
      .eq('id', id)
      .eq('creado_por', tenantMedicoId)
      .single()

    if (findError || !existing) {
      return NextResponse.json({ error: 'Paciente no encontrado o sin permisos' }, { status: 404 })
    }

    const body = await request.json()
    const result = pacienteSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: result.error.format() },
        { status: 400 }
      )
    }

    const { data: paciente, error } = await supabase
      .from('pacientes')
      .update(result.data)
      .eq('id', id)
      .eq('creado_por', tenantMedicoId)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Ya existe otro paciente con ese DNI' },
          { status: 400 }
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: paciente })
  } catch (error: any) {
    console.error('Error PATCH /api/pacientes/[id]:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params

    // Validar UUID
    const idValidation = uuidSchema.safeParse(id)
    if (!idValidation.success) {
      return NextResponse.json({ error: 'ID de paciente inválido' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Rate Limiting
    const rl = rateLimit(request, { key: `paciente_delete:${user.id}`, limit: 10, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const tenantMedicoId = await getTenantMedicoId(supabase, user.id)
    if (!tenantMedicoId) {
      return NextResponse.json({ error: 'Sin tenant asignado' }, { status: 403 })
    }

    // Verificar pertenencia al tenant antes de borrar
    const { data: existing, error: findError } = await supabase
      .from('pacientes')
      .select('id')
      .eq('id', id)
      .eq('creado_por', tenantMedicoId)
      .single()

    if (findError || !existing) {
      return NextResponse.json({ error: 'Paciente no encontrado o sin permisos' }, { status: 404 })
    }

    const { error } = await supabase
      .from('pacientes')
      .delete()
      .eq('id', id)
      .eq('creado_por', tenantMedicoId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error DELETE /api/pacientes/[id]:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
