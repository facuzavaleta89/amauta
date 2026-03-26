import { createClient } from '@/lib/supabase/server'
import { Users, CalendarDays, TrendingUp, UserPlus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

async function getStats() {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]
  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1)
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  const [
    { count: totalPacientes },
    { count: turnosHoy },
    { count: turnosSemana },
    { count: nuevosMes },
  ] = await Promise.all([
    supabase.from('pacientes').select('*', { count: 'exact', head: true }),
    supabase
      .from('turnos')
      .select('*', { count: 'exact', head: true })
      .gte('fecha_inicio', `${today}T00:00:00`)
      .lte('fecha_inicio', `${today}T23:59:59`)
      .not('estado', 'eq', 'cancelado'),
    supabase
      .from('turnos')
      .select('*', { count: 'exact', head: true })
      .gte('fecha_inicio', weekStart.toISOString())
      .not('estado', 'eq', 'cancelado'),
    supabase
      .from('pacientes')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', monthStart),
  ])

  return {
    totalPacientes: totalPacientes ?? 0,
    turnosHoy: turnosHoy ?? 0,
    turnosSemana: turnosSemana ?? 0,
    nuevosMes: nuevosMes ?? 0,
  }
}

export async function StatsCards() {
  const stats = await getStats()

  const cards = [
    {
      title: 'Total Pacientes',
      value: stats.totalPacientes,
      icon: Users,
      description: 'Pacientes registrados',
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      title: 'Turnos Hoy',
      value: stats.turnosHoy,
      icon: CalendarDays,
      description: 'Turnos activos para hoy',
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      title: 'Turnos esta semana',
      value: stats.turnosSemana,
      icon: TrendingUp,
      description: 'Desde el lunes',
      color: 'text-teal-600',
      bg: 'bg-teal-50',
    },
    {
      title: 'Nuevos este mes',
      value: stats.nuevosMes,
      icon: UserPlus,
      description: 'Pacientes nuevos',
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <Card key={card.title} className="border-border/60 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${card.bg}`}>
                <Icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-foreground">{card.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
