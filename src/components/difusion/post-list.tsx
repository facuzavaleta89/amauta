'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Megaphone, Clock, CheckCircle2, Archive, MessageCircle, Mail } from 'lucide-react'

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ViewToggle } from '@/components/shared/view-toggle'
import { useViewMode } from '@/hooks/use-view-mode'
import { DIFUSION_CANAL_LABELS, type DifusionEstado, type DifusionCanal } from '@/lib/validations/difusion.schema'

interface DifusionPost {
  id: string
  titulo: string
  contenido: string
  estado: DifusionEstado
  canal: DifusionCanal
  created_at: string
}

interface PostListProps {
  posts: DifusionPost[]
}

function EstadoBadge({ estado }: { estado: DifusionEstado }) {
  switch (estado) {
    case 'borrador':
      return <Badge variant="secondary" className="gap-1 bg-muted text-muted-foreground"><Clock className="w-3 h-3"/> Borrador</Badge>
    case 'listo':
      return <Badge variant="default" className="gap-1 bg-blue-600 hover:bg-blue-700"><CheckCircle2 className="w-3 h-3"/> Listo</Badge>
    case 'enviado':
      return <Badge variant="default" className="gap-1 bg-emerald-600 hover:bg-emerald-700"><Megaphone className="w-3 h-3"/> Enviado</Badge>
    case 'archivado':
      return <Badge variant="outline" className="gap-1"><Archive className="w-3 h-3"/> Archivado</Badge>
  }
}

function CanalIcon({ canal }: { canal: DifusionCanal }) {
  if (canal === 'email') return <Mail className="w-4 h-4 text-muted-foreground" />
  if (canal === 'whatsapp') return <MessageCircle className="w-4 h-4 text-green-600" />
  return (
    <div className="flex -space-x-1">
      <Mail className="w-4 h-4 text-muted-foreground" />
      <MessageCircle className="w-4 h-4 text-green-600 bg-background rounded-full" />
    </div>
  )
}

export function PostList({ posts }: PostListProps) {
  const [view, setView] = useViewMode('amauta:view:difusion')

  if (posts.length === 0) {
    return (
      <div className="text-center py-24 bg-card/50 rounded-2xl border border-dashed border-border">
        <Megaphone className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-1">No hay comunicados</h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
          Aún no creaste ninguna campaña de difusión o no hay resultados para tu búsqueda.
        </p>
        <Link href="/difusion/nuevo">
          <Button>Crear mi primer comunicado</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ViewToggle mode={view} onChange={setView} />
      </div>

      {view === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map((post) => (
            <Link key={post.id} href={`/difusion/${post.id}`}>
              <Card className="h-full flex flex-col hover:shadow-lg transition-all duration-300 border-border/60 group hover:border-primary/30">
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start mb-3">
                    <EstadoBadge estado={post.estado} />
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded-full" title={DIFUSION_CANAL_LABELS[post.canal]}>
                      <CanalIcon canal={post.canal} />
                    </div>
                  </div>
                  <CardTitle className="line-clamp-2 text-xl font-bold leading-tight group-hover:text-primary transition-colors">
                    {post.titulo}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-grow">
                  <p className="text-sm text-muted-foreground line-clamp-3 font-serif leading-relaxed">
                    {post.contenido}
                  </p>
                </CardContent>
                <CardFooter className="border-t border-border/40 pt-4 pb-4 text-xs text-muted-foreground flex justify-between items-center">
                  <span>Creado el {format(new Date(post.created_at), "d MMM yyyy", { locale: es })}</span>
                  <span className="font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">Ver detalle →</span>
                </CardFooter>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border bg-card overflow-hidden">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/difusion/${post.id}`}
              className="group flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors"
            >
              <div className="shrink-0" title={DIFUSION_CANAL_LABELS[post.canal]}>
                <CanalIcon canal={post.canal} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                  {post.titulo}
                </h3>
                <p className="text-sm text-muted-foreground truncate">
                  {post.contenido}
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-3">
                <EstadoBadge estado={post.estado} />
                <span className="hidden sm:inline text-xs text-muted-foreground whitespace-nowrap">
                  {format(new Date(post.created_at), "d MMM yyyy", { locale: es })}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default PostList
