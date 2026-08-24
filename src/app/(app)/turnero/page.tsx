import { verificarPermiso } from '@/lib/utils/verificar-permiso'
import { CalendarView } from '@/components/turnero/calendar-view'
import PageHeader from '@/components/shared/page-header'

export const metadata = {
  title: 'Mi Agenda',
}

export default async function TurnosPage() {
  // Guard: redirige a /sin-acceso si el asistente no tiene ver_turnos
  await verificarPermiso('ver_turnos')

  return (
    // Página de PANTALLA COMPLETA. `h-full` = el alto del wrapper de contenido del
    // shell (padding ya descontado); de ahí para abajo el reparto es por flex.
    // `gap-6` = el mismo 1.5rem que `space-y-6`, en su forma flex.
    //
    // ⚠ El `h-full` es un PORCENTAJE y solo funciona porque el wrapper del shell tiene
    // alto DEFINIDO. Todo el dimensionado del calendario cuelga de eso: la card, el
    // `h-[calc(100%-3rem)]` de `.calendar-container` y el `height="100%"` de
    // FullCalendar son porcentajes encadenados, y contra un contenedor de alto `auto`
    // caen a `auto` — el calendario se dibuja con alto 0 y la página se ve VACÍA.
    // Ver el comentario del <main> en `layout-shell.tsx` antes de tocar cualquier punta.
    <div className="h-full flex flex-col gap-6">
      <PageHeader
        title="Agenda"
        description="Gestioná tus turnos, bloqueos de horarios y reprogramaciones."
      />

      <div className="flex-1 bg-card rounded-xl border shadow-sm p-4 h-full relative overflow-hidden">
        <CalendarView />
      </div>
    </div>
  )
}
