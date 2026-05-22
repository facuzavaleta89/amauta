import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { difusionSchema } from '@/lib/validations/difusion.schema'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

async function getTenantMedicoId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, medico_id')
    .eq('id', userId)
    .single()
  return profile?.role === 'medico' ? userId : profile?.medico_id ?? null
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rl = rateLimit(request, { key: `difusion_get:${user.id}`, limit: 60, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const tenantMedicoId = await getTenantMedicoId(supabase, user.id)
    if (!tenantMedicoId) return NextResponse.json({ error: 'Sin tenant asignado' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const estado = searchParams.get('estado')
    const q = searchParams.get('q')

    let query = supabase
      .from('difusion_posts')
      .select('id, titulo, contenido, estado, canal, asunto_email, created_at, updated_at')
      .eq('medico_id', tenantMedicoId)
      .order('created_at', { ascending: false })

    if (estado && estado !== 'todos') query = query.eq('estado', estado)
    if (q) query = query.ilike('titulo', `%${q}%`)

    const { data, error } = await query.limit(50)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ data })
  } catch (err) {
    console.error('[GET /api/difusion]', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rl = rateLimit(request, { key: `difusion_post:${user.id}`, limit: 30, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const tenantMedicoId = await getTenantMedicoId(supabase, user.id)
    if (!tenantMedicoId) return NextResponse.json({ error: 'Sin tenant asignado' }, { status: 403 })

    const body = await request.json()
    const result = difusionSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: result.error.format() }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('difusion_posts')
      .insert({
        ...result.data,
        medico_id: tenantMedicoId,
        creado_por: user.id,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/difusion]', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
