import type { Metadata } from 'next'
import { Suspense } from 'react'
import { StatsCards } from '@/components/dashboard/stats-cards'
import { NextAppointments } from '@/components/dashboard/next-appointments'
import { RecentPatients } from '@/components/dashboard/recent-patients'
import { Skeleton } from '@/components/ui/skeleton'
import PageHeader from '@/components/shared/page-header'
import { formatFechaAR } from '@/lib/utils/format-date'

export const metadata: Metadata = {
  title: 'Dashboard',
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-xl" />
      ))}
    </div>
  )
}

function WidgetSkeleton() {
  return <Skeleton className="h-64 rounded-xl" />
}

export default function DashboardPage() {
  const fechaHoy = formatFechaAR(new Date(), "EEEE, d 'de' MMMM 'de' yyyy")
  // El bloque de título lo emite ahora PageHeader, que no expone className para la
  // descripción: la mayúscula inicial (antes `capitalize` en el <p>) se resuelve acá.
  // ⚠ Es sentence case, no title case: `capitalize` de CSS ponía en mayúscula TODAS
  // las palabras ("Domingo, 23 De Agosto De 2026").
  const today = fechaHoy.charAt(0).toUpperCase() + fechaHoy.slice(1)

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description={today} />

      {/* Stats */}
      <Suspense fallback={<StatsSkeleton />}>
        <StatsCards />
      </Suspense>

      {/* Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Suspense fallback={<WidgetSkeleton />}>
          <NextAppointments />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton />}>
          <RecentPatients />
        </Suspense>
      </div>
    </div>
  )
}
