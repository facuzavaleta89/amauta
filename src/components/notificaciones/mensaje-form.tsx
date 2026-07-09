'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, X, Users, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { enviarMensaje } from '@/app/(app)/notificaciones/actions'

interface Usuario {
  id: string
  full_name: string
  role: string
  acceso_mensajeria?: boolean
}

interface Props {
  usuarios: Usuario[]
  /** Si se pasa, es un reply — destinatario fijo, asunto pre-completado */
  replyTo?: {
    parentId: string
    destinatarioId: string
    asuntoOriginal: string
  }
  onSent: () => void
  onClose: () => void
}

export function MensajeForm({ usuarios, replyTo, onSent, onClose }: Props) {
  const isReply = !!replyTo
  const [destinatario, setDestinatario] = useState<string>(replyTo?.destinatarioId ?? '')
  const [asunto, setAsunto] = useState<string>(
    replyTo ? `Re: ${replyTo.asuntoOriginal}` : ''
  )
  const [cuerpo, setCuerpo] = useState('')
  const [sending, setSending] = useState(false)

  const esGrupal = destinatario === 'todos'

  async function handleSend() {
    if (!destinatario) {
      toast.error('Seleccioná un destinatario')
      return
    }

    // Validar en el cliente que el destinatario tenga permisos de mensajería si es asistente
    if (!esGrupal) {
      const selectedUser = usuarios.find((u) => u.id === destinatario)
      if (selectedUser && selectedUser.role === 'asistente' && !selectedUser.acceso_mensajeria) {
        toast.error('El asistente seleccionado no tiene permisos de mensajería')
        return
      }
    }

    if (!asunto.trim()) {
      toast.error('El asunto es requerido')
      return
    }
    if (!cuerpo.trim()) {
      toast.error('El mensaje no puede estar vacío')
      return
    }

    setSending(true)
    try {
      const { error } = await enviarMensaje({
        destinatario_id: esGrupal ? null : destinatario,
        es_grupal: esGrupal,
        asunto: asunto.trim(),
        cuerpo: cuerpo.trim(),
        parent_id: replyTo?.parentId ?? null,
      })
      if (error) throw new Error(error)
      toast.success('Mensaje enviado')
      onSent()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al enviar')
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="font-semibold text-base">
            {isReply ? 'Responder mensaje' : 'Nuevo mensaje'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Destinatario */}
          <div className="space-y-2">
            <Label htmlFor="msg-destinatario">Para</Label>
            {isReply ? (
              <Input
                id="msg-destinatario"
                value={usuarios.find((u) => u.id === replyTo?.destinatarioId)?.full_name ?? 'Desconocido'}
                disabled
              />
            ) : (
              <Select value={destinatario} onValueChange={setDestinatario}>
                <SelectTrigger id="msg-destinatario">
                  <SelectValue placeholder="Seleccionar destinatario…" />
                </SelectTrigger>
                <SelectContent>
                  {/* Opción grupal */}
                  <SelectItem value="todos">
                    <span className="flex items-center gap-2">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      Todos (mensaje grupal)
                    </span>
                  </SelectItem>
                  <div className="my-1 h-px bg-border" role="separator" />
                  {usuarios.map((u) => {
                    const sinAcceso = u.role === 'asistente' && !u.acceso_mensajeria
                    return (
                      <SelectItem key={u.id} value={u.id} disabled={sinAcceso}>
                        <span className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className={sinAcceso ? 'text-muted-foreground line-through opacity-50' : ''}>
                            {u.full_name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            ({u.role === 'medico' ? 'Médico' : 'Asistente'})
                          </span>
                          {sinAcceso && (
                            <span className="text-[10px] text-destructive bg-destructive/10 px-1.5 py-0.5 rounded font-normal normal-case ml-auto shrink-0">
                              Sin acceso a mensajería
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            )}
            {esGrupal && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3" />
                Este mensaje será visible para todo el consultorio
              </p>
            )}
          </div>

          {/* Asunto */}
          <div className="space-y-2">
            <Label htmlFor="msg-asunto">Asunto</Label>
            <Input
              id="msg-asunto"
              value={asunto}
              onChange={(e) => setAsunto(e.target.value)}
              placeholder="Asunto del mensaje…"
              maxLength={200}
            />
          </div>

          {/* Cuerpo */}
          <div className="space-y-2">
            <Label htmlFor="msg-cuerpo">Mensaje</Label>
            <Textarea
              id="msg-cuerpo"
              value={cuerpo}
              onChange={(e) => setCuerpo(e.target.value)}
              placeholder="Escribí tu mensaje acá…"
              rows={7}
              className="resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border bg-muted/30 shrink-0">
          <Button variant="outline" size="sm" onClick={onClose} disabled={sending}>
            Cancelar
          </Button>
          <Button
            id="enviar-mensaje-btn"
            size="sm"
            onClick={handleSend}
            disabled={sending}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {isReply ? 'Responder' : 'Enviar mensaje'}
          </Button>
        </div>
      </div>
    </div>
  )
}

