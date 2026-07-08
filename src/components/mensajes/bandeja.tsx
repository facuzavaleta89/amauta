'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { MessageSquare, Plus, Users, User, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils/cn'
import type { MensajeInterno } from '@/types/mensaje'
import { HiloModal } from './hilo-modal'
import { MensajeForm } from '@/components/notificaciones/mensaje-form'

interface Usuario {
  id: string
  full_name: string
  role: string
}

interface Props {
  threads: MensajeInterno[]
  currentUserId: string
  usuarios: Usuario[]
}

export function Bandeja({ threads: initialThreads, currentUserId, usuarios }: Props) {
  const router = useRouter()
  const [threads] = useState<MensajeInterno[]>(initialThreads)
  const [hiloAbierto, setHiloAbierto] = useState<MensajeInterno | null>(null)
  const [mostrarNuevo, setMostrarNuevo] = useState(false)

  function esNoLeido(m: MensajeInterno): boolean {
    if (m.remitente_id === currentUserId) return false
    if (m.es_grupal) return !(m.lecturas ?? []).some((l) => l.user_id === currentUserId)
    return !m.leido
  }

  function handleMensajeEnviado() {
    setMostrarNuevo(false)
    router.refresh()
  }

  function handleRespuestaEnviada() {
    router.refresh()
  }

  return (
    <>
      {/* Barra superior */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-semibold text-foreground">Bandeja de mensajes</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {threads.length === 0
              ? 'Sin mensajes aún'
              : `${threads.length} conversación${threads.length !== 1 ? 'es' : ''}`}
          </p>
        </div>
        <Button
          id="nuevo-mensaje-btn"
          size="sm"
          onClick={() => setMostrarNuevo(true)}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Nuevo mensaje
        </Button>
      </div>

      {/* Lista de threads */}
      {threads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-card rounded-xl border border-dashed">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <MessageSquare className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Sin mensajes</h3>
          <p className="text-sm text-muted-foreground mt-2 text-center max-w-xs">
            No hay conversaciones todavía. Enviá el primer mensaje al equipo.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-6 gap-2"
            onClick={() => setMostrarNuevo(true)}
          >
            <Send className="h-4 w-4" />
            Escribir mensaje
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {threads.map((m) => {
            const noLeido = esNoLeido(m)
            const esRemitente = m.remitente_id === currentUserId
            const remitenteNombre = m.remitente?.full_name ?? 'Desconocido'
            const destinatarioNombre = m.destinatario?.full_name ?? 'Todos'
            const fechaStr = format(new Date(m.created_at), "d MMM, HH:mm", { locale: es })

            return (
              <button
                key={m.id}
                onClick={() => setHiloAbierto(m)}
                className={cn(
                  'w-full text-left rounded-xl border px-4 py-3.5 transition-all duration-150',
                  'hover:border-primary/30 hover:bg-primary/5 hover:shadow-sm',
                  noLeido
                    ? 'bg-primary/5 border-primary/20'
                    : 'bg-card border-border'
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Ícono tipo */}
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    {m.es_grupal ? (
                      <Users className="w-4 h-4 text-primary" />
                    ) : (
                      <User className="w-4 h-4 text-primary" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Línea 1: asunto + fecha */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={cn('text-sm truncate', noLeido ? 'font-semibold text-foreground' : 'font-medium text-foreground/80')}>
                          {m.asunto}
                        </span>
                        {noLeido && (
                          <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                        )}
                        {m.es_grupal && (
                          <Badge variant="secondary" className="text-[10px] font-medium h-4 px-1.5 shrink-0">
                            Grupal
                          </Badge>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground shrink-0">{fechaStr}</span>
                    </div>

                    {/* Línea 2: de / para */}
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {esRemitente ? (
                        <>Enviado a <span className="font-medium">{m.es_grupal ? 'todos' : destinatarioNombre}</span></>
                      ) : (
                        <>De <span className="font-medium">{remitenteNombre}</span></>
                      )}
                    </p>

                    {/* Preview del cuerpo */}
                    <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-1">
                      {m.cuerpo}
                    </p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Modal de hilo */}
      {hiloAbierto && (
        <HiloModal
          mensajeRaiz={hiloAbierto}
          currentUserId={currentUserId}
          onClose={() => setHiloAbierto(null)}
          onMensajeEnviado={handleRespuestaEnviada}
        />
      )}

      {/* Modal de nuevo mensaje */}
      {mostrarNuevo && (
        <MensajeForm
          usuarios={usuarios}
          onSent={handleMensajeEnviado}
          onClose={() => setMostrarNuevo(false)}
        />
      )}
    </>
  )
}
