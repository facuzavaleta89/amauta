import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { uuidSchema } from '@/lib/validations/shared'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

interface RouteContext {
  params: Promise<{ id: string }>
}

// POST /api/pacientes/[id]/archivar
// Body: { archivar: boolean } → true = archivar (archivado_at = now), false = desarchivar (null).
// EXCLUSIVO DEL MÉDICO: se valida el rol explícitamente en el servidor, no solo por RLS.
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
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

    const rl = await rateLimit(request, { key: `paciente_archivar:${user.id}`, limit: 30, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    // Validar explícitamente que el usuario sea médico (no confiar solo en RLS).
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'medico') {
      return NextResponse.json(
        { error: 'Solo el médico titular puede archivar o desarchivar pacientes' },
        { status: 403 }
      )
    }

    // El médico es dueño del tenant: su id es el creado_por de sus pacientes.
    const { data: existing, error: findError } = await supabase
      .from('pacientes')
      .select('id')
      .eq('id', id)
      .eq('creado_por', user.id)
      .single()

    if (findError || !existing) {
      return NextResponse.json({ error: 'Paciente no encontrado o sin permisos' }, { status: 404 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body.archivar !== 'boolean') {
      return NextResponse.json({ error: 'Falta el campo "archivar" (boolean)' }, { status: 400 })
    }

    const archivado_at = body.archivar ? new Date().toISOString() : null

    const { data, error } = await supabase
      .from('pacientes')
      .update({ archivado_at })
      .eq('id', id)
      .eq('creado_por', user.id)
      .select('id, archivado_at')
      .single()

    if (error) {
      console.error('Error archivando paciente:', error)
      return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error POST /api/pacientes/[id]/archivar:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
