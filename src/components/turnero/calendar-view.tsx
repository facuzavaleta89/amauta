'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import dayGridPlugin from '@fullcalendar/daygrid'
import esLocale from '@fullcalendar/core/locales/es'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

// Dialogs that we will implement next
import { TurnoFormModal } from './turno-form'
import { BlockSlotModal } from './block-slot-modal'

export function CalendarView() {
  const calendarRef = useRef<FullCalendar>(null)
  
  const [loading, setLoading] = useState(false)
  
  // Modals state
  const [turnoModalOpen, setTurnoModalOpen] = useState(false)
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<{ start: string, end: string } | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null)
  
  const fetchEvents = useCallback(async (info: any, successCallback: any, failureCallback: any) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/turnero?start=${info.startStr}&end=${info.endStr}`)
      const data = await res.json()

      if (!res.ok) throw new Error(data.error)
      
      const turnosMap = data.turnos.map((t: any) => ({
        id: t.id,
        title: t.paciente ? t.paciente.nombre_completo : (t.paciente_nombre_libre || 'Turno Libre'),
        start: t.fecha_inicio,
        end: t.fecha_fin,
        classNames: ['!bg-primary', '!border-primary', '!text-primary-foreground', 'shadow-sm'],
        extendedProps: { type: 'turno', raw: t }
      }))

      const bloqueosMap = data.bloqueos.map((b: any) => ({
        id: `block-${b.id}`,
        title: b.motivo || 'Bloqueado',
        start: b.fecha_inicio,
        end: b.fecha_fin,
        classNames: ['!bg-destructive/80', '!border-destructive/20', '!text-destructive-foreground', 'shadow-sm'],
        extendedProps: { type: 'bloqueo', raw: b }
      }))

      successCallback([...turnosMap, ...bloqueosMap])
    } catch (error: any) {
      toast.error('Error al cargar agenda', { description: error.message })
      failureCallback(error)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleDateSelect = (selectInfo: any) => {
    setSelectedEvent(null)
    setSelectedSlot({
      start: selectInfo.startStr,
      end: selectInfo.endStr
    })
    // For now automatically trigger Turno Modal
    setTurnoModalOpen(true)
    
    let calendarApi = selectInfo.view.calendar
    calendarApi.unselect() 
  }

  const handleEventClick = (clickInfo: any) => {
     const { type, raw } = clickInfo.event.extendedProps
     setSelectedEvent(raw)
     setSelectedSlot(null)
     if (type === 'turno') {
        setTurnoModalOpen(true)
     } else if (type === 'bloqueo') {
        setBlockModalOpen(true)
     }
  }

  const handleEventDrop = async (dropInfo: any) => {
    const event = dropInfo.event
    if (event.extendedProps.type === 'bloqueo') {
      dropInfo.revert()
      return toast.error('No arrastrar bloqueos vía calendario.')
    }

    try {
      const res = await fetch(`/api/turnero/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha_inicio: event.startStr,
          fecha_fin: event.endStr
        })
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error)
      }

      toast.success('Turno reprogramado exitosamente')
    } catch (error: any) {
      toast.error('Error de reprogramación', { description: error.message })
      dropInfo.revert()
    }
  }

  const handleEventResize = async (resizeInfo: any) => {
    const event = resizeInfo.event
    if (event.extendedProps.type === 'bloqueo') {
      resizeInfo.revert()
      return toast.error('No redimensionar bloqueos vía calendario.')
    }

    try {
      const res = await fetch(`/api/turnero/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha_inicio: event.startStr,
          fecha_fin: event.endStr
        })
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error)
      }

      toast.success('Duración actualizada')
    } catch (error: any) {
      toast.error('Error al redimensionar', { description: error.message })
      resizeInfo.revert()
    }
  }

  const refreshAction = () => {
    if (calendarRef.current) {
        calendarRef.current.getApi().refetchEvents()
    }
  }

  return (
    <>
      {loading && (
        <div className="absolute top-2 right-2 p-2 z-10 bg-background/50 backdrop-blur rounded">
           <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      )}
      
      <div className="calendar-container h-full w-full">
        <FullCalendar
          ref={calendarRef}
          plugins={[ timeGridPlugin, interactionPlugin, dayGridPlugin ]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
          }}
          locales={[esLocale]}
          locale="es"
          buttonText={{
            today: 'Hoy',
            month: 'Mes',
            week: 'Semana',
            day: 'Día'
          }}
          slotMinTime="08:00:00"
          slotMaxTime="20:00:00"
          hiddenDays={[0, 6]} // Hide Sunday and Saturday
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
            hour12: false
          }}
          height="100%"
          slotDuration="00:15:00"
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
