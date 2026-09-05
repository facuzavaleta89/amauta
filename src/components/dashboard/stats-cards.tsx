import { createClient } from '@/lib/supabase/server'
import { Users, CalendarDays, TrendingUp, ClipboardList } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { hoyAR, formatFechaAR, parseFechaHoraAR } from '@/lib/utils/format-date'

const MS_POR_DIA = 24 * 60 * 60 * 1000

async function getStats() {
  const supabase = await createClient()

  // ── Las tres ventanas temporales ───────────────────────────────────────────
  //
  // ⚠⚠ LAS TRES SE CONSTRUYEN COMO **INSTANTES** (`.toISOString()`, o sea CON offset),
  // nunca como strings de día. Del otro lado hay columnas `timestamptz`
  // (`turnos.fecha_inicio`, `consultas.created_at`), y un string SIN offset —del tipo
  // `"2026-09-04T00:00:00"`— no lo interpreta JS: lo interpreta **POSTGRES**, en la zona de
  // la SESIÓN, que es **UTC** (verificado a nivel de cluster: no hay override de `TimeZone`
  // para `authenticated` ni `authenticator`). Es la misma trampa de la nota técnica 25, en
  // el sentido de entrada.
  //
  // Por eso el día de partida sale de `hoyAR()` y el anclaje de `parseFechaHoraAR`: las tres
  // ventanas son días del **CONSULTORIO**, no del runtime — que en Vercel es UTC siempre, así
  // que derivarlas de `new Date()` fallaba TODOS los días, no solo de noche.

  const hoy = hoyAR() // "YYYY-MM-DD" en zona AR
  const inicioHoy = parseFechaHoraAR(`${hoy}T00:00`)

  // ── Hoy: [medianoche AR de hoy, medianoche AR de mañana) ───────────────────
  // ⚠ Intervalo SEMIABIERTO, igual que `lib/agenda/solapamiento.ts` (nota técnica 23). El
  // `.lte(…T23:59:59)` anterior perdía el último segundo del día: un turno a las 23:59:30
  // no se contaba.
  // ⚠ El día siguiente se calcula sumando milisegundos AL INSTANTE, no con `setDate()` sobre
  // una fecha local: así el cruce de medianoche queda anclado a AR y no depende de la zona
  // del runtime. (Asume que Argentina no tiene horario de verano, que es el caso desde 2009;
  // si volviera a tenerlo, este `+24 h` habría que derivarlo del día siguiente en calendario.)
  const desdeHoy = inicioHoy.toISOString()
  const hastaHoy = new Date(inicioHoy.getTime() + MS_POR_DIA).toISOString()

  // ── Semana ISO: desde el LUNES 00:00 AR ────────────────────────────────────
  // Criterio ISO: la semana va de lunes a domingo, y el DOMINGO pertenece a la semana que
  // TERMINA. El token `i` de date-fns da 1 = lunes … 7 = domingo, así que restar `(i - 1)`
  // días siempre cae en el lunes de la semana en curso.
  // ⚠ Esto corrige DOS bugs que no eran de zona:
  //   (a) el cálculo anterior conservaba la HORA ACTUAL, así que la semana arrancaba el lunes
  //       a la hora en que se abría el dashboard y los turnos del lunes a la mañana
  //       desaparecían por la tarde. Ahora ancla a la medianoche AR del lunes.
  //   (b) el DOMINGO contaba al revés: `getDay()` devuelve 0 y `getDate() - 0 + 1` daba
  //       MAÑANA, así que la tarjeta mostraba la semana que todavía no había empezado.
  const diaIso = Number(formatFechaAR(inicioHoy, 'i'))
  const inicioSemana = new Date(inicioHoy.getTime() - (diaIso - 1) * MS_POR_DIA).toISOString()

  // ── Mes: día 1 a las 00:00 AR ──────────────────────────────────────────────
  // ⚠ El año y el mes salen de `hoy` (zona AR), NO de `getFullYear()`/`getMonth()`, que leen
  // la zona del RUNTIME. La medianoche AR del día 1 son las 03:00 UTC, así que con el cálculo
  // anterior el mes arrancaba a las 21:00 del último día del mes ANTERIOR.
  const inicioMes = parseFechaHoraAR(`${hoy.slice(0, 7)}-01T00:00`).toISOString()

  const [
    { count: totalPacientes },
    { count: turnosHoy },
    { count: turnosSemana },
    { count: consultasMes },
  ] = await Promise.all([
    supabase.from('pacientes').select('*', { count: 'exact', head: true }).is('archivado_at', null),
    supabase
      .from('turnos')
      .select('*', { count: 'exact', head: true })
      .gte('fecha_inicio', desdeHoy)
      .lt('fecha_inicio', hastaHoy)
      .not('estado', 'eq', 'cancelado'),
    supabase
      .from('turnos')
      .select('*', { count: 'exact', head: true })
      .gte('fecha_inicio', inicioSemana)
      .not('estado', 'eq', 'cancelado'),
    supabase
      .from('consultas')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', inicioMes),
  ])

  return {
    totalPacientes: totalPacientes ?? 0,
    turnosHoy: turnosHoy ?? 0,
    turnosSemana: turnosSemana ?? 0,
    consultasMes: consultasMes ?? 0,
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
      color: 'text-chart-3',
      bg: 'bg-chart-3/10',
    },
    {
      title: 'Turnos esta semana',
      value: stats.turnosSemana,
      icon: TrendingUp,
      description: 'Desde el lunes',
      color: 'text-chart-2',
      bg: 'bg-chart-2/10',
    },
    {
      title: 'Consultas este mes',
      value: stats.consultasMes,
      icon: ClipboardList,
      description: 'Consultas registradas',
      color: 'text-success',
      bg: 'bg-success/10',
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
