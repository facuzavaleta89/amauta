'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { X, Users, User, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import type { MensajeInterno } from '@/types/mensaje'
import { obtenerHilo } from '@/app/(app)/mensajes/actions'
import { enviarMensaje } from '@/app/(app)/notificaciones/actions'

interface Props {
  /** Mensaje raíz sobre el que se abre el modal */
  mensajeRaiz: MensajeInterno
  currentUserId: string
  onClose: () => void
  onMensajeEnviado: () => void
}

function Avatar({ nombre, size = 'md' }: { nombre: string; size?: 'sm' | 'md' }) {
  const initials = nombre
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const cls = size === 'sm'
    ? 'w-7 h-7 text-[10px]'
    : 'w-9 h-9 text-xs'
  return (
    <div className={`${cls} rounded-full bg-primary/10 flex items-center justify-center shrink-0 font-semibold text-primary`}>
      {initials}
    </div>
  )
}

function BurbujaMensaje({
  mensaje,
  currentUserId,
  esRaiz = false,
}: {
  mensaje: MensajeInterno
  currentUserId: string
  esRaiz?: boolean
}) {
  const esMio = mensaje.remitente_id === currentUserId
  const remitente = mensaje.remitente?.full_name ?? 'Desconocido'
  const fechaStr = format(new Date(mensaje.created_at), "d 'de' MMMM, HH:mm", { locale: es })

  return (
    <div className={`flex gap-3 ${esMio ? 'flex-row-reverse' : 'flex-row'}`}>
      <Avatar nombre={remitente} size={esRaiz ? 'md' : 'sm'} />
      <div className={`flex-1 max-w-[80%] space-y-1 ${esMio ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className={`flex items-center gap-2 ${esMio ? 'flex-row-reverse' : 'flex-row'}`}>
          <span className="text-xs font-semibold text-foreground">{esMio ? 'Vos' : remitente}</span>
          {mensaje.es_grupal && (
            <Badge variant="secondary" className="text-[10px] font-medium h-4 px-1.5">
              <Users className="h-2.5 w-2.5 mr-1" />
              Grupal
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground">{fechaStr}</span>
        </div>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap max-w-full ${
            esMio
              ? 'bg-primary text-primary-foreground rounded-tr-sm'
              : 'bg-muted text-foreground rounded-tl-sm'
          }`}
        >
          {esRaiz && (
            <p className={`text-[11px] font-semibold mb-1.5 ${esMio ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
              {mensaje.asunto}
            </p>
          )}
          {mensaje.cuerpo}
        </div>
      </div>
    </div>
  )
}

export function HiloModal({ mensajeRaiz, currentUserId, onClose, onMensajeEnviado }: Props) {
  const [mensajes, setMensajes] = useState<MensajeInterno[]>([mensajeRaiz])
  const [loading, setLoading] = useState(false)
  const [cargado, setCargado] = useState(false)
  const [respuesta, setRespuesta] = useState('')
  const [sending, setSending] = useState(false)

  // Cargar el hilo completo al abrir el modal
  async function cargarHilo() {
    if (cargado) return
    setLoading(true)
    try {
      const { mensajes: hilo, error } = await obtenerHilo(mensajeRaiz.id)
      if (error) {
        toast.error('Error al cargar el hilo')
        return
      }
      setMensajes(hilo)
      setCargado(true)
    } finally {
      setLoading(false)
    }
  }

  // Carga al montar
  useEffect(() => {
    cargarHilo()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleResponder() {
    if (!respuesta.trim()) {
      toast.error('Escribí tu respuesta antes de enviar')
      return
    }
    setSending(true)
    try {
      const esMensajeGrupal = mensajeRaiz.es_grupal
      const destinatarioId = esMensajeGrupal
        ? null
        : mensajeRaiz.remitente_id === currentUserId
          ? mensajeRaiz.destinatario_id
          : mensajeRaiz.remitente_id

      const { error } = await enviarMensaje({
        destinatario_id: destinatarioId,
        es_grupal: esMensajeGrupal,
        asunto: `Re: ${mensajeRaiz.asunto}`,
        cuerpo: respuesta.trim(),
        parent_id: mensajeRaiz.id,
      })
      if (error) throw new Error(error)
      toast.success('Respuesta enviada')
      setRespuesta('')
      onMensajeEnviado()
      // Recargar hilo para mostrar la nueva respuesta
      setCargado(false)
      await cargarHilo()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al enviar')
    } finally {
      setSending(false)
    }
  }

  // Determinar el destinatario para mostrar en el header
  const esMensajeGrupal = mensajeRaiz.es_grupal
  const esRemitente = mensajeRaiz.remitente_id === currentUserId
  const otroParticipante = esRemitente
    ? mensajeRaiz.destinatario?.full_name
    : mensajeRaiz.remitente?.full_name

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-xl bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">{mensajeRaiz.asunto}</p>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
              {esMensajeGrupal ? (
                <>
                  <Users className="h-3 w-3" />
                  Conversación grupal
                </>
              ) : (
                <>
                  <User className="h-3 w-3" />
                  Con {otroParticipante ?? 'Desconocido'}
                </>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors shrink-0"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Hilo de mensajes */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            mensajes.map((m, i) => (
              <BurbujaMensaje
                key={m.id}
                mensaje={m}
                currentUserId={currentUserId}
                esRaiz={i === 0}
              />
            ))
          )}
        </div>

        {/* Caja de respuesta */}
        <div className="shrink-0 border-t border-border p-4 space-y-3">
          <Separator className="opacity-0 h-0" />
          <Textarea
            placeholder="Escribí tu respuesta…"
            value={respuesta}
            onChange={(e) => setRespuesta(e.target.value)}
            rows={3}
            className="resize-none text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                handleResponder()
              }
            }}
          />
          <div className="flex justify-between items-center">
            <p className="text-[11px] text-muted-foreground">Ctrl+Enter para enviar</p>
            <Button
              id="responder-mensaje-btn"
              size="sm"
              onClick={handleResponder}
              disabled={sending || !respuesta.trim()}
            >
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
              ) : (
                <Send className="h-3.5 w-3.5 mr-2" />
              )}
              Responder
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
