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

import {
  pacienteSchema,
  type PacienteFormValues,
  type PacienteFormInput,
} from '@/lib/validations/paciente.schema'
import type { ObraSocial, Paciente } from '@/types/paciente'

interface PatientFormProps {
  initialData?: Paciente | null
  obrasSociales: ObraSocial[]
}

export function PatientForm({ initialData, obrasSociales }: PatientFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const defaultValues: Partial<PacienteFormInput> = initialData
    ? {
        ...initialData,
        // `null` y no `undefined`: si el usuario NO toca el selector, el campo tiene que
        // viajar igual en el PATCH (ver el comentario de handleObraSocialChange).
        obra_social_id: initialData.obra_social_id ?? null,
        telefono: initialData.telefono ?? '',
        email: initialData.email ?? '',
        provincia: initialData.provincia ?? '',
        ciudad: initialData.ciudad ?? '',
        obra_social_otro: initialData.obra_social_otro ?? null,
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
    setValue,
    formState: { errors },
  } = useForm<PacienteFormInput, unknown, PacienteFormValues>({
    resolver: zodResolver(pacienteSchema),
    defaultValues,
  })

  // Determinar el estado inicial del selector de obra social
  function getInitialObraSocialSelector(): string {
    if (!initialData) return ''
    if (initialData.obra_social_id) return String(initialData.obra_social_id)
    if (initialData.obra_social_otro) return 'otra'
    return 'particular'
  }

  const [obraSocialSelector, setObraSocialSelector] = useState<string>(
    getInitialObraSocialSelector()
  )

  // ⚠ Los campos que se sueltan van en `null` EXPLÍCITO, nunca en `undefined`.
  // `JSON.stringify` (el submit de abajo) DESCARTA las propiedades `undefined`, así que la
  // clave no llegaba al PATCH, no entraba en el UPDATE y la columna conservaba el valor
  // viejo: era imposible sacarle a un paciente la obra social del catálogo. Con `null` la
  // clave viaja, el schema la acepta (es `.nullable()`) y la columna se limpia de verdad.
  //
  // ⚠ El número de afiliado se REINICIA en CUALQUIER cambio de obra social: pertenece a la obra social
  // anterior, así que al cambiarla (incluso entre dos del catálogo) deja de aplicar y no
  // puede quedar colgado. Va en `''` y NO en `null`: a diferencia de los dos campos de
  // obra social, `numero_afiliado` NO es nullable en el schema
  // (`.optional().or(z.literal(''))`), así que un `null` se rechazaría con 400.
  function handleObraSocialChange(value: string) {
    setObraSocialSelector(value)
    setValue('numero_afiliado', '') // se reinicia siempre: el afiliado pertenece a la obra social anterior
    if (value === 'particular') {
      setValue('obra_social_id', null)
      setValue('obra_social_otro', null)
    } else if (value === 'otra') {
      setValue('obra_social_id', null)
      // obra_social_otro se completa manualmente
    } else if (value === '') {
      setValue('obra_social_id', null)
      setValue('obra_social_otro', null)
    } else {
      // OS del catálogo
      setValue('obra_social_id', Number(value))
      setValue('obra_social_otro', null)
    }
  }

  // Derivada en render: el afiliado depende de que el paciente TENGA obra social, no de
  // que esté en el catálogo — con "otra" (texto libre) el número sigue aplicando.
  const sinObraSocial = obraSocialSelector === 'particular' || obraSocialSelector === ''

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
                <p className="text-xs text-destructive-strong">{errors.nombre_completo.message}</p>
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
                <p className="text-xs text-destructive-strong">{errors.dni.message}</p>
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
                <p className="text-xs text-destructive-strong">{errors.fecha_nacimiento.message}</p>
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
                <p className="text-xs text-destructive-strong">{errors.sexo.message}</p>
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
                <p className="text-xs text-destructive-strong">{errors.email.message}</p>
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
            {/* Selector principal */}
            <div className="space-y-2">
              <Label htmlFor="obra_social_selector">Cobertura médica</Label>
              <Select
                value={obraSocialSelector}
                onValueChange={handleObraSocialChange}
              >
                <SelectTrigger id="obra_social_selector">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="particular">Particular / Sin obra social</SelectItem>
                  <SelectItem value="otra">Otra (no está en la lista)</SelectItem>
                  {/* Separador visual antes del catálogo */}
                  <div className="my-1 h-px bg-border" role="separator" />
                  {obrasSociales.map((os) => (
                    <SelectItem key={os.id} value={os.id.toString()}>
                      {os.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Campos sincronizados con RHF (ocultos, controlados por handleObraSocialChange) */}
              <Controller name="obra_social_id" control={control} render={() => <></>} />
            </div>

            {/* Número de afiliado */}
            <div className="space-y-2">
              <Label htmlFor="numero_afiliado">Número de Afiliado</Label>
              <Input
                id="numero_afiliado"
                {...register('numero_afiliado')}
                disabled={sinObraSocial}
              />
            </div>

            {/* Campo de texto libre — solo visible cuando se elige "Otra" */}
            {obraSocialSelector === 'otra' && (
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="obra_social_otro">
                  Nombre de la obra social *
                </Label>
                <Input
                  id="obra_social_otro"
                  placeholder="Ej: Swiss Medical, Galeno, etc."
                  {...register('obra_social_otro')}
                  className={errors.obra_social_otro ? 'border-destructive' : ''}
                  autoFocus
                />
                {errors.obra_social_otro && (
                  <p className="text-xs text-destructive-strong">{errors.obra_social_otro.message}</p>
                )}
              </div>
            )}
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
