import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { PlusCircle, ClipboardList, FileText, Calendar } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export const metadata = {
  title: 'Pedidos de Estudios',
}

export default async function PedidosPage() {
  const supabase = await createClient()

  const { data: pedidos } = await supabase
    .from('pedidos')
    .select(`
      id, paciente_id, paciente_nombre, paciente_dni,
      diagnostico, estudios_pedidos, fecha_pedido, created_at
    `)
    .order('fecha_pedido', { ascending: false })
    .limit(50)

  const formatFecha = (d: string) => {
    try {
      return format(new Date(d + 'T12:00:00'), "d MMM yyyy", { locale: es })
    } catch {
      return d
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pedidos de Estudios</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Solicitudes de estudios complementarios emitidas
          </p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/pedidos/nuevo">
            <PlusCircle className="h-4 w-4" />
            Nuevo Pedido
          </Link>
        </Button>
      </div>

      {/* Lista */}
      {!pedidos || pedidos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <ClipboardList className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Sin pedidos registrados
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            Los pedidos de estudios que emitas aparecerán aquí. Podés crear uno desde la ficha del paciente o desde este botón.
          </p>
          <Button asChild className="gap-2">
            <Link href="/pedidos/nuevo">
              <PlusCircle className="h-4 w-4" />
              Crear primer pedido
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {pedidos.map((pedido) => (
            <Link
              key={pedido.id}
              href={`/pedidos/${pedido.id}`}
              className="block group"
            >
              <div className="bg-card border border-border/60 rounded-xl px-5 py-4 hover:border-primary/40 hover:shadow-md transition-all duration-200">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                        {pedido.paciente_nombre}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        DNI: {pedido.paciente_dni}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1.5 line-clamp-1">
                        {pedido.diagnostico}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {formatFecha(pedido.fecha_pedido)}
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
