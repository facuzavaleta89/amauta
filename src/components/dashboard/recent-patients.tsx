import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export async function RecentPatients() {
  const supabase = await createClient()

  const { data: pacientes } = await supabase
    .from('pacientes')
    .select(`
      id,
      nombre_completo,
      dni,
      created_at,
      obras_sociales ( nombre )
    `)
    .order('created_at', { ascending: false })
    .limit(5)

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Últimos pacientes registrados
          </span>
          <Link
            href="/pacientes"
            className="text-xs text-primary hover:underline font-normal"
          >
            Ver todos
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!pacientes || pacientes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No hay pacientes registrados aún
          </p>
        ) : (
          <div className="space-y-1">
            {pacientes.map((p) => {
              const obraSocial =
                (p.obras_sociales as unknown as { nombre: string } | null)?.nombre ?? '—'
              return (
                <Link
                  key={p.id}
                  href={`/pacientes/${p.id}`}
                  className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-muted transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-semibold text-primary">
                        {p.nombre_completo.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground leading-tight">
                        {p.nombre_completo}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        DNI {p.dni} · {obraSocial}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground hidden sm:block">
                      {format(new Date(p.created_at), "d MMM", { locale: es })}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
