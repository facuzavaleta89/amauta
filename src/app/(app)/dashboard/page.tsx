import type { Metadata } from 'next'
import { Suspense } from 'react'
import { StatsCards } from '@/components/dashboard/stats-cards'
import { NextAppointments } from '@/components/dashboard/next-appointments'
import { RecentPatients } from '@/components/dashboard/recent-patients'
import { Skeleton } from '@/components/ui/skeleton'

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
  const today = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1 capitalize">{today}</p>
      </div>

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
