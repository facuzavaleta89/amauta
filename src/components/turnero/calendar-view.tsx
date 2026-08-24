'use client'

import React, { useState, useCallback, useRef, useEffect, useSyncExternalStore } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import dayGridPlugin from '@fullcalendar/daygrid'
import esLocale from '@fullcalendar/core/locales/es'
import type {
  EventApi,
  EventSourceFuncArg,
  EventInput,
  DateSelectArg,
  EventClickArg,
  EventDropArg,
} from '@fullcalendar/core'
import type { EventResizeDoneArg } from '@fullcalendar/interaction'
import { toast } from 'sonner'
import { Loader2, CalendarPlus, Ban, RefreshCw, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { BloqueoAgenda, TurnoConPaciente } from '@/types'

import { TurnoFormModal } from './turno-form'
import { BlockSlotModal } from './block-slot-modal'

// ── Categorías: etiqueta, ícono y clase de color, de la fuente compartida
// (`constants/turno-categorias.ts`). El formulario de turnos consume la MISMA.
import { CATEGORIA_STYLES, CATEGORIAS, categoriaStyle } from '@/constants/turno-categorias'

const ALL_CATEGORIES: string[] = CATEGORIAS
const LS_FILTER_KEY = 'turnero_categoria_filter'

// ── Hook: detecta si es móvil ────────────────────────────────
// Usa useSyncExternalStore (React 19) en vez de useState + useEffect: es el patrón
// canónico para suscribirse a un store externo del navegador (aquí, un MediaQueryList).
// getServerSnapshot devuelve false y React lo usa TANTO en SSR COMO en el primer render
// de hidratación del cliente, así que no hay mismatch: la secuencia de valores es la
// misma que tenía el useState+useEffect (false → false → valor real tras montar).
function useIsMobile(breakpoint = 768) {
  const query = `(max-width: ${breakpoint - 1}px)`

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', onStoreChange)
      return () => mq.removeEventListener('change', onStoreChange)
    },
    [query]
  )

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])
  const getServerSnapshot = () => false

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

// ── Renderizado custom — vista semana/día ────────────────────
function TurnoEventContent({ event, creationMode }: { event: EventApi; creationMode: 'turno' | 'bloqueo' }) {
  const { type, raw } = event.extendedProps
  const isBloqueo = type === 'bloqueo' || (!type && creationMode === 'bloqueo')

  const fmt = (d: Date | null) =>
    d
      ? d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
      : ''

  const startTime = fmt(event.start)
  const endTime   = fmt(event.end)

  if (isBloqueo) {
    return (
      <div className="fc-event-custom fc-event-bloqueo">
        <div className="fc-event-accent" />
        <div className="fc-event-body">
          <span className="fc-event-time-label">{startTime} – {endTime}</span>
          <span className="fc-event-title-label">{event.title}</span>
        </div>
      </div>
    )
  }

  const categoria = raw?.categoria || 'turno_medico'
  const catStyle = categoriaStyle(categoria)
  const CatIcon = catStyle.icon

  return (
    <div className={cn('fc-event-custom fc-event-turno', catStyle.claseCalendario)}>
      <div className="fc-event-accent" />
      <div className="fc-event-body">
        <span className="fc-event-time-label">{startTime} – {endTime}</span>
        <span className="fc-event-title-label">
          {categoria !== 'turno_medico' && <CatIcon className="fc-event-cat-icon" />}
          {event.title}
        </span>
      </div>
    </div>
  )
}

