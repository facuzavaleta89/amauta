import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PageHeader from '@/components/shared/page-header'
import { Bandeja } from '@/components/mensajes/bandeja'
import { obtenerBandeja } from './actions'
import { obtenerUsuariosTenant } from '@/app/(app)/notificaciones/actions'

export const metadata = {
  title: 'Mensajes',
}

export default async function MensajesPage(props: {
  searchParams?: Promise<{ hilo?: string }>
}) {
  const { hilo } = (await props.searchParams) ?? {}
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, medico_id, acceso_mensajeria')
    .eq('id', user.id)
    .single()

  const isMedico = profile?.role === 'medico'
  const tieneAcceso = isMedico || (profile?.acceso_mensajeria ?? false)

  // Asistentes sin acceso a mensajería → redirigir a dashboard
  if (!tieneAcceso) {
    redirect('/sin-acceso')
  }

  const { threads, currentUserId } = await obtenerBandeja()

  const { data: usuarios } = await obtenerUsuariosTenant()

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="Mensajes"
        description="Comunicación interna del consultorio. Conversaciones con el médico y el equipo."
      />
      <Bandeja
        threads={threads}
        currentUserId={currentUserId}
        usuarios={usuarios ?? []}
        hiloInicial={hilo ?? null}
      />
    </div>
  )
}
