'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import dayGridPlugin from '@fullcalendar/daygrid'
import esLocale from '@fullcalendar/core/locales/es'
import { toast } from 'sonner'
import { Loader2, CalendarPlus, Ban, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { TurnoFormModal } from './turno-form'
import { BlockSlotModal } from './block-slot-modal'

// ── Hook: detecta si es móvil ────────────────────────────────
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [breakpoint])

  return isMobile
}

// ── Renderizado custom — vista semana/día ────────────────────
function TurnoEventContent({ event, creationMode }: { event: any; creationMode: 'turno' | 'bloqueo' }) {
  const { type } = event.extendedProps
  // Si no tiene type, es un mirror de selección. Usamos el creationMode activo.
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

  return (
    <div className="fc-event-custom fc-event-turno">
      <div className="fc-event-accent" />
      <div className="fc-event-body">
        <span className="fc-event-time-label">{startTime} – {endTime}</span>
        <span className="fc-event-title-label">{event.title}</span>
      </div>
    </div>
  )
}

// ── Renderizado custom — vista mes ───────────────────────────
function DayGridEventContent({ event, creationMode }: { event: any; creationMode: 'turno' | 'bloqueo' }) {
  const { type } = event.extendedProps
  const isBloqueo = type === 'bloqueo' || (!type && creationMode === 'bloqueo')
  const startTime = event.start
    ? event.start.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
    : ''

  return (
    <div className={`fc-daygrid-event-custom ${isBloqueo ? 'fc-daygrid-bloqueo' : 'fc-daygrid-turno'}`}>
      <span className="fc-daygrid-dot-custom" />
      <span className="fc-daygrid-time-custom">{startTime}</span>
      <span className="fc-daygrid-title-custom">{event.title}</span>
    </div>
  )
}

export function CalendarView() {
  const calendarRef = useRef<FullCalendar>(null)
  const isMobile = useIsMobile()

  const [loading, setLoading] = useState(false)
  const [turnoModalOpen, setTurnoModalOpen] = useState(false)
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string } | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null)
  const [currentView, setCurrentView] = useState('timeGridWeek')
  const [creationMode, setCreationMode] = useState<'turno' | 'bloqueo'>('turno')

  // Cambiar vista al detectar cambio de tamaño
  useEffect(() => {
    const api = calendarRef.current?.getApi()
    if (!api) return
    const targetView = isMobile ? 'timeGridDay' : 'timeGridWeek'
    if (api.view.type !== targetView) {
      api.changeView(targetView)
    }
  }, [isMobile])

  const fetchEvents = useCallback(
    async (info: any, successCallback: any, failureCallback: any) => {
      setLoading(true)
      try {
        const res = await fetch(`/api/turnero?start=${info.startStr}&end=${info.endStr}`)
        const data = await res.json()

        if (!res.ok) throw new Error(data.error)

        const turnosMap = data.turnos.map((t: any) => ({
          id: t.id,
          title: t.paciente
            ? t.paciente.nombre_completo
            : t.paciente_nombre_libre || 'Turno Libre',
          start: t.fecha_inicio,
          end: t.fecha_fin,
          extendedProps: { type: 'turno', raw: t },
        }))

        const bloqueosMap = data.bloqueos.map((b: any) => ({
          id: `block-${b.id}`,
          title: b.motivo || 'Bloqueado',
          start: b.fecha_inicio,
          end: b.fecha_fin,
          extendedProps: { type: 'bloqueo', raw: b },
        }))

        successCallback([...turnosMap, ...bloqueosMap])
      } catch (error: any) {
        toast.error('Error al cargar agenda', { description: error.message })
        failureCallback(error)
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const handleDateSelect = (selectInfo: any) => {
    setSelectedEvent(null)
    setSelectedSlot({ start: selectInfo.startStr, end: selectInfo.endStr })
    if (creationMode === 'bloqueo') {
      setBlockModalOpen(true)
    } else {
      setTurnoModalOpen(true)
    }
    selectInfo.view.calendar.unselect()
  }

  const handleEventClick = (clickInfo: any) => {
    const { type, raw } = clickInfo.event.extendedProps
    setSelectedEvent(raw)
    setSelectedSlot(null)
    if (type === 'turno') setTurnoModalOpen(true)
    else if (type === 'bloqueo') setBlockModalOpen(true)
  }

  const handleEventDrop = async (dropInfo: any) => {
    const event = dropInfo.event
    if (event.extendedProps.type === 'bloqueo') {
      dropInfo.revert()
      return toast.error('No se puede arrastrar un bloqueo. Editalo desde el menú.')
    }
    try {
      const res = await fetch(`/api/turnero/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha_inicio: event.startStr, fecha_fin: event.endStr }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      toast.success('Turno reprogramado')
    } catch (error: any) {
      toast.error('Error al reprogramar', { description: error.message })
      dropInfo.revert()
    }
  }

  const handleEventResize = async (resizeInfo: any) => {
    const event = resizeInfo.event
    if (event.extendedProps.type === 'bloqueo') {
      resizeInfo.revert()
      return toast.error('No se puede redimensionar un bloqueo desde aquí.')
    }
    try {
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
    } catch (error: any) {
      toast.error('Error al actualizar duración', { description: error.message })
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
              creationMode === 'turno' && "bg-emerald-600 hover:bg-emerald-700 text-white border-transparent"
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
                : "text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
            )}
          >
            <Ban className="w-3.5 h-3.5" />
            Bloquear horario
          </Button>
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
          slotMinTime="08:00:00"
          slotMaxTime="20:00:00"
          hiddenDays={[0, 6]}
          allDaySlot={false}
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
          slotDuration="00:15:00"
          eventContent={(arg) => {
            if (arg.view.type === 'dayGridMonth') {
              return <DayGridEventContent event={arg.event} creationMode={creationMode} />
            }
            return <TurnoEventContent event={arg.event} creationMode={creationMode} />
          }}
          viewDidMount={(arg) => setCurrentView(arg.view.type)}
          datesSet={(arg) => setCurrentView(arg.view.type)}
        />
      </div>

      <TurnoFormModal
        open={turnoModalOpen}
        onOpenChange={setTurnoModalOpen}
        initialDates={selectedSlot}
        initialData={selectedEvent}
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
        initialData={selectedEvent}
        onSaved={refreshAction}
      />
    </>
  )
}