// ── Renderizado custom — vista mes ───────────────────────────
function DayGridEventContent({ event, creationMode }: { event: EventApi; creationMode: 'turno' | 'bloqueo' }) {
  const { type, raw } = event.extendedProps
  const isBloqueo = type === 'bloqueo' || (!type && creationMode === 'bloqueo')
  const startTime = event.start
    ? event.start.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
    : ''

  const categoria = raw?.categoria || 'turno_medico'
  const catStyle = categoriaStyle(categoria)
  const CatIcon = catStyle.icon

  return (
    <div className={cn(
      `fc-daygrid-event-custom`,
      isBloqueo ? 'fc-daygrid-bloqueo' : `fc-daygrid-turno ${catStyle.claseCalendario}`
    )}>
      <span className="fc-daygrid-dot-custom" />
      <span className="fc-daygrid-time-custom">{startTime}</span>
      <span className="fc-daygrid-title-custom">
        {!isBloqueo && categoria !== 'turno_medico' && <CatIcon className="inline-block w-3 h-3 mr-0.5 opacity-70" />}
        {event.title}
      </span>
    </div>
  )
}

/**
 * Evento seleccionado en el calendario. Espeja exactamente lo que `fetchEvents` siembra en
 * `extendedProps` (`{ type, raw }`), porque un MISMO estado alimenta los dos modales y cada
 * uno lee campos disjuntos: la discriminante `type` es lo que permite entregarle a cada modal
 * solo su variante, en vez de pasarles el mismo `any` a los dos.
 */
type SelectedEvent =
  | { type: 'turno'; raw: TurnoConPaciente }
  | { type: 'bloqueo'; raw: BloqueoAgenda }

