import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/solicitudes/[id]/info
// Retorna nombre y email del solicitante para el enrichment Realtime.
// Solo accesible por médicos autenticados.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'medico') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const admin = createAdminClient()

  const { data: solicitud } = await admin
    .from('solicitudes_asistente')
    .select('solicitante_id, medico_id')
    .eq('id', id)
    .single()

  if (!solicitud || solicitud.medico_id !== user.id) {
    return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  }

  const { data: perfil } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', solicitud.solicitante_id)
    .single()

  const { data: authUser } = await admin.auth.admin.getUserById(solicitud.solicitante_id)

  return NextResponse.json({
    nombre: perfil?.full_name ?? 'Asistente',
    email: authUser?.user?.email ?? '',
  })
}
