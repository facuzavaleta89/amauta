'use client'

import { useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { X, Users, User, Loader2, Send, Trash2, MessageSquareOff, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { MARCADO_SIN_FILAS, type MensajeInterno } from '@/types/mensaje'
import { obtenerHilo, eliminarMensaje } from '@/app/(app)/mensajes/actions'
import { enviarMensaje, marcarMensajeLeido } from '@/app/(app)/notificaciones/actions'
import { usePermisos } from '@/contexts/permisos-context'

/**
 * Fallo de APERTURA: el modal se abrió sin raíz (solo con el id) y la carga no dejó
 * NADA que mostrar. Solo entonces el modal se convierte en un cartel bloqueante; si
 * ya había contenido en pantalla, un fallo posterior sigue siendo un toast y la
 * conversación permanece visible.
 *
 * ⚠ `'no-disponible'` es DELIBERADAMENTE indistinguible: cubre por igual "no existe",
 * "se borró" y "no tenés permiso para verla". `obtenerHilo` ya responde lo mismo en
 * los tres casos (ver `NO_ENCONTRADO` en `mensajes/actions.ts`) justamente para que
 * nadie pueda deducir qué ids existen probándolos desde la URL; distinguirlos acá
 * tiraría abajo esa propiedad del lado del cliente.
 *
 * `'red'` sí se distingue, y no filtra nada: no depende del id pedido sino de que la
 * llamada ni siquiera llegó a responder. Es el único de los dos que se puede reintentar.
 */
type FalloApertura = 'no-disponible' | 'red'

const TEXTO_FALLO: Record<FalloApertura, { titulo: string; detalle: string }> = {
  'no-disponible': {
    titulo: 'Conversación no disponible',
    // ⚠ UN texto para los TRES casos, sin mentir en ninguno: "puede que ya no exista"
    // cubre el borrado y el id inexistente, "no esté disponible para tu cuenta" cubre
    // la falta de permiso y el hilo de otro consultorio.
    detalle:
      'No pudimos abrir esta conversación. Puede que ya no exista o que no esté disponible para tu cuenta.',
  },
  red: {
    titulo: 'No se pudo cargar la conversación',
    detalle: 'Hubo un problema de conexión. Revisá tu conexión e intentá de nuevo.',
  },
}

interface Props {
  /**
   * Id del hilo a abrir. Es lo ÚNICO imprescindible: el modal resuelve el resto por
   * su cuenta llamando a `obtenerHilo`, que además normaliza el id de una respuesta
   * a su raíz.
   *
   * ⚠ Viene del `?hilo=` de la URL, o sea que puede ser CUALQUIER cosa: no se valida
   * acá. La validación de formato y de acceso vive en la action, en un solo lugar, y
   * un id mal formado devuelve exactamente lo mismo que uno ajeno.
   */
  hiloId: string
  /**
   * Mensaje raíz, si la bandeja YA lo tiene en su lista. Es un ATAJO de pintado, no
   * una dependencia: siembra la primera burbuja y el encabezado para que el caso
   * común —clic en un hilo de la lista— no pierda el contenido inmediato que tenía.
   *
   * ⚠ Ausente (o `null`) es el caso del deep-link a un hilo VIEJO, fuera de las
   * páginas cargadas de la bandeja: antes el modal directamente no se renderizaba y
   * el clic en la notificación no producía nada.
   */
  mensajeRaiz?: MensajeInterno | null
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
  puedeEliminar = false,
  onDelete,
}: {
  mensaje: MensajeInterno
  currentUserId: string
  esRaiz?: boolean
  puedeEliminar?: boolean
  onDelete?: () => void
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
        <div className="relative group max-w-full">
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
          {puedeEliminar && onDelete && (
            <button
              onClick={onDelete}
              className={`absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-destructive ${
                esMio ? '-left-10' : '-right-10'
              }`}
              title="Eliminar mensaje"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function HiloModal({ hiloId, mensajeRaiz = null, currentUserId, onClose, onMensajeEnviado }: Props) {
  // Si la bandeja trajo la raíz, se siembra y el hilo se pinta al instante; si no, el
  // modal arranca vacío y lo llena su propio fetch.
  const [mensajes, setMensajes] = useState<MensajeInterno[]>(mensajeRaiz ? [mensajeRaiz] : [])
  const [loading, setLoading] = useState(false)
  const [cargado, setCargado] = useState(false)
  const [fallo, setFallo] = useState<FalloApertura | null>(null)
  const [respuesta, setRespuesta] = useState('')
  const [sending, setSending] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const { esMedico } = usePermisos()

  // ⚠ Cerrojo SÍNCRONO contra la carga duplicada. `cargado` es estado: no está en `true`
  // hasta que la primera carga TERMINA, así que no sirve para frenar una segunda llamada
  // hecha mientras la primera está en vuelo (el doble montaje de StrictMode en dev, o un
  // "Reintentar" impaciente). Mismo patrón que `cargandoRef` en `bandeja.tsx`.
  const enVueloRef = useRef(false)

  /**
   * Raíz EFECTIVA del hilo: la primera del array, que es la que arma `obtenerHilo`
   * (`[raiz, ...respuestas]`).
   *
   * ⚠ Se deriva de `mensajes` y NO se lee más la prop, para que exista un solo lugar
   * del que salen asunto, participantes y `parent_id` de las respuestas. Encima es más
   * fiel: si el id de la URL era el de una RESPUESTA, la action lo normaliza a su raíz
   * y la prop (cuando existe) quedaría describiendo otro mensaje.
   */
  const raiz = mensajes[0] ?? null

  // Cargar el hilo completo al abrir el modal
  async function cargarHilo(force = false) {
    if (enVueloRef.current) return
    if (cargado && !force) return
    enVueloRef.current = true
    setLoading(true)
    setFallo(null)

    // ¿Hay algo pintado en este momento? Es lo que decide si un fallo es BLOQUEANTE
    // (el modal se abrió solo con el id y no hay nada que mostrar) o apenas un aviso
    // (ya se está viendo la conversación y lo que falló fue traer las respuestas).
    const tieneContenido = mensajes.length > 0

    try {
      const { mensajes: hilo, error } = await obtenerHilo(hiloId)
      if (error || hilo.length === 0) {
        if (tieneContenido) toast.error('Error al cargar el hilo')
        else setFallo('no-disponible')
        return
      }
      setMensajes(hilo)
      setCargado(true)

      // Marcar automáticamente como leídos los mensajes que no sean míos y no estén leídos
      const noLeidos = hilo.filter((m) => {
        if (m.remitente_id === currentUserId) return false
        if (m.es_grupal) {
          return !(m.lecturas ?? []).some((l) => l.user_id === currentUserId)
        }
        return !m.leido
      })

      if (noLeidos.length > 0) {
        // El resultado del marcado ya no se descarta: hasta acá, ni un fallo de RLS
        // ni un 'Mensaje no encontrado' dejaban rastro en ningún lado.
        const resultados = await Promise.all(noLeidos.map((m) => marcarMensajeLeido(m.id)))

        // UN solo aviso agregado, nunca uno por mensaje: el hilo puede tener N no
        // leídos y un fallo sistemático (RLS caída) apilaría N toasts idénticos.
        const errores = resultados
          .map((r) => r.error)
          .filter((e): e is string => e !== null)
        const sinFilas = errores.filter((e) => e === MARCADO_SIN_FILAS)
        const erroresReales = errores.filter((e) => e !== MARCADO_SIN_FILAS)

        // Anomalía de datos/RLS: el usuario no puede hacer nada con esto, va solo a
        // consola. Sin cuerpo ni asunto — el log no lleva datos personales.
        if (sinFilas.length > 0) {
          console.error(
            `[marcarMensajeLeido] ${sinFilas.length} mensaje(s) del hilo ${hiloId} no afectaron ninguna fila`
          )
        }

        // Error real: lo accionable. `warning` y no `error` porque el acto principal
        // —abrir y mostrar el hilo— salió bien y lo que falló es secundario; mismo
        // criterio que el turno que no se agenda al finalizar una consulta.
        if (erroresReales.length > 0) {
          console.error('[marcarMensajeLeido]', erroresReales)
          toast.warning('No se pudieron marcar algunos mensajes como leídos.')
        }

        onMensajeEnviado() // Notificar al padre para actualizar contadores/bandeja
      }
    } catch (error) {
      // La action ni siquiera respondió (red caída, deploy en curso). Es el único
      // fallo REINTENTABLE, y no dice nada sobre el hilo pedido.
      console.error('[obtenerHilo]', error)
      if (tieneContenido) toast.error('Error al cargar el hilo')
      else setFallo('red')
    } finally {
      enVueloRef.current = false
      setLoading(false)
    }
  }

  // Carga al montar. `bandeja.tsx` monta el modal con `key={hiloId}`, así que abrir OTRO
  // hilo lo remonta y esta carga vuelve a correr con el id nuevo — no hace falta que el
  // efecto observe `hiloId`, y el estado (respuesta a medio escribir, hilo anterior) se
  // resetea solo en vez de arrastrarse entre conversaciones.
  useEffect(() => {
    cargarHilo()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleResponder() {
    // Sin raíz no hay a qué responder; la caja de respuesta ni se renderiza en ese caso.
    if (!raiz) return
    if (!respuesta.trim()) {
      toast.error('Escribí tu respuesta antes de enviar')
      return
    }
    setSending(true)
    try {
      const esMensajeGrupal = raiz.es_grupal
      const destinatarioId = esMensajeGrupal
        ? null
        : raiz.remitente_id === currentUserId
          ? raiz.destinatario_id
          : raiz.remitente_id

      const { error } = await enviarMensaje({
        destinatario_id: destinatarioId,
        es_grupal: esMensajeGrupal,
        asunto: `Re: ${raiz.asunto}`,
        cuerpo: respuesta.trim(),
        parent_id: raiz.id,
      })
      if (error) throw new Error(error)
      toast.success('Respuesta enviada')
      setRespuesta('')
      onMensajeEnviado()
      // Recargar hilo para mostrar la nueva respuesta
      setCargado(false)
      await cargarHilo(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al enviar')
    } finally {
      setSending(false)
    }
  }

  async function handleEliminar(id: string) {
    try {
      const { error } = await eliminarMensaje(id)
      if (error) throw new Error(error)
      toast.success('Mensaje eliminado')

      if (id === raiz?.id) {
        // Si borramos la raíz, cerramos el hilo completo primero y revalidamos después
        onClose()
        onMensajeEnviado()
      } else {
        // Si no, recargamos el hilo primero y revalidamos después
        await cargarHilo(true)
        onMensajeEnviado()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  // Determinar el destinatario para mostrar en el header
  const esMensajeGrupal = raiz?.es_grupal ?? false
  const esRemitente = raiz?.remitente_id === currentUserId
  const otroParticipante = esRemitente
    ? raiz?.destinatario?.full_name
    : raiz?.remitente?.full_name

  // Encabezado: con raíz manda el asunto; sin ella, el estado en el que está el modal.
  const tituloHeader = raiz
    ? raiz.asunto
    : fallo
      ? TEXTO_FALLO[fallo].titulo
      : 'Cargando conversación…'

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
            <p className="font-semibold text-sm text-foreground truncate">{tituloHeader}</p>
            {raiz && (
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
            )}
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
          {fallo ? (
            /* Cartel BLOQUEANTE, no un toast que se desvanece: el usuario llegó acá por
               un clic deliberado en una notificación y merece una respuesta explícita
               que tenga que cerrar él. */
            <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                {fallo === 'red' ? (
                  <WifiOff className="h-6 w-6 text-muted-foreground" />
                ) : (
                  <MessageSquareOff className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">{TEXTO_FALLO[fallo].titulo}</h3>
                <p className="text-xs text-muted-foreground max-w-xs">{TEXTO_FALLO[fallo].detalle}</p>
              </div>
              <div className="flex items-center gap-2 pt-1">
                {/* Reintentar SOLO en el fallo de red: en 'no-disponible' la respuesta
                    no va a cambiar por insistir. */}
                {fallo === 'red' && (
                  <Button variant="outline" size="sm" onClick={() => cargarHilo(true)}>
                    Reintentar
                  </Button>
                )}
                <Button size="sm" onClick={onClose}>Cerrar</Button>
              </div>
            </div>
          ) : mensajes.length === 0 || (loading && mensajes.length === 1) ? (
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
                puedeEliminar={m.remitente_id === currentUserId || esMedico}
                onDelete={() => setConfirmDeleteId(m.id)}
              />
            ))
          )}
        </div>

        {/* Caja de respuesta. Sin raíz no hay hilo al que responder (ni asunto para el
            "Re:"), así que no se muestra mientras carga ni cuando el hilo no se pudo abrir. */}
        {raiz && (
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
        )}
      </div>

      {/* Modal de confirmación para eliminar un mensaje en el hilo */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmDeleteId(null)} />
          <div className="relative z-10 w-full max-w-sm bg-card border border-border rounded-xl p-6 shadow-xl space-y-4">
            <h3 className="font-semibold text-base text-foreground">
              {confirmDeleteId === raiz?.id ? '¿Eliminar conversación?' : '¿Eliminar mensaje?'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {confirmDeleteId === raiz?.id
                ? 'Esta acción no se puede deshacer. Se eliminará la conversación completa y todas sus respuestas.'
                : 'Esta acción no se puede deshacer y el mensaje se borrará permanentemente.'}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDeleteId(null)}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  const id = confirmDeleteId
                  setConfirmDeleteId(null)
                  await handleEliminar(id)
                }}
              >
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
