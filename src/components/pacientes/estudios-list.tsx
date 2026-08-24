'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileText,
  Image as ImageIcon,
  Download,
  Eye,
  Trash2,
  Loader2,
  FolderOpen,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Estudio } from '@/types'

interface EstudiosListProps {
  estudios: Estudio[]
  esMedico: boolean
  archivado: boolean
}

function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isImage(mime: string | null): boolean {
  return !!mime && mime.startsWith('image/')
}

function isPdf(mime: string | null): boolean {
  return mime === 'application/pdf'
}

// URLs del proxy (opción b): nunca exponen la URL de Storage.
function fileUrl(id: string, disposition: 'inline' | 'attachment'): string {
  return `/api/estudios/${id}?disposition=${disposition}`
}

export function EstudiosList({ estudios, esMedico, archivado }: EstudiosListProps) {
  const router = useRouter()
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [preview, setPreview] = useState<Estudio | null>(null)

  // Descarga real: fetch → blob → <a download> → click → revoke. No navega ni
  // expone la URL de Storage (mismo patrón que descargarPdf del proyecto).
  async function descargarEstudio(estudio: Estudio) {
    setDownloadingId(estudio.id)
    try {
      const res = await fetch(fileUrl(estudio.id, 'attachment'))
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'No se pudo descargar el estudio')
      }
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = estudio.file_name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)
    } catch (error: unknown) {
      toast.error((error as Error).message || 'No se pudo descargar el estudio')
    } finally {
      setDownloadingId(null)
    }
  }

  async function eliminarEstudio(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/estudios/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || 'No se pudo eliminar el estudio')
      }
      toast.success('Estudio eliminado')
      router.refresh()
    } catch (error: unknown) {
      toast.error((error as Error).message || 'No se pudo eliminar el estudio')
      setDeletingId(null)
    }
  }

  if (estudios.length === 0) {
    return (
      <Card className="border-dashed border-border/60">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <FolderOpen className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground">Sin estudios cargados</p>
          <p className="text-sm text-muted-foreground mt-1">
            Todavía no se subió ningún estudio complementario para este paciente.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <ul className="space-y-3">
        {estudios.map((estudio) => {
          const Icon = isImage(estudio.mime_type) ? ImageIcon : FileText
          const fecha = estudio.fecha_estudio
            ? format(new Date(estudio.fecha_estudio + 'T12:00:00'), "d 'de' MMM yyyy", { locale: es })
            : null

          return (
            <li key={estudio.id}>
              <Card className="border-border/60 shadow-sm">
                <CardContent className="flex items-center gap-4 py-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">{estudio.nombre}</p>
                      {estudio.tipo && (
                        <Badge variant="outline" className="text-xs">{estudio.tipo}</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {[fecha, estudio.file_name, formatFileSize(estudio.file_size)]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {estudio.descripcion && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/90">{estudio.descripcion}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {/* Ver: previsualiza sin descargar */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setPreview(estudio)}
                      aria-label="Ver estudio"
                      title="Ver"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>

                    {/* Descargar */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => descargarEstudio(estudio)}
                      disabled={downloadingId === estudio.id}
                      aria-label="Descargar estudio"
                      title="Descargar"
                    >
                      {downloadingId === estudio.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>

                    {esMedico && !archivado && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive-strong hover:bg-destructive/10 hover:text-destructive-strong"
                            aria-label="Eliminar estudio"
                            title="Eliminar"
                            disabled={deletingId === estudio.id}
                          >
                            {deletingId === estudio.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2 text-destructive-strong">
                              <AlertTriangle className="h-5 w-5" />
                              ¿Eliminar estudio?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Se eliminará <strong>{estudio.nombre}</strong> y su archivo de forma
                              permanente. Esta acción no se puede deshacer.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => eliminarEstudio(estudio.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Eliminar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          )
        })}
      </ul>

      {/* Modal de previsualización */}
      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-6">{preview?.nombre}</DialogTitle>
          </DialogHeader>

          {preview && (
            <div className="space-y-3">
              {isImage(preview.mime_type) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={fileUrl(preview.id, 'inline')}
                  alt={preview.nombre}
                  className="mx-auto max-h-[70vh] w-auto rounded-md object-contain"
                />
              ) : isPdf(preview.mime_type) ? (
                <>
                  <iframe
                    src={fileUrl(preview.id, 'inline')}
                    title={preview.nombre}
                    className="h-[70vh] w-full rounded-md border border-border/60"
                  />
                  <p className="text-xs text-muted-foreground">
                    ¿No se ve el PDF (frecuente en móvil)? Abrilo en una pestaña nueva o descargalo.
                  </p>
                </>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Este tipo de archivo no se puede previsualizar. Descargalo para verlo.
                </p>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                {isPdf(preview.mime_type) && (
                  <Button variant="outline" className="gap-2" asChild>
                    <a href={fileUrl(preview.id, 'inline')} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      Abrir en pestaña nueva
                    </a>
                  </Button>
                )}
                <Button
                  className="gap-2"
                  onClick={() => descargarEstudio(preview)}
                  disabled={downloadingId === preview.id}
                >
                  {downloadingId === preview.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Descargar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
