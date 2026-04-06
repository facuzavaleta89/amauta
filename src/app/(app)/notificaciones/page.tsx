import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NotificacionesList } from '@/components/notificaciones/list'
import PageHeader from '@/components/shared/page-header'
import { obtenerSolicitudesPendientes } from '@/app/onboarding/actions'

export const metadata = {
  title: 'Notificaciones',
}

export default async function NotificacionesPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isMedico = profile?.role === 'medico'

  const rawSolicitudes = isMedico 
      ? (await obtenerSolicitudesPendientes()).data || [] 
      : []

  // Petición a notificaciones nativas
  const { data: dbNotificaciones } = await supabase
    .from('notificaciones')
    .select('*')
    .eq('medico_id', user.id)
    .order('created_at', { ascending: false })

  // Simplify structure to match unified notifications format
  const solicitudesMap = rawSolicitudes.map((s: any) => ({
      id: s.id,
      type: 'solicitud',
      title: 'Solicitud de vinculación',
      message: `${s.solicitante_nombre} (${s.solicitante_email}) quiere vincularse como tu asistente.`,
      date: s.created_at,
      read: false,
      payload: s
  }))

  const systemMap = (dbNotificaciones || []).map((n: any) => ({
      id: n.id,
      type: n.tipo,
      title: n.titulo,
      message: n.mensaje,
      date: n.created_at,
      read: n.leida,
      payload: n.payload
  }))

  const notificaciones = [...solicitudesMap, ...systemMap].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Centro de Notificaciones"
        description="Gestioná tus avisos, recordatorios y solicitudes de asistentes."
      />
      <NotificacionesList notificaciones={notificaciones} isMedico={isMedico} medicoId={user.id} />
    </div>
  )
}
