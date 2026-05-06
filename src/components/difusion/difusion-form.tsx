'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Loader2, Mail, MessageCircle, Save, Settings2, FileText, LayoutTemplate } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import {
  difusionSchema,
  DIFUSION_CANALES,
  DIFUSION_CANAL_LABELS,
  DIFUSION_ESTADOS,
  DIFUSION_ESTADO_LABELS,
  type DifusionFormInput,
  type DifusionEstado,
  type DifusionCanal,
} from '@/lib/validations/difusion.schema'

interface DifusionFormProps {
  initialData?: Partial<DifusionFormInput> & { id?: string }
}

export function DifusionForm({ initialData }: DifusionFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isEditing = !!initialData?.id

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<DifusionFormInput>({
    resolver: zodResolver(difusionSchema),
    defaultValues: {
      titulo: initialData?.titulo ?? '',
      asunto_email: initialData?.asunto_email ?? '',
      contenido: initialData?.contenido ?? '',
      estado: (initialData?.estado as DifusionEstado) ?? 'borrador',
      canal: (initialData?.canal as DifusionCanal) ?? 'email',
    },
  })

  const canalWatch = useWatch({ control, name: 'canal' })
  const esEmail = canalWatch === 'email' || canalWatch === 'ambos'

  async function onSubmit(data: DifusionFormInput) {
    setIsSubmitting(true)
    try {
      const url = isEditing ? `/api/difusion/${initialData.id}` : '/api/difusion'
      const method = isEditing ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al guardar')

      toast.success(isEditing ? 'Comunicado actualizado' : 'Comunicado creado exitosamente')
      router.push(`/difusion/${json.data.id}`)
      router.refresh()
      // Note: we purposely do not set isSubmitting to false here to keep the button disabled during redirect
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error inesperado')
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
      
      {/* Columna Principal: Contenido */}
      <div className="md:col-span-2 space-y-6">
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Redacción del Mensaje
            </CardTitle>
            <CardDescription>Escribí el comunicado que se enviará a los pacientes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Título Interno */}
            <div className="space-y-2">
              <Label htmlFor="titulo">Título Interno *</Label>
              <Input
                id="titulo"
                placeholder="Ej: Campaña Vacunación Antigripal 2024"
                {...register('titulo')}
                className={errors.titulo ? 'border-destructive' : ''}
              />
              <p className="text-xs text-muted-foreground">Este título es solo para que vos identifiques el mensaje.</p>
              {errors.titulo && <p className="text-xs text-destructive">{errors.titulo.message}</p>}
            </div>

            {/* Asunto Email */}
            {esEmail && (
              <div className="space-y-2">
                <Label htmlFor="asunto_email">Asunto del Correo Electrónico *</Label>
                <Input
                  id="asunto_email"
                  placeholder="Ej: Aviso importante: Nueva Campaña de Vacunación"
                  {...register('asunto_email')}
                  className={errors.asunto_email ? 'border-destructive' : ''}
                />
                <p className="text-xs text-muted-foreground">Este es el título que leerán los pacientes en su bandeja de entrada.</p>
                {errors.asunto_email && <p className="text-xs text-destructive">{errors.asunto_email.message}</p>}
              </div>
            )}

            {/* Contenido principal */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="contenido">Contenido *</Label>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <LayoutTemplate className="h-3 w-3" />
                  Soporta formato de texto enriquecido / Markdown
                </div>
              </div>
              <Textarea
                id="contenido"
                placeholder="Estimado/a paciente..."
                className={`min-h-[300px] resize-y leading-relaxed font-serif text-sm ${errors.contenido ? 'border-destructive' : ''}`}
                {...register('contenido')}
              />
              {errors.contenido && <p className="text-xs text-destructive">{errors.contenido.message}</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Columna Lateral: Configuraciones */}
      <div className="space-y-6">
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-primary" />
              Configuración
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Canal */}
            <div className="space-y-2">
              <Label htmlFor="canal" className="flex items-center gap-2">
                {canalWatch === 'whatsapp' ? <MessageCircle className="h-4 w-4 text-green-600" /> : <Mail className="h-4 w-4 text-blue-600" />}
                Canal de Envío
              </Label>
              <Controller
                name="canal"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className={errors.canal ? 'border-destructive' : ''}>
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      {DIFUSION_CANALES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {DIFUSION_CANAL_LABELS[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* Estado */}
            <div className="space-y-2">
              <Label htmlFor="estado">Estado</Label>
              <Controller
                name="estado"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className={errors.estado ? 'border-destructive' : ''}>
                      <SelectValue placeholder="Seleccionar estado" />
                    </SelectTrigger>
                    <SelectContent>
                      {DIFUSION_ESTADOS.map((e) => (
                        <SelectItem key={e} value={e}>
                          {DIFUSION_ESTADO_LABELS[e]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Dejalo en &quot;Borrador&quot; si aún lo estás editando. Pasalo a &quot;Listo para enviar&quot; cuando quieras enviarlo masivamente.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Acciones */}
        <div className="flex flex-col gap-3">
          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full gap-2"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSubmitting ? 'Guardando...' : (isEditing ? 'Actualizar Post' : 'Crear Post')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isSubmitting}
            className="w-full"
          >
            Cancelar
          </Button>
        </div>
      </div>
    </form>
  )
}
