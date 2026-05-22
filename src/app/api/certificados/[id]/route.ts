import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as z from 'zod'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

interface RouteParams {
  params: Promise<{ id: string }>
}

async function getTenantMedicoId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, medico_id')
    .eq('id', userId)
    .single()
  return profile?.role === 'medico' ? userId : profile?.medico_id ?? null
}

// ── GET /api/certificados/[id] ────────────────────────────────

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rl = rateLimit(request, { key: `certificados_get_one:${user.id}`, limit: 120, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const { data, error } = await supabase
      .from('certificados')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    return NextResponse.json({ data })
  } catch (err) {
    console.error('[GET /api/certificados/[id]]', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

// ── PATCH /api/certificados/[id] ──────────────────────────────
// Solo permite actualizar campos clínicos, nunca metadatos como firmado_por o paciente_id

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rl = rateLimit(request, { key: `certificados_patch:${user.id}`, limit: 30, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const body = await request.json()

    // Schema inline con solo los campos clínicos editables (el schema principal tiene .transform y no soporta .pick)
    const patchSchema = z.object({
      contenido: z.string().min(10).optional(),
      dias_reposo: z.coerce.number().int().min(1).optional().nullable(),
      fecha_inicio_reposo: z.string().optional().nullable(),
      valido_hasta: z.string().optional().nullable(),
      fecha_certificado: z.string().optional(),
    })

    const result = patchSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: result.error.format() }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('certificados')
      .update(result.data)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ data })
  } catch (err) {
    console.error('[PATCH /api/certificados/[id]]', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

// ── DELETE /api/certificados/[id] ─────────────────────────────

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rl = rateLimit(request, { key: `certificados_delete:${user.id}`, limit: 10, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const tenantMedicoId = await getTenantMedicoId(supabase, user.id)
    if (!tenantMedicoId) return NextResponse.json({ error: 'Sin tenant asignado' }, { status: 403 })

    // Verificar tenant explícitamente antes de eliminar (doble capa sobre RLS)
    const { data: existing } = await supabase
      .from('certificados')
      .select('firmado_por')
      .eq('id', id)
      .single()

    if (!existing || existing.firmado_por !== tenantMedicoId) {
      return NextResponse.json({ error: 'No autorizado para eliminar este certificado' }, { status: 403 })
    }

    const { error } = await supabase.from('certificados').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/certificados/[id]]', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
