'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Loader2, Paperclip, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { validateEstudioFile } from '@/lib/validations/estudio.schema'
import { ESTUDIOS_ALLOWED_MIME_TYPES } from '@/lib/supabase/storage'

interface EstudiosUploadProps {
  pacienteId: string
  archivado: boolean
}

const ACCEPT = ESTUDIOS_ALLOWED_MIME_TYPES.join(',')

export function EstudiosUpload({ pacienteId, archivado }: EstudiosUploadProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState('')
  const [fechaEstudio, setFechaEstudio] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [isUploading, setIsUploading] = useState(false)

  if (archivado) {
    return (
      <Card className="border-border/60 shadow-sm">
        <CardContent className="py-6 text-sm text-muted-foreground">
          El paciente está archivado: no se pueden subir estudios nuevos. Desarchivalo para
          habilitar la carga. Los estudios existentes se pueden ver y descargar.
        </CardContent>
      </Card>
    )
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null
    if (!selected) {
      setFile(null)
      return
    }
    const error = validateEstudioFile({ size: selected.size, type: selected.type })
    if (error) {
      toast.error(error)
      e.target.value = ''
      setFile(null)
      return
    }
    setFile(selected)
    // Prefill del nombre con el del archivo (sin extensión), si está vacío.
    if (!nombre.trim()) {
      const base = selected.name.replace(/\.[^.]+$/, '')
      setNombre(base.slice(0, 200))
    }
  }

  function clearFile() {
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function resetForm() {
    setFile(null)
    setNombre('')
    setTipo('')
    setFechaEstudio('')
    setDescripcion('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) {
      toast.error('Seleccioná un archivo.')
      return
    }
    if (!nombre.trim()) {
      toast.error('El nombre del estudio es requerido.')
      return
    }
    const fileError = validateEstudioFile({ size: file.size, type: file.type })
    if (fileError) {
      toast.error(fileError)
      return
    }

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('paciente_id', pacienteId)
      formData.append('nombre', nombre.trim())
      if (tipo.trim()) formData.append('tipo', tipo.trim())
      if (fechaEstudio) formData.append('fecha_estudio', fechaEstudio)
      if (descripcion.trim()) formData.append('descripcion', descripcion.trim())

      const res = await fetch('/api/estudios', { method: 'POST', body: formData })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || 'No se pudo subir el estudio')
      }
      toast.success('Estudio subido')
      resetForm()
      router.refresh()
    } catch (error: unknown) {
      toast.error((error as Error).message || 'No se pudo subir el estudio')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Subir estudio</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Archivo */}
          <div className="space-y-2">
            <Label htmlFor="estudio-file">Archivo (PDF, JPG, PNG o WebP · máx. 10 MB)</Label>
            {file ? (
              <div className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-sm">
                <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={clearFile}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Quitar archivo"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <Input
                id="estudio-file"
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                onChange={handleFileChange}
                disabled={isUploading}
              />
            )}
          </div>

          {/* Metadatos */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="estudio-nombre">Nombre *</Label>
              <Input
                id="estudio-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                maxLength={200}
                placeholder="Ej: Eco abdominal"
                disabled={isUploading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="estudio-tipo">Tipo</Label>
              <Input
                id="estudio-tipo"
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                maxLength={100}
                placeholder="Ej: Laboratorio, Ecografía, RX"
                disabled={isUploading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="estudio-fecha">Fecha del estudio</Label>
              <Input
                id="estudio-fecha"
                type="date"
                value={fechaEstudio}
                onChange={(e) => setFechaEstudio(e.target.value)}
                disabled={isUploading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="estudio-descripcion">Descripción</Label>
            <Textarea
              id="estudio-descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              maxLength={2000}
              rows={2}
              placeholder="Observación opcional sobre el estudio"
              disabled={isUploading}
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isUploading || !file} className="gap-2">
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {isUploading ? 'Subiendo…' : 'Subir estudio'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
