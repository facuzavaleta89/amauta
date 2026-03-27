'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { pacienteSchema, type PacienteFormValues } from '@/lib/validations/paciente.schema'
import type { ObraSocial, Paciente } from '@/types/paciente'

interface PatientFormProps {
  initialData?: Paciente | null
  obrasSociales: ObraSocial[]
}

export function PatientForm({ initialData, obrasSociales }: PatientFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const defaultValues: Partial<PacienteFormValues> = initialData
    ? {
        ...initialData,
        obra_social_id: initialData.obra_social_id ?? undefined,
        telefono: initialData.telefono ?? '',
        email: initialData.email ?? '',
        provincia: initialData.provincia ?? '',
        ciudad: initialData.ciudad ?? '',
        obra_social_otro: initialData.obra_social_otro ?? '',
        numero_afiliado: initialData.numero_afiliado ?? '',
      }
    : {
        dni: '',
        nombre_completo: '',
        fecha_nacimiento: '',
        sexo: 'femenino',
        obra_social_id: undefined,
      }

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<PacienteFormValues>({
    resolver: zodResolver(pacienteSchema),
    defaultValues,
  })

  async function onSubmit(data: PacienteFormValues) {
    setIsSubmitting(true)
    try {
      const url = initialData ? `/api/pacientes/${initialData.id}` : '/api/pacientes'
      const method = initialData ? 'PATCH' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Error al guardar el paciente')
      }

      toast.success(initialData ? 'Paciente actualizado' : 'Paciente registrado')
      router.push(`/pacientes/${result.data.id}`)
      router.refresh()
    } catch (error: unknown) {
      if (error instanceof Error) {
         toast.error(error.message || 'Ocurrió un error inesperado')
      } else {
         toast.error('Ocurrió un error inesperado')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Datos Personales</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Nombre */}
            <div className="space-y-2">
              <Label htmlFor="nombre_completo">Nombre y apellido *</Label>
              <Input
                id="nombre_completo"
                {...register('nombre_completo')}
                className={errors.nombre_completo ? 'border-destructive' : ''}
              />
              {errors.nombre_completo && (
                <p className="text-xs text-destructive">{errors.nombre_completo.message}</p>
              )}
            </div>

            {/* DNI */}
            <div className="space-y-2">
              <Label htmlFor="dni">DNI *</Label>
              <Input
                id="dni"
                {...register('dni')}
                className={errors.dni ? 'border-destructive' : ''}
              />
              {errors.dni && (
                <p className="text-xs text-destructive">{errors.dni.message}</p>
              )}
            </div>

            {/* Fecha Nac */}
            <div className="space-y-2">
              <Label htmlFor="fecha_nacimiento">Fecha de nacimiento *</Label>
              <Input
                id="fecha_nacimiento"
                type="date"
                {...register('fecha_nacimiento')}
                className={errors.fecha_nacimiento ? 'border-destructive' : ''}
              />
              {errors.fecha_nacimiento && (
                <p className="text-xs text-destructive">{errors.fecha_nacimiento.message}</p>
              )}
            </div>

            {/* Sexo */}
            <div className="space-y-2">
              <Label htmlFor="sexo">Sexo *</Label>
              <Controller
                name="sexo"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value || ""}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger id="sexo" className={errors.sexo ? 'border-destructive' : ''}>
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="femenino">Femenino</SelectItem>
                      <SelectItem value="masculino">Masculino</SelectItem>
                      <SelectItem value="otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.sexo && (
                <p className="text-xs text-destructive">{errors.sexo.message}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Contacto y Residencia</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="telefono">Teléfono</Label>
              <Input id="telefono" {...register('telefono')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register('email')} />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="provincia">Provincia</Label>
              <Input id="provincia" {...register('provincia')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ciudad">Ciudad</Label>
              <Input id="ciudad" {...register('ciudad')} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Obra Social</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="obra_social_id">Obra Social</Label>
              <Controller
                name="obra_social_id"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value ? field.value.toString() : ""}
                    onValueChange={(val) => field.onChange(val === "" ? undefined : Number(val))}
                  >
                    <SelectTrigger id="obra_social_id">
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {obrasSociales.map((os) => (
                        <SelectItem key={os.id} value={os.id.toString()}>
                          {os.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="numero_afiliado">Número de Afiliado</Label>
              <Input id="numero_afiliado" {...register('numero_afiliado')} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="obra_social_otro">Otra (si no está en la lista)</Label>
              <Input id="obra_social_otro" {...register('obra_social_otro')} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting} className="min-w-[120px]">
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : null}
          {initialData ? 'Guardar Cambios' : 'Registrar'}
        </Button>
      </div>
    </form>
  )
}
