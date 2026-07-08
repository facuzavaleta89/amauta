'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Users, User, Check, Reply, Loader2, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { MensajeInterno } from '@/types/mensaje'
import { marcarMensajeLeido } from '@/app/(app)/notificaciones/actions'

interface Props {
  mensaje: MensajeInterno
  currentUserId: string
  onMarcadoLeido: (id: string) => void
  onReply: (mensaje: MensajeInterno) => void
}

export function MensajeCard({ mensaje, currentUserId, onMarcadoLeido, onReply }: Props) {
  const [marking, setMarking] = useState(false)

  const esMio = mensaje.remitente_id === currentUserId
  const yaLeido = mensaje.es_grupal
    ? (mensaje.lecturas ?? []).some((l) => l.user_id === currentUserId)
    : mensaje.leido

  async function handleMarcarLeido() {
    setMarking(true)
    try {
      const { error } = await marcarMensajeLeido(mensaje.id)
      if (error) throw new Error(error)
      onMarcadoLeido(mensaje.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al marcar')
    } finally {
      setMarking(false)
    }
  }

  return (
    <div
      className={`rounded-xl border p-4 transition-all ${
        !yaLeido && !esMio
          ? 'bg-primary/5 border-primary/20'
          : 'bg-card border-border'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Ícono de tipo */}
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          {mensaje.es_grupal ? (
            <Users className="w-4 h-4 text-primary" />
          ) : (
            <User className="w-4 h-4 text-primary" />
          )}
        </div>

        {/* Contenido */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Cabecera */}
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm text-foreground">
                  {mensaje.asunto}
                </span>
                {!yaLeido && !esMio && (
                  <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                )}
                {mensaje.es_grupal && (
                  <Badge variant="secondary" className="text-[10px] font-medium">
                    Grupal
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {esMio ? (
                  <>
                    Enviado a{' '}
                    <span className="font-medium">
                      {mensaje.es_grupal ? 'todos' : (mensaje.destinatario?.full_name ?? 'Desconocido')}
                    </span>
                  </>
                ) : (
                  <>
                    De{' '}
                    <span className="font-medium">
                      {mensaje.remitente?.full_name ?? 'Desconocido'}
                    </span>
                  </>
                )}
              </p>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {format(new Date(mensaje.created_at), "d MMM, HH:mm", { locale: es })}
            </span>
          </div>

          {/* Cuerpo */}
          <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
            {mensaje.cuerpo}
          </p>

          {/* Acciones */}
          <div className="flex items-center gap-2 pt-1">
            {!esMio && !yaLeido && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={handleMarcarLeido}
                disabled={marking}
              >
                {marking ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3" />
                )}
                Marcar como leído
              </Button>
            )}
            {!esMio && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => onReply(mensaje)}
              >
                <Reply className="h-3 w-3" />
                Responder
              </Button>
            )}
            {!esMio && yaLeido && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Circle className="h-2 w-2 fill-muted-foreground" />
                Leído
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
