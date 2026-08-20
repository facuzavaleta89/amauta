import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { formatFechaAR } from '@/lib/utils/format-date'
import { resolverObraSocial, SIN_OBRA_SOCIAL_LABEL } from '@/lib/pacientes/obra-social'

/**
 * Proyección PROPIA de este componente. No pasa por `GET /api/pacientes`, así que NO es
 * un `PacienteBusqueda`: trae `created_at` (que aquél no proyecta) y no trae
 * `fecha_nacimiento`, `obra_social_id`, `numero_afiliado`, `telefono` ni `email`.
 * El shape lo fija el `.select()` de acá abajo — si se toca uno, se toca el otro.
 */
interface PacienteReciente {
  id: string
  nombre_completo: string
  dni: string
  created_at: string
  /** Join `obras_sociales ( nombre )`. NULL si la obra social no es del catálogo. */
  obras_sociales: { nombre: string } | null
  /** Texto libre, para los pacientes cuya obra social no está en el catálogo. */
  obra_social_otro: string | null
}

export async function RecentPatients() {
  const supabase = await createClient()

  const { data: pacientes } = await supabase
    .from('pacientes')
    .select(`
      id,
      nombre_completo,
      dni,
      created_at,
      obra_social_otro,
      obras_sociales ( nombre )
    `)
    .is('archivado_at', null)
    .order('created_at', { ascending: false })
    .limit(5)
    .overrideTypes<PacienteReciente[], { merge: false }>()

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
              const obraSocial = resolverObraSocial(p) ?? SIN_OBRA_SOCIAL_LABEL
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
                      {formatFechaAR(p.created_at, 'd MMM')}
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
