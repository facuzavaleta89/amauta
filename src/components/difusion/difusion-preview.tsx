'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Edit, Trash2, Send, Mail, MessageCircle,
  Calendar, CheckCircle2, Clock, Archive, Loader2, AlertCircle, AlertTriangle, Megaphone,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import PageHeader from '@/components/shared/page-header'
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
import {
  DIFUSION_CANAL_LABELS,
  type DifusionEstado,
  type DifusionCanal,
} from '@/lib/validations/difusion.schema'
import { cn } from '@/lib/utils'
import { formatFecha } from '@/lib/utils/format-date'
import { EnviarModal } from '@/components/difusion/enviar-modal'

// Tipo explícito del post de difusión
interface DifusionPost {
  id: string
  titulo: string
  contenido: string
  estado: DifusionEstado
  canal: DifusionCanal
  asunto_email?: string | null
  medico_id: string
  creado_por: string
  created_at: string
  updated_at: string
}

interface EnvioFallido {
  paciente_id: string | null
  nombre: string | null
  email: string | null
  error: string | null
}

interface EnvioResumen {
  total: number
  ok: number
  fallidos: EnvioFallido[]
}

interface DifusionPreviewProps {
  post: DifusionPost
  /** Resumen del envío leído de difusion_envios (null si el post aún no se envió). */
  envioResumen?: EnvioResumen | null
}

function EstadoBadge({ estado }: { estado: DifusionEstado }) {
  switch (estado) {
    case 'borrador':
      return <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" /> Borrador</Badge>
    case 'listo':
      return <Badge variant="default" className="gap-1 bg-blue-600 hover:bg-blue-700"><CheckCircle2 className="w-3 h-3" /> Listo para enviar</Badge>
    case 'enviado':
      return <Badge variant="default" className="gap-1 bg-emerald-600 hover:bg-emerald-700"><Megaphone className="w-3 h-3" /> Enviado</Badge>
    case 'archivado':
      return <Badge variant="outline" className="gap-1"><Archive className="w-3 h-3" /> Archivado</Badge>
    default:
      return null
  }
}

export function DifusionPreview({ post, envioResumen }: DifusionPreviewProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [enviarOpen, setEnviarOpen] = useState(false)

  const tieneFallos = !!envioResumen && envioResumen.fallidos.length > 0

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

  function handleConfigurarEnvio() {
    if (post.estado === 'borrador') {
      toast.info('Primero cambiá el estado a "Listo para enviar" antes de configurar el envío.')
      return
    }
    if (post.estado === 'enviado') {
      toast.info('Este comunicado ya fue enviado.')
      return
    }
    // Estado "listo" → abrir el modal de selección de destinatarios.
    setEnviarOpen(true)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={post.titulo}
        description="Vista previa del comunicado"
        backHref="/difusion"
      >
        {/* Eliminar */}
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
                Esta acción no se puede deshacer. El comunicado <strong>&quot;{post.titulo}&quot;</strong> será eliminado permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={isDeleting}
                className="bg-destructive hover:bg-destructive/90"
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Editar — solo si no fue enviado */}
        {post.estado !== 'enviado' && (
          <Link href={`/difusion/${post.id}/editar`}>
            <Button variant="outline" className="gap-2">
              <Edit className="h-4 w-4" />
              Editar
            </Button>
          </Link>
        )}

        {/* Configurar Envío */}
        <Button
          onClick={handleConfigurarEnvio}
          disabled={post.estado === 'enviado'}
          className="gap-2 shadow-md"
        >
          <Send className="h-4 w-4" />
          {post.estado === 'enviado' ? 'Ya enviado' : 'Configurar Envío'}
        </Button>
      </PageHeader>

      {/* Tarjeta de Resumen */}
      <div className="bg-card border border-border/60 rounded-xl shadow-sm p-4 sm:p-6 flex flex-col sm:flex-row gap-6 justify-between items-start">
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <EstadoBadge estado={post.estado} />
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Actualizado el {formatFecha(post.updated_at)}
            </span>
          </div>
          <h2 className="text-xl font-bold text-foreground">{post.titulo}</h2>
        </div>

        <div className="bg-muted/50 rounded-lg p-3 shrink-0 min-w-[200px]">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Canal de envío</p>
          <div className="flex items-center gap-2 text-sm font-medium">
            {post.canal === 'whatsapp'
              ? <MessageCircle className="h-4 w-4 text-green-600" />
              : <Mail className="h-4 w-4 text-blue-600" />}
            {DIFUSION_CANAL_LABELS[post.canal]}
          </div>
        </div>
      </div>

      {/* Resumen del envío (solo si ya se envió y hay envíos registrados) */}
      {envioResumen && (
        <div className="space-y-3">
          {/* Línea de resumen */}
          <div
            className={cn(
              'flex items-start gap-3 rounded-xl border p-4',
              tieneFallos
                ? 'border-amber-500/30 bg-amber-500/10'
                : 'border-emerald-500/30 bg-emerald-500/10',
            )}
          >
            {tieneFallos ? (
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            ) : (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {tieneFallos ? 'Envío parcial' : 'Envío completo'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Enviado a {envioResumen.total} destinatario{envioResumen.total !== 1 ? 's' : ''}
                {' · '}
                {envioResumen.ok} recibido{envioResumen.ok !== 1 ? 's' : ''}
                {envioResumen.fallidos.length > 0 && ` · ${envioResumen.fallidos.length} fallaron`}
              </p>
            </div>
          </div>

          {/* Lista de fallidos (a quién no le llegó, con el motivo) */}
          {tieneFallos && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
              <p className="text-sm font-semibold text-destructive flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4" />
                No le llegó a {envioResumen.fallidos.length} destinatario{envioResumen.fallidos.length !== 1 ? 's' : ''}
              </p>
              <ul className="max-h-56 overflow-y-auto divide-y divide-destructive/10 text-xs">
                {envioResumen.fallidos.map((f, i) => (
                  <li key={f.paciente_id ?? `${f.email}-${i}`} className="py-1.5">
                    <span className="font-medium text-foreground">
                      {f.nombre ?? f.email ?? 'Destinatario'}
                    </span>
                    {f.nombre && f.email && (
                      <span className="text-muted-foreground"> · {f.email}</span>
                    )}
                    <span className="text-destructive/80"> — {f.error ?? 'Error desconocido'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Aviso borrador */}
      {post.estado === 'borrador' && (
        <div className="flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm text-blue-700 dark:text-blue-400">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p>
            Este comunicado es un borrador. Editalo y cambiá su estado a <strong>&quot;Listo para enviar&quot;</strong> para poder enviarlo.
          </p>
        </div>
      )}

      {/* Visor de Documento (Simulación de Email/Mensaje) */}
      <div className="bg-white border border-border/60 rounded-xl shadow-lg overflow-hidden">
        {/* Header simulado de email */}
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

      {/* Modal de selección de destinatarios (envío por email) */}
      <EnviarModal
        postId={post.id}
        postTitulo={post.titulo}
        open={enviarOpen}
        onOpenChange={setEnviarOpen}
      />
    </div>
  )
}
