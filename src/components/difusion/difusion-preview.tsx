'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import {
  ArrowLeft, Edit, Trash2, Send, Mail, MessageCircle, 
  Calendar, CheckCircle2, Clock, Archive, Loader2, AlertCircle
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { DIFUSION_CANAL_LABELS, DIFUSION_ESTADO_LABELS } from '@/lib/validations/difusion.schema'

interface DifusionPreviewProps {
  post: any
}

export function DifusionPreview({ post }: DifusionPreviewProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleDelete() {
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/difusion/${post.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al eliminar')
      
      toast.success('Comunicado eliminado')
      router.push('/difusion')
      router.refresh()
    } catch {
      toast.error('No se pudo eliminar')
      setIsDeleting(false)
    }
  }

  // Helper para el badge de estado
  const getEstadoBadge = () => {
    switch (post.estado) {
      case 'borrador': return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1"/> Borrador</Badge>
      case 'listo': return <Badge variant="default" className="bg-blue-600"><CheckCircle2 className="w-3 h-3 mr-1"/> Listo para enviar</Badge>
      case 'enviado': return <Badge variant="default" className="bg-emerald-600"><CheckCircle2 className="w-3 h-3 mr-1"/> Enviado</Badge>
      case 'archivado': return <Badge variant="outline"><Archive className="w-3 h-3 mr-1"/> Archivado</Badge>
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Encabezado de acciones */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/difusion" className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold text-foreground">Vista Previa</h1>
        </div>

        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar comunicado?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta acción no se puede deshacer. El comunicado &quot;{post.titulo}&quot; será eliminado permanentemente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
                  {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Link href={`/difusion/${post.id}/editar`}>
            <Button variant="outline" className="gap-2">
              <Edit className="h-4 w-4" />
              Editar
            </Button>
          </Link>
          
          <Button disabled={post.estado === 'enviado'} className="gap-2 shadow-md">
            <Send className="h-4 w-4" />
            Configurar Envío
          </Button>
        </div>
      </div>

      {/* Tarjeta de Resumen */}
      <div className="bg-card border border-border/60 rounded-xl shadow-sm p-4 sm:p-6 flex flex-col sm:flex-row gap-6 justify-between items-start">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {getEstadoBadge()}
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Actualizado el {format(new Date(post.updated_at), "d MMM, yyyy", { locale: es })}
            </span>
          </div>
          <h2 className="text-xl font-bold text-foreground">{post.titulo}</h2>
        </div>
        
        <div className="bg-muted/50 rounded-lg p-3 shrink-0 min-w-[200px]">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Canal de envío</p>
          <div className="flex items-center gap-2 text-sm font-medium">
            {post.canal === 'whatsapp' ? <MessageCircle className="h-4 w-4 text-green-600" /> : <Mail className="h-4 w-4 text-blue-600" />}
            {DIFUSION_CANAL_LABELS[post.canal as keyof typeof DIFUSION_CANAL_LABELS]}
          </div>
        </div>
      </div>

      {/* Visor de Documento (Simulación de Email/Mensaje) */}
      <div className="bg-white border border-border/60 rounded-xl shadow-lg overflow-hidden mt-8">
        {/* Header simulado */}
        {(post.canal === 'email' || post.canal === 'ambos') && (
          <div className="bg-muted/30 border-b border-border/40 px-6 py-4 space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-muted-foreground">Asunto:</span>
              <span className="text-foreground font-medium">{post.asunto_email || '(Sin asunto)'}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>De: <span className="font-medium text-foreground">Consultorio Médico</span></span>
            </div>
          </div>
        )}

        {/* Cuerpo simulado */}
        <div className="p-8 sm:p-12">
          {post.canal === 'whatsapp' && (
            <div className="mb-6 flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-lg text-sm w-fit">
              <MessageCircle className="h-4 w-4" />
              Vista previa optimizada para mensaje de texto
            </div>
          )}

          <div className="prose prose-sm sm:prose-base prose-slate max-w-none font-serif leading-relaxed text-foreground whitespace-pre-wrap">
            {post.contenido}
          </div>
        </div>

        <div className="bg-primary/5 px-8 py-4 border-t border-primary/10 text-xs text-muted-foreground text-center">
          Este mensaje se enviará a través de la plataforma Amauta.
        </div>
      </div>
      
      {post.estado === 'borrador' && (
        <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <AlertCircle className="h-5 w-5 shrink-0 text-blue-600" />
          <p>
            Este comunicado aún es un borrador. Para poder enviarlo, modificalo y cambiá su estado a <strong>&quot;Listo para enviar&quot;</strong>.
          </p>
        </div>
      )}
    </div>
  )
}
