import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PageHeader from '@/components/shared/page-header'
import { Bandeja } from '@/components/mensajes/bandeja'
import { obtenerBandeja } from './actions'
import { obtenerUsuariosTenant } from '@/app/(app)/notificaciones/actions'

export const metadata = {
  title: 'Mensajes',
}

// El param `?hilo=` NO se lee acá: el modal se deriva de la URL en el cliente con
// `useSearchParams()` (ver bandeja.tsx). Pasarlo además como prop era una segunda
// fuente de verdad que se desincronizaba — al cerrar el modal la URL ya no tiene el
// param pero la prop del servidor todavía sí, y el modal se reabría solo.
export default async function MensajesPage() {
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

  // Primera página. `obtenerBandeja` tiene los dos parámetros OPCIONALES justamente
  // para que esta llamada siga siendo la de siempre: el tamaño sale de BANDEJA_PAGINA.
  const { threads, currentUserId, hayMas } = await obtenerBandeja()

  const { data: usuarios } = await obtenerUsuariosTenant()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mensajes"
        description="Comunicación interna del consultorio. Conversaciones con el médico y el equipo."
      />
      <Bandeja
        threads={threads}
        currentUserId={currentUserId}
        hayMasInicial={hayMas}
        usuarios={usuarios ?? []}
      />
    </div>
  )
}
