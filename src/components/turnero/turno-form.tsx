'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { TurnoFormData, turnoSchema } from '@/lib/validations/turno.schema'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

interface TurnoFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDates: { start: string, end: string } | null
  initialData?: any // RAW event data
  onSaved: () => void
  onSwitchToBlock: () => void
}

function reformatDateForInput(isoString: string) {
  // ISO to "YYYY-MM-DDThh:mm"
  const date = new Date(isoString)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
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
      color: undefined // relies on CSS variable default
    }
  })

  const [searchTerm, setSearchTerm] = useState('')
  const [pacientes, setPacientes] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

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

  // Whenever initialDates or initialData changes, reset form
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
          color: initialData.color
        })
      } else if (initialDates) {
        form.reset({
          paciente_id: undefined,
          paciente_nombre_libre: '',
          fecha_inicio: reformatDateForInput(initialDates.start),
          fecha_fin: reformatDateForInput(initialDates.end),
          motivo: '',
          notas: '',
          estado: 'pendiente',
          color: undefined
        })
      }
    }
  }, [initialDates, initialData, open, form])

  async function onDelete() {
      if (!initialData) return
      if (!window.confirm('¿Seguro que querés eliminar este turno?')) return
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
      } catch (e: any) {
          toast.error('Error al eliminar', { description: e.message })
      } finally {
          setIsLoading(false)
      }
  }

  async function onSubmit(data: TurnoFormData) {
    setIsLoading(true)
    try {
      // transform local dates back to ISO
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

      toast.success('Turno agendado correctamente')
      form.reset()
      onSaved()
      onOpenChange(false)
    } catch (error: any) {
      toast.error('Error al agendar turno', { description: error.message })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Editar Turno' : 'Agendar Nuevo Turno'}</DialogTitle>
          <DialogDescription>
            {initialData ? 'Modificá los detalles del turno.' : 'Completá los datos del turno. Podés asignar un paciente o usar un nombre libre.'}
          </DialogDescription>
        </DialogHeader>

        {!initialData && (
          <div className="flex justify-start mb-2">
             <Button type="button" variant="link" className="px-0 h-auto text-sm text-muted-foreground" onClick={onSwitchToBlock}>
               ¿Necesitás bloquear este horario?
             </Button>
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            
            <FormField
              control={form.control}
              name="paciente_nombre_libre"
              render={({ field }) => (
                <FormItem className="relative" ref={wrapperRef}>
                  <FormLabel>Nombre del Paciente (Buscar o Texto Libre)</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Ej. Juan Pérez" 
                      {...field} 
                      value={field.value || ''}
                      onChange={(e) => {
                          field.onChange(e)
                          form.setValue('paciente_id', null)
                          setSearchTerm(e.target.value)
                      }}
                      onFocus={() => { if(pacientes.length > 0 || searchTerm.trim().length >= 3) setShowDropdown(true) }}
                    />
                  </FormControl>
                  {showDropdown && (
                    <div className="absolute top-[60px] left-0 w-full bg-popover text-popover-foreground border rounded-md shadow-md z-50 max-h-60 overflow-y-auto">
                       {searching ? (
                          <div className="p-2 text-sm text-muted-foreground flex items-center"><Loader2 className="w-4 h-4 mr-2 animate-spin"/> Buscando...</div>
                       ) : pacientes.length > 0 ? (
                          <ul className="py-1">
                             {pacientes.map(p => (
                               <li 
                                 key={p.id} 
                                 className="px-3 py-2 text-sm hover:bg-muted cursor-pointer flex justify-between items-center"
                                 onClick={() => {
                                    form.setValue('paciente_id', p.id)
                                    form.setValue('paciente_nombre_libre', p.nombre_completo)
                                    form.clearErrors('paciente_nombre_libre')
                                    setSearchTerm('') // stop searching to hide dropdown mostly
                                    setShowDropdown(false)
                                 }}
                               >
                                  <span className="font-medium">{p.nombre_completo}</span>
                                  <span className="text-xs text-muted-foreground">DNI: {p.dni || 'S/N'}</span>
                               </li>
                             ))}
                          </ul>
                       ) : (
                          <div className="p-2 text-sm text-muted-foreground">
                            No se encontraron pacientes. Se agendará como paciente no registrado.
                          </div>
                       )}
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
               <FormField
                  control={form.control}
                  name="fecha_inicio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Inicio</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} />
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
                        <Input type="datetime-local" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
            </div>

            <FormField
              control={form.control}
              name="motivo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo de Consulta (Opcional)</FormLabel>
                  <FormControl>
                     <Input placeholder="Control general..." {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

             <FormField
              control={form.control}
              name="notas"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas internas</FormLabel>
                  <FormControl>
                     <Textarea placeholder="..." className="resize-none" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-4 border-t flex justify-between w-full sm:justify-between items-center">
              {initialData ? (
                 <Button type="button" variant="destructive" onClick={onDelete} disabled={isLoading}>
                    Eliminar
                 </Button>
              ) : (
                <div />
              )}
              <div className="flex gap-2">
                <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isLoading} className="min-w-28">
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (initialData ? 'Guardar Cambios' : 'Confirmar Turno')}
                </Button>
              </div>
            </DialogFooter>

          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
