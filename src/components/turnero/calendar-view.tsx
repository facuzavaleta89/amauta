'use client'

import React, { useState, useCallback, useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import dayGridPlugin from '@fullcalendar/daygrid'
import esLocale from '@fullcalendar/core/locales/es'
import { toast } from 'sonner'
import { Loader2, CalendarPlus, Ban, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

import { TurnoFormModal } from './turno-form'
import { BlockSlotModal } from './block-slot-modal'

// ── Renderizado custom — vista semana/día ────────────────────
function TurnoEventContent({ event }: { event: any }) {
  const { type } = event.extendedProps
  const isBloqueo = type === 'bloqueo'

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
function DayGridEventContent({ event }: { event: any }) {
  const { type } = event.extendedProps
  const isBloqueo = type === 'bloqueo'
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

  const [loading, setLoading] = useState(false)

  // Modals state
  const [turnoModalOpen, setTurnoModalOpen] = useState(false)
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string } | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null)
  const [currentView, setCurrentView] = useState('timeGridWeek')

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
    setTurnoModalOpen(true)
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

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              setSelectedEvent(null)
              setSelectedSlot(null)
              setTurnoModalOpen(true)
            }}
            className="gap-1.5 h-8 text-xs"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            Nuevo turno
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSelectedEvent(null)
              setSelectedSlot(null)
              setBlockModalOpen(true)
            }}
            className="gap-1.5 h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
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
          {loading ? 'Cargando...' : 'Actualizar'}
        </Button>
      </div>

      <div className="calendar-container h-[calc(100%-3rem)] w-full">
        <FullCalendar
          ref={calendarRef}
          plugins={[timeGridPlugin, interactionPlugin, dayGridPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          locales={[esLocale]}
          locale="es"
          buttonText={{
            today: 'Hoy',
            month: 'Mes',
            week: 'Semana',
            day: 'Día',
            prev: '‹',
            next: '›'
          }}
          slotMinTime="08:00:00"
          slotMaxTime="20:00:00"
          hiddenDays={[0, 6]}
          allDaySlot={false}
          selectable={true}
          editable={true}
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
              return <DayGridEventContent event={arg.event} />
            }
            return <TurnoEventContent event={arg.event} />
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
