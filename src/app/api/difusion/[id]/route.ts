import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { difusionBaseSchema } from '@/lib/validations/difusion.schema'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

async function getTenantMedicoId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, medico_id')
    .eq('id', userId)
    .single()
  return profile?.role === 'medico' ? userId : profile?.medico_id ?? null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rl = rateLimit(request, { key: `difusion_get_one:${user.id}`, limit: 120, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const tenantMedicoId = await getTenantMedicoId(supabase, user.id)
    if (!tenantMedicoId) return NextResponse.json({ error: 'Sin tenant asignado' }, { status: 403 })

    const { data, error } = await supabase
      .from('difusion_posts')
      .select('*')
      .eq('id', id)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Post no encontrado' }, { status: 404 })

    return NextResponse.json({ data })
  } catch (err) {
    console.error('[GET /api/difusion/[id]]', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rl = rateLimit(request, { key: `difusion_patch:${user.id}`, limit: 30, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const tenantMedicoId = await getTenantMedicoId(supabase, user.id)
    if (!tenantMedicoId) return NextResponse.json({ error: 'Sin tenant asignado' }, { status: 403 })

    const body = await request.json()
    const result = difusionBaseSchema.partial().safeParse(body)
    if (!result.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: result.error.format() }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('difusion_posts')
      .update(result.data)
      .eq('id', id)
      // RLS ensure only authorized can update, but we can also ensure medico_id matches (redundant but safe)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ data })
  } catch (err) {
    console.error('[PATCH /api/difusion/[id]]', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rl = rateLimit(request, { key: `difusion_delete:${user.id}`, limit: 10, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    // RLS: solo el médico puede eliminar. Está configurado en la base de datos, 
    // pero intentamos ejecutar el delete y validamos el error.
    const { error } = await supabase
      .from('difusion_posts')
      .delete()
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error('[DELETE /api/difusion/[id]]', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
