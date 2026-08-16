import { createClient } from '@/lib/supabase/server'
import { verificarPermiso } from '@/lib/utils/verificar-permiso'
import { Button } from '@/components/ui/button'
import { BotonCrearConPermiso } from '@/components/shared/boton-crear-con-permiso'
import { Input } from '@/components/ui/input'
import { PlusCircle, ClipboardList, FileText, Calendar, Search, X, Ban } from 'lucide-react'
import Link from 'next/link'
import { formatFecha } from '@/lib/utils/format-date'

export const metadata = {
  title: 'Pedidos de Estudios — Amauta',
}

interface Props {
  searchParams?: Promise<{ q?: string }>
}

export default async function PedidosPage({ searchParams }: Props) {
  // Guard: redirige a /sin-acceso si el asistente no tiene ver_pedidos
  await verificarPermiso('ver_pedidos')

  const params = await searchParams
  const q = params?.q?.trim() ?? ''

  const supabase = await createClient()

  let query = supabase
    .from('pedidos')
    .select(`
      id, paciente_id, paciente_nombre, paciente_dni,
      diagnostico, estudios_pedidos, fecha_pedido, created_at, estado
    `)
    .order('fecha_pedido', { ascending: false })
    .limit(50)

  if (q) {
    // Busca por nombre o DNI
    query = query.or(`paciente_nombre.ilike.%${q}%,paciente_dni.ilike.%${q}%`)
  }

  const { data: pedidos } = await query

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
        <BotonCrearConPermiso
          permiso="crear_pedidos"
          href="/pedidos/nuevo"
          className="gap-2 shrink-0"
          tituloSinPermiso="Requiere permiso para emitir pedidos"
        >
          <PlusCircle className="h-4 w-4" />
          Nuevo Pedido
        </BotonCrearConPermiso>
      </div>

      {/* Búsqueda */}
      <form className="flex items-center gap-2 max-w-md">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Buscar por nombre o DNI..."
            className="pl-9"
            autoComplete="off"
          />
        </div>
        {q && (
          <Button asChild variant="ghost" size="icon" title="Limpiar búsqueda">
            <Link href="/pedidos">
              <X className="h-4 w-4" />
            </Link>
          </Button>
        )}
      </form>

      {/* Resultados */}
      {q && (
        <p className="text-sm text-muted-foreground -mt-2">
          {pedidos?.length
            ? `${pedidos.length} resultado${pedidos.length !== 1 ? 's' : ''} para "${q}"`
            : `Sin resultados para "${q}"`}
        </p>
      )}

      {/* Lista */}
      {!pedidos || pedidos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <ClipboardList className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {q ? 'Sin resultados' : 'Sin pedidos registrados'}
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            {q
              ? 'No hay pedidos que coincidan con tu búsqueda. Probá con otro nombre o DNI.'
              : 'Los pedidos de estudios que emitas aparecerán aquí. Podés crear uno desde la ficha del paciente o desde este botón.'}
          </p>
          {!q && (
            <BotonCrearConPermiso
              permiso="crear_pedidos"
              href="/pedidos/nuevo"
              className="gap-2"
              tituloSinPermiso="Requiere permiso para emitir pedidos"
            >
              <PlusCircle className="h-4 w-4" />
              Crear primer pedido
            </BotonCrearConPermiso>
          )}
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
                      {pedido.diagnostico && (
                        <p className="text-sm text-muted-foreground mt-1.5 line-clamp-1">
                          {pedido.diagnostico}
                        </p>
                      )}
                      {pedido.estudios_pedidos && (
                        <p className="text-xs text-muted-foreground/70 mt-0.5 line-clamp-1 font-mono">
                          {pedido.estudios_pedidos.split('\n')[0]}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {pedido.estado === 'revocado' && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-red-500/10 text-red-700 dark:text-red-400 ring-1 ring-inset ring-red-500/20">
                        <Ban className="h-2.5 w-2.5" />
                        Anulado
                      </span>
                    )}
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
