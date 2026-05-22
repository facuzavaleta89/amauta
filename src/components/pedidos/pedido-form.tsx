'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Search, Loader2, User, Calendar, FileText,
  Stethoscope, CheckCircle2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

import { pedidoSchema, type PedidoFormValues } from '@/lib/validations/pedido.schema'

interface PacienteSugerido {
  id: string
  nombre_completo: string
  dni: string
  obra_social_id: number | null
  numero_afiliado: string | null
}

interface PedidoFormProps {
  preselectedPacienteId?: string | null
}

export function PedidoForm({ preselectedPacienteId }: PedidoFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sugerencias, setSugerencias] = useState<PacienteSugerido[]>([])
  const [isBuscando, setIsBuscando] = useState(false)
  const [showSugerencias, setShowSugerencias] = useState(false)
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<PacienteSugerido | null>(null)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<PedidoFormValues>({
    resolver: zodResolver(pedidoSchema),
    defaultValues: {
      fecha_pedido: new Date().toISOString().slice(0, 10),
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

  // Preseleccionar paciente desde query param
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

  const seleccionarPaciente = (p: {
    id: string
    nombre_completo: string
    dni: string
    fecha_nacimiento: string
    obra_social_id?: number | null
    numero_afiliado?: string | null
    obras_sociales?: { nombre: string } | null
  }) => {
    setPacienteSeleccionado({
      id: p.id,
      nombre_completo: p.nombre_completo,
      dni: p.dni,
      obra_social_id: p.obra_social_id ?? null,
      numero_afiliado: p.numero_afiliado ?? null,
    })
    setValue('paciente_id', p.id)
    setValue('paciente_nombre', p.nombre_completo)
    setValue('paciente_dni', p.dni)
    setValue('paciente_dob', p.fecha_nacimiento)
    setValue('obra_social_nombre', (p as any).obras_sociales?.nombre ?? null)
    setValue('numero_afiliado', p.numero_afiliado ?? null)
    setSearchQuery(p.nombre_completo)
    setShowSugerencias(false)
  }

  // ── Submit ─────────────────────────────────────────────────

  async function onSubmit(data: PedidoFormValues) {
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al guardar')

      toast.success('Pedido creado exitosamente')
      router.push(`/pedidos/${json.data.id}`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error inesperado')
      setIsSubmitting(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-3xl mx-auto">

      {/* Buscador de paciente */}
      <Card className="border-border/60 shadow-sm overflow-visible">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Paciente
          </CardTitle>
          <CardDescription>
            Buscá al paciente por nombre o DNI
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search input */}
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="buscar-paciente"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setPacienteSeleccionado(null)
                }}
                placeholder="Nombre o DNI del paciente..."
                className="pl-10 pr-10"
                autoComplete="off"
                onFocus={() => sugerencias.length > 0 && setShowSugerencias(true)}
                onBlur={() => setTimeout(() => setShowSugerencias(false), 200)}
              />
              {isBuscando && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Dropdown de sugerencias */}
            {showSugerencias && sugerencias.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-card border border-border rounded-lg shadow-xl overflow-hidden">
                {sugerencias.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => seleccionarPaciente(p as any)}
                    className="w-full px-4 py-3 text-left hover:bg-accent transition-colors flex items-center justify-between group"
                  >
                    <div>
                      <p className="font-medium text-sm text-foreground">{p.nombre_completo}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">DNI: {p.dni}</p>
                    </div>
                    <CheckCircle2 className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Datos del paciente seleccionado */}
          {pacienteSeleccionado && (
            <div className="flex flex-wrap gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg animate-fade-in">
              <Badge variant="secondary" className="gap-1.5">
                <User className="h-3 w-3" />
                {pacienteSeleccionado.nombre_completo}
              </Badge>
              <Badge variant="outline" className="gap-1.5">
                DNI: {pacienteSeleccionado.dni}
              </Badge>
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

          {/* Campos ocultos del snapshot */}
          <input type="hidden" {...register('paciente_id')} />
          <input type="hidden" {...register('paciente_nombre')} />
          <input type="hidden" {...register('paciente_dni')} />
          <input type="hidden" {...register('paciente_dob')} />
          <input type="hidden" {...register('obra_social_nombre')} />
          <input type="hidden" {...register('numero_afiliado')} />
        </CardContent>
      </Card>

      {/* Contenido clínico */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-primary" />
            Datos del Pedido
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Diagnóstico */}
          <div className="space-y-2">
            <Label htmlFor="diagnostico">
              Diagnóstico / Motivo *
            </Label>
            <Input
              id="diagnostico"
              placeholder="Ej: DM2 — HTA — Obesidad grado I"
              {...register('diagnostico')}
              className={errors.diagnostico ? 'border-destructive' : ''}
            />
            {errors.diagnostico && (
              <p className="text-xs text-destructive">{errors.diagnostico.message}</p>
            )}
          </div>

          {/* Estudios pedidos */}
          <div className="space-y-2">
            <Label htmlFor="estudios_pedidos">
              Estudios Solicitados *
            </Label>
            <Textarea
              id="estudios_pedidos"
              placeholder={
                'Ej:\n- Laboratorio: hemograma, glucemia, HbA1c, perfil lipídico, función renal\n- Ecocardiograma doppler\n- Holter de ritmo 24hs'
              }
              className={`min-h-[130px] resize-y font-mono text-[0.85rem] ${errors.estudios_pedidos ? 'border-destructive' : ''}`}
              {...register('estudios_pedidos')}
            />
            {errors.estudios_pedidos && (
              <p className="text-xs text-destructive">{errors.estudios_pedidos.message}</p>
            )}
          </div>

          {/* Indicaciones */}
          <div className="space-y-2">
            <Label htmlFor="indicaciones">
              Indicaciones para el Paciente
              <span className="text-muted-foreground text-xs font-normal ml-1">(opcional)</span>
            </Label>
            <Textarea
              id="indicaciones"
              placeholder="Ej: Concurrir en ayunas de 8hs. Traer resultados en el próximo turno."
              className="resize-y"
              {...register('indicaciones')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Fecha */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Fecha del Pedido
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Controller
            name="fecha_pedido"
            control={control}
            render={({ field }) => (
              <Input
                id="fecha_pedido"
                type="date"
                {...field}
                value={field.value ?? ''}
                className="max-w-xs"
              />
            )}
          />
        </CardContent>
      </Card>

      {/* Acciones */}
      <div className="flex justify-end gap-3 pb-6">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || !pacienteSeleccionado}
          className="gap-2 min-w-[160px]"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
          {isSubmitting ? 'Guardando...' : 'Crear Pedido'}
        </Button>
      </div>
    </form>
  )
}
