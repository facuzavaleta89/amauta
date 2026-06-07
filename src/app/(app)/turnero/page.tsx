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
    <div className="flex flex-col h-[calc(100vh-theme(spacing.16))] gap-4">
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
