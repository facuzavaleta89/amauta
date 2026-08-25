'use client'

import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, CalendarPlus, Trash2, FileText } from 'lucide-react'
import { CATEGORIA_STYLES, CATEGORIAS } from '@/constants/turno-categorias'
import { toast } from 'sonner'
import { TurnoFormData, turnoSchema } from '@/lib/validations/turno.schema'
import { formatParaInputAR, parseFechaHoraAR } from '@/lib/utils/format-date'
import { usePermisos } from '@/contexts/permisos-context'
import type { PacienteBusqueda, TurnoConPaciente } from '@/types'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
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
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

// ── Etiquetas de los estados del turno ───────────────────────
// ⚠ Los estados NO llevan color en el selector, y es una DECISIÓN: se distinguen
// por su etiqueta. Este mapa tenía además un campo `className` con un color por
// estado que NUNCA llegaba al DOM —el <span> que debía consumirlo usaba un
// template literal sin interpolación—, así que los siete colores eran código
// muerto: se eliminaron. Si alguna vez se decide colorearlos, hay que resolver
// antes que `presente` y `reprogramado` quedaban visualmente pegados (los dos
// terminaban en el salvia de marca).
// ⚠ ESTADO ≠ CATEGORÍA: el estado es el ciclo de vida del turno (pendiente →
// confirmado → presente/ausente); la categoría es el tipo de evento y sí tiene
// su propio sistema de color (ver CATEGORIA_STYLES más abajo).
const ESTADO_LABELS: Record<string, string> = {
  pendiente:           'Pendiente',
  confirmado:          'Confirmado',
  presente:            'Presente',
  ausente:             'Ausente',
  cancelado:           'Cancelado',
  reprogramado:        'Reprogramado',
  pendiente_confirmar: 'Pendiente de confirmar',
}

interface TurnoFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDates: { start: string, end: string } | null
  initialData?: TurnoConPaciente // RAW event data
  onSaved: () => void
  onSwitchToBlock: () => void
}

