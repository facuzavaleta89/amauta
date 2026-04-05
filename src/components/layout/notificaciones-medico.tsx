'use client'

import { useState, useEffect, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { responderSolicitud } from '@/app/onboarding/actions'
import {
  Bell,
  Check,
  X,
  Loader2,
  UserPlus,
  Mail,
  MessageSquare,
  Clock,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

interface Solicitud {
  id: string
  solicitante_nombre: string
  solicitante_email: string
  mensaje: string | null
  created_at: string
}

interface Props {
  medicoId: string
  solicitudesIniciales: Solicitud[]
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return 'Hace un momento'
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)}m`
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)}h`
  return `Hace ${Math.floor(diff / 86400)}d`
}

export function NotificacionesMedico({ medicoId, solicitudesIniciales }: Props) {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>(solicitudesIniciales)
  const [open, setOpen] = useState(false)
  const [respondiendo, setRespondiendo] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // ── Realtime subscription ──────────────────────────────────
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`solicitudes-${medicoId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'solicitudes_asistente',
          filter: `medico_id=eq.${medicoId}`,
        },
        async (payload) => {
          // Nueva solicitud recibida — enriquecer con nombre/email
          // via server action (fetch minimalista)
          const nueva = payload.new as {
            id: string
            solicitante_id: string
            mensaje: string | null
            created_at: string
          }

          // Hacemos un pequeño fetch para obtener nombre/email del asistente
          const res = await fetch(
            `/api/solicitudes/${nueva.id}/info`
          ).catch(() => null)

          if (res?.ok) {
            const info = await res.json()
            setSolicitudes((prev) => [
              {
                id: nueva.id,
                solicitante_nombre: info.nombre,
                solicitante_email: info.email,
                mensaje: nueva.mensaje,
                created_at: nueva.created_at,
              },
              ...prev,
            ])
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [medicoId])

  const count = solicitudes.length

  function handleResponder(solicitudId: string, decision: 'aprobada' | 'rechazada') {
    setRespondiendo(solicitudId)
    startTransition(async () => {
      const { error } = await responderSolicitud(solicitudId, decision)
      if (!error) {
        setSolicitudes((prev) => prev.filter((s) => s.id !== solicitudId))
      }
      setRespondiendo(null)
    })
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          id="notificaciones-btn"
          aria-label={`Notificaciones${count > 0 ? ` — ${count} pendientes` : ''}`}
          className="relative flex items-center justify-center w-9 h-9 rounded-lg hover:bg-muted transition-colors outline-none"
        >
          <Bell className="h-4.5 w-4.5 text-muted-foreground" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white leading-none">
              {count > 9 ? '9+' : count}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-80 p-0 overflow-hidden"
        sideOffset={8}
      >
        {/* Header del panel */}
        <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b border-border">
          <div>
            <p className="text-sm font-semibold text-foreground">Solicitudes</p>
            <p className="text-xs text-muted-foreground">
              {count === 0
                ? 'Sin solicitudes pendientes'
                : `${count} pendiente${count > 1 ? 's' : ''}`}
            </p>
          </div>
          {count > 0 && (
            <Badge variant="secondary" className="text-[10px] font-semibold">
              {count} nueva{count > 1 ? 's' : ''}
            </Badge>
          )}
        </div>

        {/* Lista */}
        {count === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
              <Bell className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">Todo al día</p>
            <p className="text-xs text-muted-foreground mt-1">
              No tenés solicitudes de asistentes pendientes.
            </p>
          </div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            {solicitudes.map((s, i) => (
              <div key={s.id}>
                {i > 0 && <Separator />}
                <div className="px-4 py-4 space-y-3">
                  {/* Info del asistente */}
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-primary text-xs font-bold">
                        {s.solicitante_nombre
                          .split(' ')
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join('')
                          .toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground truncate">
                          {s.solicitante_nombre}
                        </p>
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                          <Clock className="h-3 w-3" />
                          {timeAgo(s.created_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                        <p className="text-xs text-muted-foreground truncate">
                          {s.solicitante_email}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Mensaje del asistente */}
                  {s.mensaje && (
                    <div className="flex items-start gap-2 bg-muted/50 rounded-lg px-3 py-2">
                      <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                        {s.mensaje}
                      </p>
                    </div>
                  )}

                  {/* Etiqueta */}
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 rounded-lg px-3 py-1.5">
                    <UserPlus className="h-3.5 w-3.5 shrink-0" />
                    <span>Solicita acceso como asistente</span>
                  </div>

                  {/* Botones de acción */}
                  <div className="flex gap-2">
                    <button
                      id={`rechazar-${s.id}`}
                      disabled={isPending && respondiendo === s.id}
                      onClick={() => handleResponder(s.id, 'rechazada')}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isPending && respondiendo === s.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                      Rechazar
                    </button>
                    <button
                      id={`aprobar-${s.id}`}
                      disabled={isPending && respondiendo === s.id}
                      onClick={() => handleResponder(s.id, 'aprobada')}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isPending && respondiendo === s.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      Aprobar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
