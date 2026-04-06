import { createClient } from '@/lib/supabase/server'
import { CalendarView } from '@/components/turnero/calendar-view'
import PageHeader from '@/components/shared/page-header'
import { NotificacionesMedico } from '@/components/layout/notificaciones-medico'

export const metadata = {
  title: 'Mi Agenda',
}

export default async function TurnosPage() {
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