export function TurnoFormModal({ open, onOpenChange, initialDates, initialData, onSaved, onSwitchToBlock }: TurnoFormModalProps) {
  const [isLoading, setIsLoading] = useState(false)

  // Solo UX: sin el permiso, el atajo a la historia clínica se muestra apagado en vez
  // de rebotar contra /sin-acceso. La protección real es server-side y no cambia.
  const { tienePermiso } = usePermisos()
  const puedeVerHistoria = tienePermiso('ver_historia_clinica')

  const form = useForm<TurnoFormData>({
    resolver: zodResolver(turnoSchema),
    defaultValues: {
      paciente_id: undefined,
      paciente_nombre_libre: '',
      fecha_inicio: initialDates ? formatParaInputAR(initialDates.start) : '',
      fecha_fin: initialDates ? formatParaInputAR(initialDates.end) : '',
      motivo: '',
      notas: '',
      estado: 'pendiente',
      categoria: 'turno_medico',
      origen: 'manual',
      consulta_id: undefined
    }
  })

  const [searchTerm, setSearchTerm] = useState('')
  const [pacientes, setPacientes] = useState<PacienteBusqueda[]>([])
  const [searching, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Watch categoria to drive conditional fields
  const categoriaActual = form.watch('categoria')
  const esTurnoMedico = categoriaActual === 'turno_medico'

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    // `cancelled` cubre lo que `clearTimeout` NO puede: ese solo cancela el timeout
    // pendiente, pero si el usuario sigue tecleando mientras un fetch YA salió, esa
    // respuesta (o su error) llegaría igual y pisaría el resultado de una búsqueda más
    // nueva — o dispararía un toast por un tecleo que el usuario ya abandonó. Mismo
    // patrón que el efecto de `changeView` en `calendar-view.tsx`.
    let cancelled = false

    const delayDebounceFn = setTimeout(async () => {
      if (searchTerm.trim().length >= 3) {
        setSearching(true)
        try {
          const res = await fetch(`/api/pacientes?q=${encodeURIComponent(searchTerm)}`)
          if (!res.ok) {
            const errorData = await res.json()
            throw new Error(errorData.error || 'No se pudo buscar pacientes')
          }
          const data = await res.json()
          if (cancelled) return
          setPacientes(data.data || [])
          setShowDropdown(true)
        } catch (e) {
          if (cancelled) return
          // ⚠ Una búsqueda que FALLA no es una búsqueda SIN RESULTADOS. Antes las dos
          // terminaban igual —lista vacía y dropdown abierto—, así que un 403 por
          // permisos o un 429 por rate limit se leían como "no existe ese paciente".
          // Cerrar el dropdown evita esa lectura falsa; el aviso dice qué pasó de verdad.
          setPacientes([])
          setShowDropdown(false)
          const description = e instanceof Error ? e.message : 'Error inesperado'
          // ⚠ `id` fijo para NO apilar avisos: el efecto corre con debounce en cada
          // tecleo, así que con la API caída habría un toast por letra. Con un id
          // repetido, Sonner REEMPLAZA el que ya está abierto en vez de sumar otro.
          toast.error('Error al buscar pacientes', { description, id: 'busqueda-pacientes' })
        } finally {
          if (!cancelled) setSearching(false)
        }
      } else {
        setPacientes([])
        setShowDropdown(false)
      }
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(delayDebounceFn)
    }
  }, [searchTerm])

  // On open/close: reset form and clear search state
  React.useEffect(() => {
    if (open) {
      if (initialData) {
        form.reset({
          paciente_id: initialData.paciente_id,
          paciente_nombre_libre: initialData.paciente_nombre_libre || '',
          fecha_inicio: formatParaInputAR(initialData.fecha_inicio),
          fecha_fin: formatParaInputAR(initialData.fecha_fin),
          motivo: initialData.motivo || '',
          notas: initialData.notas || '',
          estado: initialData.estado || 'pendiente',
          categoria: initialData.categoria || 'turno_medico',
          origen: initialData.origen || 'manual',
          consulta_id: initialData.consulta_id || undefined
        })
        // Pre-fill search term con las DOS fuentes posibles del nombre del paciente:
        // los turnos creados desde el formulario guardan `paciente_nombre_libre`, pero los
        // creados desde la HC (`origen: 'desde_hc'`) se insertan con `paciente_id` y SIN ese
        // campo — su nombre solo llega por el join `paciente` de GET /api/turnero. Leer solo
        // el primero dejaba el buscador vacío al editarlos.
        setSearchTerm(initialData.paciente_nombre_libre ?? initialData.paciente?.nombre_completo ?? '')
      } else if (initialDates) {
        form.reset({
          paciente_id: undefined,
          paciente_nombre_libre: '',
          fecha_inicio: formatParaInputAR(initialDates.start),
          fecha_fin: formatParaInputAR(initialDates.end),
          motivo: '',
          notas: '',
          estado: 'pendiente',
          categoria: 'turno_medico',
          origen: 'manual',
          consulta_id: undefined
        })
      }
    } else {
      // Cleanup search state when closing
      setSearchTerm('')
      setPacientes([])
      setShowDropdown(false)
    }
  }, [initialDates, initialData, open, form])

  // When category changes away from turno_medico, clear patient fields
  useEffect(() => {
    if (!esTurnoMedico) {
      form.setValue('paciente_id', undefined)
      form.setValue('paciente_nombre_libre', '')
      setSearchTerm('')
      setPacientes([])
      setShowDropdown(false)
    }
  }, [esTurnoMedico, form])

  async function onDelete() {
    if (!initialData) return
    setIsLoading(true)
    try {
      const response = await fetch(`/api/turnero/${initialData.id}`, { method: 'DELETE' })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Error al eliminar')
      }
      toast.success('Turno eliminado')
      onSaved()
      onOpenChange(false)
    } catch (e) {
      const description = e instanceof Error ? e.message : 'Error inesperado'
      toast.error('Error al eliminar', { description })
    } finally {
      setIsLoading(false)
    }
  }

  async function onSubmit(data: TurnoFormData) {
    setIsLoading(true)
    try {
      const payload = {
        ...data,
        fecha_inicio: parseFechaHoraAR(data.fecha_inicio).toISOString(),
        fecha_fin: parseFechaHoraAR(data.fecha_fin).toISOString()
      }

      const method = initialData ? 'PATCH' : 'POST'
      const url = initialData ? `/api/turnero/${initialData.id}` : '/api/turnero'
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error al guardar')
      }

      toast.success(initialData ? 'Turno actualizado' : 'Turno agendado correctamente')
      form.reset()
      onSaved()
      onOpenChange(false)
    } catch (error) {
      const description = error instanceof Error ? error.message : 'Error inesperado'
      toast.error('Error al guardar turno', { description })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <CalendarPlus className="h-4 w-4 text-primary" />
            </div>
            <div>
              <DialogTitle>{initialData ? 'Editar Evento' : 'Nuevo Evento'}</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                {initialData
                  ? 'Modificá los detalles del evento.'
                  : 'Completá los datos del evento.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {!initialData && (
          <div className="flex justify-start -mt-1">
            <Button type="button" variant="link" className="px-0 h-auto text-xs text-muted-foreground" onClick={onSwitchToBlock}>
              ¿Necesitás bloquear este horario?
            </Button>
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

            {/* ── Categoría ──────────────────────────────── */}
            <FormField
              control={form.control}
              name="categoria"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de evento</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccioná una categoría" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CATEGORIAS.map((value) => {
                        const config = CATEGORIA_STYLES[value]
                        const Icon = config.icon
                        return (
                          <SelectItem key={value} value={value}>
                            <span className="flex items-center gap-2">
                              {/* El color sale de la MISMA variable CSS que pinta
                                  el evento en el calendario (globals.css →
                                  `--categoria-*`), no de una clase de Tailwind
                                  que replique el valor. */}
                              <Icon
                                className="w-3.5 h-3.5"
                                style={{ color: `var(${config.varColor})` }}
                              />
                              <span>{config.label}</span>
                            </span>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ── Paciente (solo turno_medico) ───────────────────── */}
            {esTurnoMedico && (
              <FormField
                control={form.control}
                name="paciente_nombre_libre"
                render={({ field }) => (
                  <FormItem className="relative" ref={wrapperRef}>
                    <div className="flex items-center justify-between">
                      <FormLabel>Paciente <span className="text-destructive-strong">*</span></FormLabel>
                      {initialData?.paciente_id && (
                        puedeVerHistoria ? (
                          <Link
                            href={`/pacientes/${initialData.paciente_id}/historia`}
                            className="text-xs text-primary hover:underline font-medium flex items-center gap-1"
                            target="_blank"
                          >
                            <FileText className="h-3 w-3" />
                            Ver historia clínica
                          </Link>
                        ) : (
                          /* Sin permiso: mismo texto, apagado y sin navegación.
                             ⚠ Acá NO se usa <Button disabled> como en los otros sitios: este
                             atajo es un LINK DE TEXTO dentro de la fila del label, y meterle un
                             botón rompería el bloque. El equivalente visual de "deshabilitado"
                             para un link de texto es texto muted sin hover ni underline. */
                          <span
                            aria-disabled="true"
                            className="text-xs text-muted-foreground/50 font-medium flex items-center gap-1 cursor-not-allowed select-none"
                          >
                            <FileText className="h-3 w-3" />
                            Ver historia clínica
                          </span>
                        )
                      )}
                    </div>
                    <FormControl>
                      <Input
                        placeholder="Buscar por nombre..."
                        {...field}
                        value={field.value || ''}
                        onChange={(e) => {
                            field.onChange(e)
                            form.setValue('paciente_id', undefined)
                            setSearchTerm(e.target.value)
                        }}
                        onFocus={() => { if(pacientes.length > 0 || searchTerm.trim().length >= 3) setShowDropdown(true) }}
                      />
                    </FormControl>
                    {showDropdown && (
                      <div className="absolute top-[4.2rem] left-0 w-full bg-popover text-popover-foreground border rounded-lg shadow-lg z-50 max-h-56 overflow-y-auto">
                        {searching ? (
                          <div className="p-3 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/> Buscando...</div>
                        ) : pacientes.length > 0 ? (
                          <ul className="py-1">
                            {pacientes.map(p => (
                              <li
                                key={p.id}
                                className="px-3 py-2 text-sm hover:bg-muted cursor-pointer flex justify-between items-center"
                                onClick={() => {
                                  form.setValue('paciente_id', p.id)
                                  form.setValue('paciente_nombre_libre', p.nombre_completo)
                                  form.clearErrors('paciente_id')
                                  form.clearErrors('paciente_nombre_libre')
                                  setSearchTerm('')
                                  setShowDropdown(false)
                                }}
                              >
                                <span className="font-medium">{p.nombre_completo}</span>
                                <span className="text-xs text-muted-foreground">DNI: {p.dni || 'S/N'}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="p-3 text-sm text-muted-foreground">
                            No se encontraron pacientes.
                          </div>
                        )}
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* ── Fechas ─────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="fecha_inicio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Inicio</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" step={600} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fecha_fin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fin</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" step={600} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* ── Motivo / Título ──────────────────────────────────── */}
            <FormField
              control={form.control}
              name="motivo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {esTurnoMedico
                      ? <>Motivo de consulta <span className="text-muted-foreground font-normal">(opcional)</span></>
                      : <>Título / descripción <span className="text-destructive-strong">*</span></>
                    }
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={esTurnoMedico
                        ? 'Control general, guardia, seguimiento...'
                        : 'Ej: Congreso de cardiología, Reunión administrativa...'
                      }
                      {...field}
                      value={field.value || ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ── Estado (solo edición) ────────────────────────────── */}
            {initialData && (
              <FormField
                control={form.control}
                name="estado"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccioná un estado" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(ESTADO_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                              {label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="notas"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas internas <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                  <FormControl>
                    <Textarea placeholder="Observaciones para el médico..." className="resize-none" rows={2} {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-4 border-t flex justify-between w-full sm:justify-between items-center gap-2">
              {initialData ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="destructive" size="sm" disabled={isLoading} className="gap-1.5">
                      <Trash2 className="w-3.5 h-3.5" />
                      Eliminar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Eliminar este turno?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta acción no se puede deshacer. El turno será eliminado permanentemente de la agenda.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:text-destructive-foreground"
                        onClick={onDelete}
                      >
                        Sí, eliminar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <div />
              )}
              <div className="flex gap-2">
                <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isLoading} className="min-w-32">
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (initialData ? 'Guardar Cambios' : 'Guardar Evento')}
                </Button>
              </div>
            </DialogFooter>

          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
