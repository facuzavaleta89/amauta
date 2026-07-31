import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NotificacionesList } from '@/components/notificaciones/list'
import { MarcarLeidas } from '@/components/notificaciones/marcar-leidas'
import PageHeader from '@/components/shared/page-header'
import { obtenerItemsPagina } from './actions'
import { ITEM_TYPE_SOLICITUD } from '@/types/notificacion'

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

  // Solo médicos acceden a esta sección
  if (!isMedico) {
    redirect('/dashboard')
  }

  // Fuente de verdad compartida con el badge de la campanita (ver actions.ts):
  // solicitudes de vinculación pendientes + avisos del sistema, ya normalizados y
  // ordenados por fecha. Acá se pide el HISTORIAL COMPLETO —leídos y no leídos—,
  // mientras que el badge pide solo lo no leído.
  const notificaciones = await obtenerItemsPagina()

  // ⚠ ORDEN DELIBERADO: esta página solo LEE. El marcado como leído lo dispara
  //   <MarcarLeidas> desde el cliente, después de que el listado ya se renderizó
  //   con `read` tal como estaba al entrar (así el médico ve cuáles venían sin
  //   leer, con su punto azul). Marcar acá, durante el render, además rompería:
  //   la action llama `revalidatePath`, no soportado durante el render.
  const hayNoLeidas = notificaciones.some(
    (n) => n.type !== ITEM_TYPE_SOLICITUD && !n.read
  )

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="Notificaciones"
        description="Solicitudes de vinculación de asistentes y avisos del sistema."
      >
        <MarcarLeidas hayNoLeidas={hayNoLeidas} />
      </PageHeader>
      <NotificacionesList
        notificaciones={notificaciones}
        isMedico={isMedico}
      />
    </div>
  )
}
