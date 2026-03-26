import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CalendarDays, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const estadoBadge: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  pendiente:    { label: 'Pendiente', variant: 'secondary' },
  confirmado:   { label: 'Confirmado', variant: 'default' },
  presente:     { label: 'Presente', variant: 'default' },
  ausente:      { label: 'Ausente', variant: 'destructive' },
  cancelado:    { label: 'Cancelado', variant: 'destructive' },
  reprogramado: { label: 'Reprogramado', variant: 'outline' },
}

export async function NextAppointments() {
  const supabase = await createClient()
  const now = new Date().toISOString()

  const { data: turnos } = await supabase
    .from('turnos')
    .select(`
      id,
      fecha_inicio,
      estado,
      paciente_nombre_libre,
      pacientes ( nombre_completo )
    `)
    .gte('fecha_inicio', now)
    .not('estado', 'in', '("cancelado","ausente")')
    .order('fecha_inicio', { ascending: true })
    .limit(6)

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          Próximos turnos
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!turnos || turnos.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No hay turnos próximos
          </p>
        ) : (
          <div className="space-y-2">
            {turnos.map((turno) => {
              const nombre =
                (turno.pacientes as unknown as { nombre_completo: string } | null)?.nombre_completo ??
                turno.paciente_nombre_libre ??
                'Sin nombre'
              const bad = estadoBadge[turno.estado] ?? estadoBadge.pendiente
              const fecha = new Date(turno.fecha_inicio)

              return (
                <div
                  key={turno.id}
                  className="flex items-center justify-between py-2 border-b border-border/40 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-center bg-primary/8 rounded-md px-2 py-1 min-w-[50px]">
                      <span className="text-[10px] text-primary/80 font-medium uppercase">
                        {format(fecha, 'EEE', { locale: es })}
                      </span>
                      <span className="text-sm font-bold text-primary leading-none">
                        {format(fecha, 'd')}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground leading-tight">{nombre}</p>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <Clock className="h-3 w-3" />
                        {format(fecha, 'HH:mm')}
                      </span>
                    </div>
                  </div>
                  <Badge variant={bad.variant} className="text-xs">
                    {bad.label}
                  </Badge>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
