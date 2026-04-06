'use client'

import { useState } from 'react'
import { Check, X, Bell, Loader2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { responderSolicitud } from '@/app/onboarding/actions'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface NotificationItem {
  id: string
  type: string
  title: string
  message: string
  date: string
  read: boolean
  payload: any
}

interface Props {
  notificaciones: NotificationItem[]
  isMedico: boolean
  medicoId: string
}

export function NotificacionesList({ notificaciones: initialNotificaciones, isMedico, medicoId }: Props) {
  const [notificaciones, setNotificaciones] = useState(initialNotificaciones)
  const [respondiendo, setRespondiendo] = useState<string | null>(null)

  const handleResponderSolicitud = async (solicitudId: string, decision: 'aprobada' | 'rechazada') => {
    setRespondiendo(solicitudId)
    try {
      const { error } = await responderSolicitud(solicitudId, decision)
      if (error) throw new Error(error)
      
      toast.success(decision === 'aprobada' ? 'Solicitud aprobada' : 'Solicitud rechazada')
      setNotificaciones(prev => prev.filter(n => n.payload?.id !== solicitudId))
    } catch (err) {
      toast.error('Ocurrió un error')
    } finally {
      setRespondiendo(null)
    }
  }

  if (notificaciones.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-card rounded-xl border border-dashed">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Bell className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-xl font-semibold">Al día</h3>
        <p className="text-muted-foreground mt-2">No tienes notificaciones pendientes.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {notificaciones.map((n) => (
        <Card key={n.id} className={`p-4 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center ${!n.read ? 'bg-primary/5 border-primary/20' : ''}`}>
          <div className="flex items-start gap-4 flex-1">
             <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Bell className="w-5 h-5 text-primary" />
             </div>
             <div>
               <div className="flex items-center gap-2">
                 <h4 className="font-semibold text-base">{n.title}</h4>
                 {!n.read && <span className="w-2 h-2 rounded-full bg-primary"></span>}
               </div>
               <p className="text-sm text-foreground/80 mt-1">{n.message}</p>
               <span className="text-xs text-muted-foreground mt-2 block">
                  {formatDistanceToNow(new Date(n.date), { addSuffix: true, locale: es })}
               </span>
             </div>
          </div>

          {/* Acciones específicas por tipo */}
          {n.type === 'solicitud' && isMedico && (
            <div className="flex gap-2 w-full md:w-auto mt-4 md:mt-0">
               <Button 
                variant="outline"
                size="sm"
                onClick={() => handleResponderSolicitud(n.payload.id, 'rechazada')}
                disabled={respondiendo === n.payload.id}
                className="flex-1 md:flex-none"
               >
                 {respondiendo === n.payload.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><X className="h-4 w-4 mr-1"/> Rechazar</>}
               </Button>
               <Button 
                size="sm"
                onClick={() => handleResponderSolicitud(n.payload.id, 'aprobada')}
                disabled={respondiendo === n.payload.id}
                className="flex-1 md:flex-none bg-primary hover:bg-primary/90"
               >
                 {respondiendo === n.payload.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1"/> Aprobar</>}
               </Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}
