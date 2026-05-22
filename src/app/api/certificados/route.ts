import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { certificadoSchema } from '@/lib/validations/pedido.schema'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

async function getTenantMedicoId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, medico_id')
    .eq('id', userId)
    .single()
  return profile?.role === 'medico' ? userId : profile?.medico_id ?? null
}

// ── GET /api/certificados ─────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rl = rateLimit(request, { key: `certificados_get:${user.id}`, limit: 60, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const tenantMedicoId = await getTenantMedicoId(supabase, user.id)
    if (!tenantMedicoId) return NextResponse.json({ error: 'Sin tenant asignado' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const pacienteId = searchParams.get('paciente_id')
    const rawQ = searchParams.get('q')
    const q = rawQ ? rawQ.slice(0, 100) : null

    let query = supabase
      .from('certificados')
      .select(`
        id, paciente_id, paciente_nombre, paciente_dni,
        tipo, tipo_descripcion, fecha_certificado,
        pdf_path, created_at
      `)
      .eq('firmado_por', tenantMedicoId)
      .order('fecha_certificado', { ascending: false })

    if (pacienteId) query = query.eq('paciente_id', pacienteId)
    if (q) query = query.ilike('paciente_nombre', `%${q}%`)

    const { data, error } = await query.limit(50)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ data })
  } catch (err) {
    console.error('[GET /api/certificados]', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

// ── POST /api/certificados ────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rl = rateLimit(request, { key: `certificados_post:${user.id}`, limit: 30, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const tenantMedicoId = await getTenantMedicoId(supabase, user.id)
    if (!tenantMedicoId) return NextResponse.json({ error: 'Sin tenant asignado' }, { status: 403 })

    const body = await request.json()
    const result = certificadoSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: result.error.format() }, { status: 400 })
    }

    // Separar los campos calculados del transform
    const { fecha_inicio_reposo_clean: _, ...insertData } = result.data

    const { data, error } = await supabase
      .from('certificados')
      .insert({
        ...insertData,
        firmado_por: tenantMedicoId,
        fecha_certificado: insertData.fecha_certificado || new Date().toISOString().slice(0, 10),
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/certificados]', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
