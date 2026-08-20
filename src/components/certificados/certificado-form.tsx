'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Search, Loader2, User, Calendar, Award,
  CheckCircle2, Info,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

import {
  certificadoSchema,
  type CertificadoFormInput,
} from '@/lib/validations/pedido.schema'
import { resolverObraSocial, SIN_OBRA_SOCIAL_LABEL } from '@/lib/pacientes/obra-social'
import type { PacienteBusqueda } from '@/types'

interface CertificadoFormProps {
  preselectedPacienteId?: string | null
}

export function CertificadoForm({ preselectedPacienteId }: CertificadoFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sugerencias, setSugerencias] = useState<PacienteBusqueda[]>([])
  const [isBuscando, setIsBuscando] = useState(false)
  const [showSugerencias, setShowSugerencias] = useState(false)
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<PacienteBusqueda | null>(null)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<CertificadoFormInput>({
    resolver: zodResolver(certificadoSchema),
    defaultValues: {
      fecha_certificado: new Date().toISOString().slice(0, 10),
      contenido: '',
    },
  })

  // ── Búsqueda de pacientes ──────────────────────────────────

  const buscarPacientes = useCallback(async (q: string) => {
    if (q.length < 2) { setSugerencias([]); return }
    setIsBuscando(true)
    try {
      const res = await fetch(`/api/pacientes?q=${encodeURIComponent(q)}`)
      const json = await res.json()
      setSugerencias(json.data ?? [])
      setShowSugerencias(true)
    } catch {
      toast.error('Error al buscar pacientes')
    } finally {
      setIsBuscando(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => buscarPacientes(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery, buscarPacientes])

  useEffect(() => {
    if (!preselectedPacienteId) return
    ;(async () => {
      const res = await fetch(`/api/pacientes/${preselectedPacienteId}`)
      if (!res.ok) return
      const json = await res.json()
      if (json.data) seleccionarPaciente(json.data)
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedPacienteId])

  const seleccionarPaciente = (p: PacienteBusqueda) => {
    setPacienteSeleccionado(p)
    setValue('paciente_id', p.id)
    setValue('paciente_nombre', p.nombre_completo)
    setValue('paciente_dni', p.dni)
    setValue('paciente_dob', p.fecha_nacimiento)
    // ⚠ Fallback en la ESCRITURA del snapshot: el documento congela el literal en vez de
    // `null`, así que el PDF de un paciente particular imprime "Obra Social: Particular /
    // Sin obra social" en lugar de OMITIR la fila. Los documentos YA EMITIDOS conservan su
    // `null` y siguen omitiéndola — la lectura no lleva fallback, a propósito (regla de
    // negocio 5: el snapshot es inmutable y no se regenera).
    setValue('obra_social_nombre', resolverObraSocial(p) ?? SIN_OBRA_SOCIAL_LABEL)
    setValue('numero_afiliado', p.numero_afiliado ?? null)
    setSearchQuery(p.nombre_completo)
    setShowSugerencias(false)
  }

  // ── Submit ─────────────────────────────────────────────────

  async function onSubmit(data: CertificadoFormInput) {
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/certificados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al guardar')

      toast.success('Certificado creado exitosamente')
      router.push(`/certificados/${json.data.id}`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error inesperado')
      setIsSubmitting(false)
    }
  }

  // Derivada en render: una sola resolución para la tarjeta de resumen.
  const obraSocialElegida = pacienteSeleccionado
    ? resolverObraSocial(pacienteSeleccionado) ?? SIN_OBRA_SOCIAL_LABEL
    : null

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-3xl mx-auto">

      {/* Paciente */}
      <Card className="border-border/60 shadow-sm overflow-visible">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Paciente
          </CardTitle>
          <CardDescription>Buscá al paciente por nombre o DNI</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="buscar-paciente-cert"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setPacienteSeleccionado(null)
                }}
                placeholder="Nombre o DNI del paciente..."
                className="pl-10"
                autoComplete="off"
                onFocus={() => sugerencias.length > 0 && setShowSugerencias(true)}
                onBlur={() => setTimeout(() => setShowSugerencias(false), 200)}
              />
              {isBuscando && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {showSugerencias && sugerencias.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-card border border-border rounded-lg shadow-xl overflow-hidden">
                {sugerencias.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => seleccionarPaciente(p)}
                    className="w-full px-4 py-3 text-left hover:bg-accent transition-colors flex items-center justify-between group"
                  >
                    <div>
                      <p className="font-medium text-sm">{p.nombre_completo}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">DNI: {p.dni}</p>
                    </div>
                    <CheckCircle2 className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {pacienteSeleccionado && (
            <div className="flex flex-wrap gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg animate-fade-in">
              <Badge variant="secondary" className="gap-1.5">
                <User className="h-3 w-3" />
                {pacienteSeleccionado.nombre_completo}
              </Badge>
              <Badge variant="outline" className="gap-1">DNI: {pacienteSeleccionado.dni}</Badge>
              {/* Se muestra SIEMPRE que haya paciente elegido: antes el badge desaparecía
                  para los particulares y la tarjeta parecía incompleta. */}
              {obraSocialElegida && (
                <Badge variant="outline" className="text-xs gap-1">
                  {obraSocialElegida}
                </Badge>
              )}
              {pacienteSeleccionado.numero_afiliado && (
                <Badge variant="outline" className="text-xs gap-1">
                  Afil. {pacienteSeleccionado.numero_afiliado}
                </Badge>
              )}
            </div>
          )}

          {errors.paciente_id && (
            <p className="text-xs text-destructive">{errors.paciente_id.message}</p>
          )}

          <input type="hidden" {...register('paciente_id')} />
          <input type="hidden" {...register('paciente_nombre')} />
          <input type="hidden" {...register('paciente_dni')} />
          <input type="hidden" {...register('paciente_dob')} />
          <input type="hidden" {...register('obra_social_nombre')} />
          <input type="hidden" {...register('numero_afiliado')} />
        </CardContent>
      </Card>

      {/* Contenido */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            Contenido del Certificado *
          </CardTitle>
          <CardDescription>
            Redactá el texto del certificado. Comenzará con &quot;Certifico que...&quot;
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm text-muted-foreground italic">
              &quot;Certifico que...&quot;
            </div>
            <Textarea
              id="contenido"
              placeholder="...el/la Sr./Sra. X se encuentra en condiciones de..."
              className={`min-h-[160px] resize-y ${errors.contenido ? 'border-destructive' : ''}`}
              {...register('contenido')}
            />
            {errors.contenido && (
              <p className="text-xs text-destructive">{errors.contenido.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Fechas */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Fechas
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="fecha_certificado">Fecha del certificado</Label>
            <Controller
              name="fecha_certificado"
              control={control}
              render={({ field }) => (
                <Input
                  id="fecha_certificado"
                  type="date"
                  {...field}
                  value={field.value ?? ''}
                />
              )}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="valido_hasta">
              Válido hasta
              <span className="text-muted-foreground text-xs font-normal ml-1">(opcional)</span>
            </Label>
            <Controller
              name="valido_hasta"
              control={control}
              render={({ field }) => (
                <Input
                  id="valido_hasta"
                  type="date"
                  {...field}
                  value={field.value ?? ''}
                />
              )}
            />
          </div>
        </CardContent>
      </Card>

      {/* Acciones */}
      <div className="flex justify-end gap-3 pb-6">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || !pacienteSeleccionado}
          className="gap-2 min-w-[180px]"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Award className="h-4 w-4" />
          )}
          {isSubmitting ? 'Guardando...' : 'Emitir Certificado'}
        </Button>
      </div>
    </form>
  )
}
