import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { resolverObraSocial, type ConObraSocial } from '@/lib/pacientes/obra-social'

// GET /api/difusion/destinatarios
// Lista los pacientes del tenant a los que el envío de difusión por email les puede
// llegar: activos (archivado_at IS NULL) y con email de FORMATO válido. Refleja
// exactamente a quién intentará enviar el backend (mismo filtro que /enviar), para que
// la UI no muestre destinatarios que después se descartarían.

const emailFormat = z.string().email()

// Mismo patrón que el resto de /api/difusion.
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

    const rl = await rateLimit(request, { key: `difusion_destinatarios:${user.id}`, limit: 60, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    // Tenant-only, sin chequeo de rol.
    const tenantMedicoId = await getTenantMedicoId(supabase, user.id)
    if (!tenantMedicoId) return NextResponse.json({ error: 'Sin tenant asignado' }, { status: 403 })

    // Sin .limit(): un consultorio unipersonal entra entero. Orden por nombre.
    const { data: pacientes, error } = await supabase
      .from('pacientes')
      .select('id, nombre_completo, email, sexo, obra_social_id, obra_social_otro, obras_sociales ( nombre )')
      .eq('creado_por', tenantMedicoId)
      .is('archivado_at', null)
      .not('email', 'is', null)
      .order('nombre_completo', { ascending: true })

    if (error) {
      console.error('[difusion/destinatarios] DB error:', error)
      return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
    }

    // Resolver obra social + descartar emails de formato inválido (mismo criterio que /enviar).
    const data = (pacientes ?? [])
      .map((p) => {
        // ⚠ La aserción reemplaza al cast que había antes y existe por la misma razón:
        // sin tipos generados de `Database`, supabase-js infiere el embebido como ARRAY,
        // pero PostgREST devuelve un OBJETO (la relación es many-to-one vía obra_social_id).
        const obra_social = resolverObraSocial(p as unknown as ConObraSocial)
        return {
          id: p.id,
          nombre_completo: p.nombre_completo,
          email: (p.email ?? '').trim(),
          sexo: p.sexo as 'masculino' | 'femenino' | 'otro',
          obra_social,
        }
      })
      .filter((p) => emailFormat.safeParse(p.email).success)

    return NextResponse.json({ data })
  } catch (err) {
    console.error('[GET /api/difusion/destinatarios]', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