export function CalendarView() {
  const calendarRef = useRef<FullCalendar>(null)
  const isMobile = useIsMobile()

  const [loading, setLoading] = useState(false)
  const [turnoModalOpen, setTurnoModalOpen] = useState(false)
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string } | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<SelectedEvent | null>(null)
  const [creationMode, setCreationMode] = useState<'turno' | 'bloqueo'>('turno')
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const filterPanelRef = useRef<HTMLDivElement>(null)

  // ── Filtros de categoría (persistidos en localStorage) ──
  const [activeCategories, setActiveCategories] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set(ALL_CATEGORIES)
    try {
      const saved = localStorage.getItem(LS_FILTER_KEY)
      if (saved) return new Set(JSON.parse(saved))
    } catch {}
    return new Set(ALL_CATEGORIES)
  })

  const toggleCategory = (cat: string) => {
    setActiveCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) {
        if (next.size === 1) return prev // siempre al menos una activa
        next.delete(cat)
      } else {
        next.add(cat)
      }
      try { localStorage.setItem(LS_FILTER_KEY, JSON.stringify([...next])) } catch {}
      return next
    })
  }

  // Cerrar panel al hacer click fuera
  useEffect(() => {
    if (!showFilterPanel) return
    const handler = (e: MouseEvent) => {
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) {
        setShowFilterPanel(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showFilterPanel])

  // Cambiar vista al detectar cambio de tamaño
  useEffect(() => {
    const targetView = isMobile ? 'timeGridDay' : 'timeGridWeek'

    // Diferimos changeView a un microtask: FullCalendar usa flushSync internamente, y
    // llamarlo síncronamente desde el efecto puede caer mientras React todavía renderiza
    // (React avisa con "flushSync was called from inside a lifecycle method"). El microtask
    // garantiza que corra después del render en curso. El flag `cancelled` evita actuar
    // sobre un calendario ya desmontado.
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      const api = calendarRef.current?.getApi()
      if (!api) return
      if (api.view.type !== targetView) {
        api.changeView(targetView)
      }
    })

    return () => { cancelled = true }
  }, [isMobile])

  const fetchEvents = useCallback(
    async (
      info: EventSourceFuncArg,
      successCallback: (events: EventInput[]) => void,
      failureCallback: (error: Error) => void
    ) => {
      setLoading(true)
      try {
        const res = await fetch(`/api/turnero?start=${info.startStr}&end=${info.endStr}`)
        const data = await res.json()

        if (!res.ok) throw new Error(data.error)

        const savedCategories = activeCategories

        const turnosMap = data.turnos
          .filter((t: TurnoConPaciente) => {
            const cat = t.categoria || 'turno_medico'
            return savedCategories.has(cat)
          })
          .map((t: TurnoConPaciente) => ({
            id: t.id,
            title: t.paciente
              ? t.paciente.nombre_completo
              : t.motivo || t.paciente_nombre_libre || 'Turno Libre',
            start: t.fecha_inicio,
            end: t.fecha_fin,
            allDay: false,
            extendedProps: { type: 'turno', raw: t },
          }))

        const bloqueosMap = data.bloqueos.map((b: BloqueoAgenda) => ({
          id: `block-${b.id}`,
          title: b.motivo || 'Bloqueado',
          start: b.fecha_inicio,
          end: b.fecha_fin,
          extendedProps: { type: 'bloqueo', raw: b },
        }))

        successCallback([...turnosMap, ...bloqueosMap])
      } catch (error) {
        // Un solo Error para las dos salidas: el toast y el failureCallback de
        // FullCalendar, cuya firma exige Error (no unknown).
        const err = error instanceof Error ? error : new Error('Error inesperado')
        toast.error('Error al cargar agenda', { description: err.message })
        failureCallback(err)
      } finally {
        setLoading(false)
      }
    },
    [activeCategories],
  )

  // Refetch cuando cambian los filtros
  useEffect(() => {
    calendarRef.current?.getApi().refetchEvents()
  }, [activeCategories])

  const handleDateSelect = (selectInfo: DateSelectArg) => {
    setSelectedEvent(null)
    if (selectInfo.allDay) {
      // Vista mes: la selección es de día completo (sin hora). Proponemos el día
      // clickeado a las 09:00–09:30, editable (09:00 igual que la HC).
      const dia = selectInfo.startStr.slice(0, 10) // "YYYY-MM-DD"
      setSelectedSlot({ start: `${dia}T09:00`, end: `${dia}T09:30` })
    } else {
      // Vistas semana/día: respetar exactamente la franja marcada.
      setSelectedSlot({ start: selectInfo.startStr, end: selectInfo.endStr })
    }
    if (creationMode === 'bloqueo') {
      setBlockModalOpen(true)
    } else {
      setTurnoModalOpen(true)
    }
    selectInfo.view.calendar.unselect()
  }

  const handleEventClick = (clickInfo: EventClickArg) => {
    // Único punto donde el dato vuelve a entrar sin tipo: `extendedProps` es
    // `Record<string, any>` por diseño de FullCalendar. La aserción no inventa nada —
    // describe el objeto que nosotros mismos sembramos en `fetchEvents` (`{ type, raw }`).
    // La aserción va sobre el objeto ENTERO y no sobre `type`/`raw` por separado:
    // destructurar primero rompe la correlación entre la discriminante y el payload.
    const evento = clickInfo.event.extendedProps as SelectedEvent
    setSelectedEvent(evento)
    setSelectedSlot(null)
    if (evento.type === 'turno') setTurnoModalOpen(true)
    else if (evento.type === 'bloqueo') setBlockModalOpen(true)
  }

  // Extrae el UUID real del ID de un bloqueo (que tiene el prefijo "block-")
  const bloqueoId = (fcId: string) => fcId.replace(/^block-/, '')

  const handleEventDrop = async (dropInfo: EventDropArg) => {
    const event = dropInfo.event
    const isBloqueo = event.extendedProps.type === 'bloqueo'

    try {
      if (isBloqueo) {
        // Mover bloqueo → PATCH /api/turnero/bloqueos/{id}
        const res = await fetch(`/api/turnero/bloqueos/${bloqueoId(event.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fecha_inicio: event.startStr,
            fecha_fin: event.endStr,
          }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error)
        }
        toast.success('Bloqueo reprogramado')
        calendarRef.current?.getApi().refetchEvents()
      } else {
        // Mover turno (cualquier categoría) → PATCH /api/turnero/{id}
        const wasAllDay = dropInfo.oldEvent.allDay
        const isNowTimed = !event.allDay
        const newEstado = (wasAllDay && isNowTimed) ? 'confirmado' : undefined

        const res = await fetch(`/api/turnero/${event.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fecha_inicio: event.startStr,
            fecha_fin: event.endStr,
            ...(newEstado ? { estado: newEstado } : {}),
          }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error)
        }
        toast.success(newEstado ? 'Turno confirmado y reprogramado' : 'Turno reprogramado')
        calendarRef.current?.getApi().refetchEvents()
      }
    } catch (error) {
      const description = error instanceof Error ? error.message : 'Error inesperado'
      toast.error('Error al reprogramar', { description })
      dropInfo.revert()
    }
  }

  const handleEventResize = async (resizeInfo: EventResizeDoneArg) => {
    const event = resizeInfo.event
    const isBloqueo = event.extendedProps.type === 'bloqueo'

    try {
      if (isBloqueo) {
        // Redimensionar bloqueo → PATCH /api/turnero/bloqueos/{id}
        const res = await fetch(`/api/turnero/bloqueos/${bloqueoId(event.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fecha_inicio: event.startStr,
            fecha_fin: event.endStr,
          }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error)
        }
        toast.success('Duración del bloqueo actualizada')
      } else {
        // Redimensionar turno (cualquier categoría) → PATCH /api/turnero/{id}
        const res = await fetch(`/api/turnero/${event.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fecha_inicio: event.startStr, fecha_fin: event.endStr }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error)
        }
        toast.success('Duración actualizada')
      }
    } catch (error) {
      const description = error instanceof Error ? error.message : 'Error inesperado'
      toast.error('Error al actualizar duración', { description })
      resizeInfo.revert()
    }
  }

  const refreshAction = () => {
    calendarRef.current?.getApi().refetchEvents()
  }

  // ── Toolbar adaptiva ─────────────────────────────────────────
  const headerToolbar = isMobile
    ? {
        left: 'prev,next',
        center: 'title',
        right: 'today',
      }
    : {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay',
      }

  const allCatsActive = ALL_CATEGORIES.every(c => activeCategories.has(c))

  return (
    <>
      {/* ── Toolbar de acciones ───────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between mb-3 gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={creationMode === 'turno' ? 'default' : 'outline'}
            onClick={() => {
              setCreationMode('turno')
              toast.info('Modo Turno activo. Hacé clic o arrastrá en la agenda para agendar un turno.')
            }}
            className={cn(
              "gap-1.5 h-8 text-xs font-semibold transition-all",
              creationMode === 'turno' && "bg-success text-success-foreground hover:bg-success/90 border-transparent"
            )}
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            Turno
          </Button>
          <Button
            size="sm"
            variant={creationMode === 'bloqueo' ? 'default' : 'outline'}
            onClick={() => {
              setCreationMode('bloqueo')
              toast.info('Modo Bloquear horario activo. Hacé clic o arrastrá en la agenda para bloquear.')
            }}
            className={cn(
              "gap-1.5 h-8 text-xs font-semibold transition-all",
              creationMode === 'bloqueo'
                ? "bg-destructive text-white hover:bg-destructive/90 border-transparent hover:text-white"
                : "text-destructive-strong border-destructive/30 hover:bg-destructive/5 hover:text-destructive-strong"
            )}
          >
            <Ban className="w-3.5 h-3.5" />
            Bloquear horario
          </Button>

          {/* ── Filtro de categorías ──────────────────── */}
          <div className="relative" ref={filterPanelRef}>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowFilterPanel(p => !p)}
              className={cn(
                "gap-1.5 h-8 text-xs font-semibold transition-all",
                !allCatsActive && "border-primary text-primary"
              )}
            >
              <Tag className="w-3.5 h-3.5" />
              Categorías
              {!allCatsActive && (
                <span className="ml-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold w-4 h-4 flex items-center justify-center">
                  {activeCategories.size}
                </span>
              )}
            </Button>
            {showFilterPanel && (
              <div className="absolute top-10 left-0 z-50 bg-popover border rounded-lg shadow-lg p-3 min-w-[200px]">
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Filtrar por tipo</p>
                <div className="space-y-1">
                  {Object.entries(CATEGORIA_STYLES).map(([cat, style]) => {
                    const Icon = style.icon
                    const isActive = activeCategories.has(cat)
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => toggleCategory(cat)}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors",
                          isActive
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-muted-foreground hover:bg-muted"
                        )}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span>{style.label}</span>
                        {isActive && (
                          <span className="ml-auto text-primary text-xs">✓</span>
                        )}
                      </button>
                    )
                  })}
                </div>
                {!allCatsActive && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveCategories(new Set(ALL_CATEGORIES))
                      try { localStorage.setItem(LS_FILTER_KEY, JSON.stringify(ALL_CATEGORIES)) } catch {}
                    }}
                    className="mt-2 w-full text-xs text-center text-primary hover:underline"
                  >
                    Ver todas
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={refreshAction}
          disabled={loading}
          className="gap-1.5 h-8 text-xs text-muted-foreground"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          <span className="hidden sm:inline">{loading ? 'Cargando...' : 'Actualizar'}</span>
        </Button>
      </div>

      <div className={cn("calendar-container h-[calc(100%-3rem)] w-full", creationMode === 'bloqueo' ? 'mode-bloqueo' : 'mode-turno')}>
        <FullCalendar
          ref={calendarRef}
          plugins={[timeGridPlugin, interactionPlugin, dayGridPlugin]}
          initialView={isMobile ? 'timeGridDay' : 'timeGridWeek'}
          headerToolbar={headerToolbar}
          locales={[esLocale]}
          locale="es"
          buttonText={{
            today: 'Hoy',
            month: 'Mes',
            week: 'Semana',
            day: 'Día',
            prev: '‹',
            next: '›',
          }}
          // ── Grupo A: Vista 24h, 7 días, slots de 10 min ──
          slotMinTime="00:00:00"
          slotMaxTime="24:00:00"
          scrollTime="07:00:00"
          scrollTimeReset={false}
          slotDuration="00:10:00"
          slotLabelInterval="01:00:00"
          slotLabelContent={(arg) => {
            const h = arg.date.getHours()
            return `${String(h).padStart(2, '0')}:00 hs`
          }}
          allDaySlot={false}
          // Dos eventos que se pisan se reparten el ancho en columnas limpias, cada
          // uno completo. Con el default (`true`) FullCalendar le DUPLICA el ancho a
          // cada columna, así que el segundo evento arranca a mitad de franja y queda
          // encimado sobre el primero: es el "bloqueo dibujado a media franja".
          // ⚠ El solapamiento es un estado LEGÍTIMO —el servidor lo permite cuando el
          // turno de abajo está en un estado que libera la franja— así que hay que
          // dibujarlo bien, no impedirlo. NO confundir con `eventOverlap`, que es de
          // interacción (limita el arrastre) y no de dibujo.
          slotEventOverlap={false}
          selectable={true}
          editable={!isMobile}
          selectMirror={true}
          events={fetchEvents}
          select={handleDateSelect}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          eventDisplay="block"
          displayEventEnd={true}
          eventTimeFormat={{
            hour: 'numeric',
            minute: '2-digit',
            meridiem: false,
            hour12: false,
          }}
          height="100%"
          eventContent={(arg) => {
            if (arg.view.type === 'dayGridMonth') {
              return <DayGridEventContent event={arg.event} creationMode={creationMode} />
            }
            return <TurnoEventContent event={arg.event} creationMode={creationMode} />
          }}
        />
      </div>

      <TurnoFormModal
        open={turnoModalOpen}
        onOpenChange={setTurnoModalOpen}
        initialDates={selectedSlot}
        initialData={selectedEvent?.type === 'turno' ? selectedEvent.raw : undefined}
        onSaved={refreshAction}
        onSwitchToBlock={() => {
          setTurnoModalOpen(false)
          setBlockModalOpen(true)
        }}
      />

      <BlockSlotModal
        open={blockModalOpen}
        onOpenChange={setBlockModalOpen}
        initialDates={selectedSlot}
        initialData={selectedEvent?.type === 'bloqueo' ? selectedEvent.raw : undefined}
        onSaved={refreshAction}
      />
    </>
  )
}
