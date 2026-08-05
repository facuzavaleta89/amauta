'use client'

import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, CalendarPlus, Trash2, FileText, Stethoscope, GraduationCap, User, Clipboard, Bell } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { TurnoFormData, turnoSchema } from '@/lib/validations/turno.schema'
import { reformatDateForInput } from '@/lib/utils/fecha-input'
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

// ── Configuración visual de estados ──────────────────────────
const ESTADO_CONFIG: Record<string, { label: string; className: string }> = {
  pendiente:            { label: 'Pendiente',             className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  confirmado:           { label: 'Confirmado',            className: 'bg-blue-100 text-blue-800 border-blue-200' },
  presente:             { label: 'Presente',              className: 'bg-green-100 text-green-800 border-green-200' },
  ausente:              { label: 'Ausente',               className: 'bg-red-100 text-red-800 border-red-200' },
  cancelado:            { label: 'Cancelado',             className: 'bg-gray-100 text-gray-600 border-gray-200' },
  reprogramado:         { label: 'Reprogramado',          className: 'bg-purple-100 text-purple-800 border-purple-200' },
  pendiente_confirmar:  { label: 'Pendiente de confirmar', className: 'bg-orange-100 text-orange-800 border-orange-200' },
}

// ── Configuración de categorías ─────────────────────────────
const CATEGORIA_CONFIG: Record<string, { label: string; icon: LucideIcon }> = {
  turno_medico:    { label: 'Turno médico',   icon: Stethoscope },
  curso:           { label: 'Curso',          icon: GraduationCap },
  personal:        { label: 'Personal',       icon: User },
  administrativo:  { label: 'Administrativo', icon: Clipboard },
  recordatorio:    { label: 'Recordatorio',   icon: Bell },
}

interface TurnoFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDates: { start: string, end: string } | null
  initialData?: TurnoConPaciente // RAW event data
  onSaved: () => void
  onSwitchToBlock: () => void
}

function formatDateToIsoOutput(localString: string) {
    return new Date(localString).toISOString()
}

export function TurnoFormModal({ open, onOpenChange, initialDates, initialData, onSaved, onSwitchToBlock }: TurnoFormModalProps) {
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<TurnoFormData>({
    resolver: zodResolver(turnoSchema),
    defaultValues: {
      paciente_id: undefined,
      paciente_nombre_libre: '',
      fecha_inicio: initialDates ? reformatDateForInput(initialDates.start) : '',
      fecha_fin: initialDates ? reformatDateForInput(initialDates.end) : '',
      motivo: '',
      notas: '',
      estado: 'pendiente',
      categoria: 'turno_medico',
      origen: 'manual',
      consulta_id: undefined,
      color: undefined
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
    const delayDebounceFn = setTimeout(async () => {
      if (searchTerm.trim().length >= 3) {
        setSearching(true)
        try {
          const res = await fetch(`/api/pacientes?q=${encodeURIComponent(searchTerm)}`)
          const data = await res.json()
          setPacientes(data.data || [])
          setShowDropdown(true)
        } catch (e) {
           console.error(e)
        } finally {
          setSearching(false)
        }
      } else {
        setPacientes([])
        setShowDropdown(false)
      }
    }, 400)

    return () => clearTimeout(delayDebounceFn)
  }, [searchTerm])

  // On open/close: reset form and clear search state
  React.useEffect(() => {
    if (open) {
      if (initialData) {
        form.reset({
          paciente_id: initialData.paciente_id,
          paciente_nombre_libre: initialData.paciente_nombre_libre || '',
          fecha_inicio: reformatDateForInput(initialData.fecha_inicio),
          fecha_fin: reformatDateForInput(initialData.fecha_fin),
          motivo: initialData.motivo || '',
          notas: initialData.notas || '',
          estado: initialData.estado || 'pendiente',
          categoria: initialData.categoria || 'turno_medico',
          origen: initialData.origen || 'manual',
          consulta_id: initialData.consulta_id || undefined,
          color: initialData.color
        })
        // Pre-fill search term if patient name exists
        if (initialData.paciente_nombre_libre) {
          setSearchTerm(initialData.paciente_nombre_libre)
        }
      } else if (initialDates) {
        form.reset({
          paciente_id: undefined,
          paciente_nombre_libre: '',
          fecha_inicio: reformatDateForInput(initialDates.start),
          fecha_fin: reformatDateForInput(initialDates.end),
          motivo: '',
          notas: '',
          estado: 'pendiente',
          categoria: 'turno_medico',
          origen: 'manual',
          consulta_id: undefined,
          color: undefined
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
          fecha_inicio: formatDateToIsoOutput(data.fecha_inicio),
          fecha_fin: formatDateToIsoOutput(data.fecha_fin)
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
        throw new Error(errorData.error)
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
                      {Object.entries(CATEGORIA_CONFIG).map(([value, config]) => {
                        const Icon = config.icon
                        return (
                          <SelectItem key={value} value={value}>
                            <span className="flex items-center gap-2">
                              <Icon className="w-3.5 h-3.5 text-muted-foreground" />
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
                      <FormLabel>Paciente <span className="text-destructive">*</span></FormLabel>
                      {initialData?.paciente_id && (
                        <Link
                          href={`/pacientes/${initialData.paciente_id}/historia`}
                          className="text-xs text-primary hover:underline font-medium flex items-center gap-1"
                          target="_blank"
                        >
                          <FileText className="h-3 w-3" />
                          Ver historia clínica
                        </Link>
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
                      : <>Título / descripción <span className="text-destructive">*</span></>
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
                        {Object.entries(ESTADO_CONFIG).map(([value, config]) => (
                          <SelectItem key={value} value={value}>
                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium`}>
                              {config.label}
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
                        className="bg-destructive text-white hover:bg-destructive/90 hover:text-white"
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
