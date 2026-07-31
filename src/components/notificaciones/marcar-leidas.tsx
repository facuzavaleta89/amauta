'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCheck, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { marcarNotificacionesLeidas } from '@/app/(app)/notificaciones/actions'

interface Props {
  /** ¿Había avisos del sistema sin leer en esta carga de la página? */
  hayNoLeidas: boolean
}

/**
 * Marcado de los avisos del sistema como leídos, en la página /notificaciones.
 * Dos disparadores, una sola action:
 *   1. automático al ENTRAR (efecto de montaje), y
 *   2. el botón "Marcar todas como leídas" (fallback explícito).
 */
export function MarcarLeidas({ hayNoLeidas }: Props) {
  const router = useRouter()
  const [marcando, setMarcando] = useState(false)
  const yaMarcado = useRef(false)

  // Marcado automático al entrar. Va en un EFECTO, no en el render del Server
  // Component de la página, por dos motivos:
  //   · `revalidatePath` no está soportado durante el render (Next corta con
  //     "used revalidatePath during render which is unsupported").
  //   · Un UPDATE en el render también correría en prerenders y reintentos.
  // El listado ya se pintó con el estado leído/no leído PREVIO —NotificacionesList
  // lo snapshotea en su `useState` al montarse—, así que el `router.refresh()` de
  // acá baja el badge de la campanita SIN borrar los puntos azules de esta visita:
  // el médico ve cuáles estaban sin leer al llegar.
  useEffect(() => {
    if (!hayNoLeidas || yaMarcado.current) return
    yaMarcado.current = true // no repetir en el re-render del refresh (ni en StrictMode)
    void marcarNotificacionesLeidas().then(({ error }) => {
      if (!error) router.refresh()
    })
  }, [hayNoLeidas, router])

  async function handleMarcarTodas() {
    setMarcando(true)
    const { error } = await marcarNotificacionesLeidas()
    setMarcando(false)
    if (error) {
      toast.error('No se pudieron marcar como leídas')
      return
    }
    yaMarcado.current = true
    toast.success('Notificaciones marcadas como leídas')
    router.refresh()
  }

  return (
    <Button
      id="marcar-notificaciones-leidas"
      variant="outline"
      size="sm"
      className="gap-2"
      onClick={handleMarcarTodas}
      // Con el marcado automático de arriba, lo normal es que quede deshabilitado
      // a los pocos instantes de entrar: es la señal de "no queda nada por marcar".
      disabled={marcando || !hayNoLeidas}
    >
      {marcando ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <CheckCheck className="h-4 w-4" />
      )}
      Marcar todas como leídas
    </Button>
  )
}
