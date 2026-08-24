import { createClient } from '@/lib/supabase/server'
import { resolverTenant } from '@/lib/auth/tenant'
import { redirect } from 'next/navigation'
import { Plus, Search } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { PostList } from '@/components/difusion/post-list'
import PageHeader from '@/components/shared/page-header'

export const metadata = {
  title: 'Difusión — Amauta',
}

export default async function DifusionPage(props: {
  searchParams?: Promise<{ q?: string; estado?: string }>
}) {
  const searchParams = await props.searchParams
  const q = searchParams?.q || ''
  const estado = searchParams?.estado || 'todos'

  const supabase = await createClient()

  // Determinar tenant
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const tenantMedicoId = await resolverTenant(supabase, user.id)
  if (!tenantMedicoId) redirect('/onboarding')

  // Obtener posts
  let query = supabase
    .from('difusion_posts')
    .select('id, titulo, contenido, estado, canal, created_at')
    .eq('medico_id', tenantMedicoId)
    .order('created_at', { ascending: false })

  if (q) {
    query = query.ilike('titulo', `%${q}%`)
  }
  if (estado && estado !== 'todos') {
    query = query.eq('estado', estado)
  }

  const { data: posts } = await query

  return (
    <div className="space-y-6">
      <PageHeader
        title="Difusión y Comunicados"
        description="Mantené a tus pacientes informados. Creá campañas y enviá comunicados por Email o WhatsApp."
      >
        <Link href="/difusion/nuevo">
          <Button className="gap-2 shrink-0 shadow-md">
            <Plus className="h-5 w-5" />
            Nuevo Comunicado
          </Button>
        </Link>
      </PageHeader>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <form className="relative flex-1 w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Buscar comunicados por título..."
            className="pl-9 bg-card shadow-sm"
          />
          {estado && estado !== 'todos' && <input type="hidden" name="estado" value={estado} />}
        </form>

        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {/* Todos */}
          <Link href={`/difusion?q=${q}&estado=todos`}>
            <Badge
              variant={!estado || estado === 'todos' ? 'default' : 'outline'}
              className="cursor-pointer select-none"
            >
              Todos
            </Badge>
          </Link>

          {/* Borradores */}
          <Link href={`/difusion?q=${q}&estado=borrador`}>
            <Badge
              variant="outline"
              className={`cursor-pointer select-none transition-colors ${
                estado === 'borrador'
                  ? 'bg-secondary text-secondary-foreground border-secondary'
                  : 'hover:bg-muted'
              }`}
            >
              Borradores
            </Badge>
          </Link>

          {/* Listos */}
          <Link href={`/difusion?q=${q}&estado=listo`}>
            <Badge
              variant="outline"
              className={`cursor-pointer select-none transition-colors ${
                estado === 'listo'
                  ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                  : 'hover:bg-muted'
              }`}
            >
              Listos
            </Badge>
          </Link>

          {/* Enviados */}
          <Link href={`/difusion?q=${q}&estado=enviado`}>
            <Badge
              variant="outline"
              className={`cursor-pointer select-none transition-colors ${
                estado === 'enviado'
                  ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                  : 'hover:bg-muted'
              }`}
            >
              Enviados
            </Badge>
          </Link>
        </div>
      </div>

      {/* Listado de comunicados (mosaico / lista, con toggle) */}
      <PostList posts={posts ?? []} />
    </div>
  )
}
