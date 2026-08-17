'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { MessageSquare, Plus, Users, User, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils/cn'
import type { MensajeInterno } from '@/types/mensaje'
import { HiloModal } from './hilo-modal'
import { MensajeForm } from '@/components/notificaciones/mensaje-form'
import { usePermisos } from '@/contexts/permisos-context'
import { eliminarMensaje } from '@/app/(app)/mensajes/actions'
import { toast } from 'sonner'

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
  const { esMedico } = usePermisos()
  const searchParams = useSearchParams()
  const [threads, setThreads] = useState<MensajeInterno[]>(initialThreads)
  const [mostrarNuevo, setMostrarNuevo] = useState(false)
  const [confirmDeleteThreadId, setConfirmDeleteThreadId] = useState<string | null>(null)

  // Sincronizar el estado local cuando las props cambien (ej. al recibir un refresh del servidor)
  useEffect(() => {
    setThreads(initialThreads)
  }, [initialThreads])

  // ── Hilo abierto: la URL es la ÚNICA fuente de verdad ──────────────────────
  // Se DERIVA en cada render (ni `useState` ni `useEffect`). Antes vivía en un
  // inicializador perezoso de `useState`, que corre SOLO al montar: al clickear
  // un mensaje en la campanita se navegaba a `/mensajes?hilo=X` pero `Bandeja`
  // no se remontaba, así que el modal no abría hasta un F5. `useSearchParams()`
  // sí es reactivo a los cambios de URL sin remontaje.
  // Hidratación: la ruta es DINÁMICA (auth por cookies), así que el hook ya
  // tiene el param en el render del servidor y el primer render del cliente
  // coincide — no hay mismatch ni hace falta un <Suspense> alrededor.
  const hiloId = searchParams.get('hilo')
  // ⚠ Si el id no está entre los threads cargados, el modal simplemente no abre
  // (no rompe). `obtenerBandeja()` trae las 100 conversaciones más recientes:
  // un hilo más viejo que eso queda fuera. Ver la limitación en RESPUESTA.md.
  const hiloAbierto = hiloId ? threads.find((t) => t.id === hiloId) ?? null : null

  /**
   * Escribe el param `hilo` en la URL. Usa la History API nativa —que Next
   * integra con `useSearchParams`— en vez de `router.push/replace` para no
   * pagar un round-trip al servidor (y su latencia) cada vez que se abre o
   * cierra el modal: la bandeja ya está en pantalla y no hay nada que refetchear.
   */
  function sincronizarUrl(id: string | null, modo: 'push' | 'replace') {
    const params = new URLSearchParams(searchParams.toString())
    if (id) params.set('hilo', id)
    else params.delete('hilo')
    const qs = params.toString()
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    if (modo === 'push') window.history.pushState(null, '', url)
    else window.history.replaceState(null, '', url)
  }

  /**
   * ¿El HILO se muestra como no leído? Un hilo lo está si su raíz es no-leída
   * O si tiene respuestas no leídas.
   *
   * ⚠ El corte por autoría (`remitente_id === currentUserId`) sigue aplicando,
   * pero SOLO a la raíz — antes era un `return false` que cortaba la función
   * entera, y por eso un hilo que YO inicié quedaba "leído" para siempre aunque
   * el otro respondiera. Las respuestas se evalúan aparte: la señal
   * `tiene_respuestas_no_leidas` la calcula `obtenerBandeja()` excluyendo las
   * mías, así que ya viene con la autoría descontada.
   */
  function esNoLeido(m: MensajeInterno): boolean {
    const raizNoLeida =
      m.remitente_id !== currentUserId &&
      (m.es_grupal
        ? !(m.lecturas ?? []).some((l) => l.user_id === currentUserId)
        : !m.leido)

    return raizNoLeida || (m.tiene_respuestas_no_leidas ?? false)
  }

  function abrirHilo(m: MensajeInterno) {
    // Mismo mecanismo que el deep-link de la campanita: abrir = poner el hilo en
    // la URL. Así hay UN solo camino para abrir el modal, no dos. Con `push` (y
    // no `replace`) el botón "atrás" del navegador cierra el modal.
    sincronizarUrl(m.id, 'push')

    // Marcar como leído localmente de inmediato para que desaparezca el indicador
    // al hacer clic, sin esperar el round-trip del `revalidatePath` que dispara el
    // marcado real (`marcarMensajeLeido`, desde el modal).
    setThreads((prev) =>
      prev.map((t) => {
        if (t.id !== m.id) return t

        // La señal de respuestas se apaga SIEMPRE: al abrir, el modal marca como
        // leídas todas las no leídas del hilo (raíz y respuestas). Si ese marcado
        // fallara, el `revalidatePath` trae la señal en `true` de vuelta y el
        // indicador reaparece — el optimismo no puede mentir de forma permanente.
        const abierto: MensajeInterno = { ...t, tiene_respuestas_no_leidas: false }

        if (t.es_grupal) {
          const lecturas = t.lecturas ?? []
          if (lecturas.some((l) => l.user_id === currentUserId)) return abierto
          return {
            ...abierto,
            lecturas: [...lecturas, { user_id: currentUserId, leido_at: new Date().toISOString() }],
          }
        }
        return { ...abierto, leido: true }
      })
    )
  }

  function handleMensajeEnviado() {
    setMostrarNuevo(false)
  }

  function handleRespuestaEnviada() {
    // La revalidación de caché en el servidor de Next.js refresca las props automáticamente
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
              <div
                key={m.id}
                onClick={() => abrirHilo(m)}
                className={cn(
                  'w-full text-left rounded-xl border px-4 py-3.5 transition-all duration-150 cursor-pointer relative group',
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
                    {/* Línea 1: asunto + fecha + eliminar */}
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
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-muted-foreground">{fechaStr}</span>
                        {esMedico && (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation()
                              setConfirmDeleteThreadId(m.id)
                            }}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Eliminar conversación"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
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
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de confirmación para eliminar conversación */}
      {confirmDeleteThreadId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmDeleteThreadId(null)} />
          <div className="relative z-10 w-full max-w-sm bg-card border border-border rounded-xl p-6 shadow-xl space-y-4">
            <h3 className="font-semibold text-base text-foreground">¿Eliminar conversación?</h3>
            <p className="text-sm text-muted-foreground">
              Esta acción no se puede deshacer. Se eliminará la conversación completa y todas sus respuestas.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDeleteThreadId(null)}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  const id = confirmDeleteThreadId
                  setConfirmDeleteThreadId(null)
                  try {
                    const { error } = await eliminarMensaje(id)
                    if (error) throw new Error(error)
                    toast.success('Conversación eliminada')
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Error al eliminar')
                  }
                }}
              >
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de hilo. Cerrar = sacar el `hilo` de la URL, con `replace` para no
          dejar en el historial un estado de "modal cerrado" y para que el param
          viejo no quede pisando un clic posterior en OTRO mensaje. */}
      {hiloAbierto && (
        <HiloModal
          mensajeRaiz={hiloAbierto}
          currentUserId={currentUserId}
          onClose={() => sincronizarUrl(null, 'replace')}
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


