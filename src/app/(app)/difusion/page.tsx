import { createClient } from '@/lib/supabase/server'
import { Plus, Search, Megaphone, Clock, CheckCircle2, Archive, MessageCircle, Mail } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  DIFUSION_ESTADO_LABELS,
  DIFUSION_CANAL_LABELS,
  type DifusionEstado,
  type DifusionCanal
} from '@/lib/validations/difusion.schema'

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

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, medico_id')
    .eq('id', user.id)
    .single()

  const tenantMedicoId = profile?.role === 'medico' ? user.id : profile?.medico_id

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
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Megaphone className="h-8 w-8 text-primary" />
            Difusión y Comunicados
          </h1>
          <p className="text-muted-foreground mt-1">
            Mantené a tus pacientes informados. Creá campañas y enviá comunicados por Email o WhatsApp.
          </p>
        </div>
        <Link href="/difusion/nuevo">
          <Button className="gap-2 shrink-0 shadow-md">
            <Plus className="h-5 w-5" />
            Nuevo Comunicado
          </Button>
        </Link>
      </div>

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
          <Link href={`/difusion?q=${q}&estado=todos`}>
            <Badge variant={estado === 'todos' || !estado ? 'default' : 'outline'} className="cursor-pointer">
              Todos
            </Badge>
          </Link>
          <Link href={`/difusion?q=${q}&estado=borrador`}>
            <Badge variant={estado === 'borrador' ? 'secondary' : 'outline'} className="cursor-pointer">
              Borradores
            </Badge>
          </Link>
          <Link href={`/difusion?q=${q}&estado=listo`}>
            <Badge variant={estado === 'listo' ? 'default' : 'outline'} className="cursor-pointer bg-blue-600 hover:bg-blue-700">
              Listos
            </Badge>
          </Link>
          <Link href={`/difusion?q=${q}&estado=enviado`}>
            <Badge variant={estado === 'enviado' ? 'default' : 'outline'} className="cursor-pointer bg-emerald-600 hover:bg-emerald-700">
              Enviados
            </Badge>
          </Link>
        </div>
      </div>

      {/* Grid de Posts (Blog-style) */}
      {posts && posts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map((post) => (
            <Link key={post.id} href={`/difusion/${post.id}`}>
              <Card className="h-full flex flex-col hover:shadow-lg transition-all duration-300 border-border/60 group hover:border-primary/30">
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start mb-3">
                    <EstadoBadge estado={post.estado as DifusionEstado} />
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded-full" title={DIFUSION_CANAL_LABELS[post.canal as DifusionCanal]}>
                      <CanalIcon canal={post.canal as DifusionCanal} />
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
      )}
    </div>
  )
}
