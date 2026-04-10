'use client'

import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Ban, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { BloqueoFormData, bloqueoAgendaSchema } from '@/lib/validations/turno.schema'

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
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

interface BlockSlotModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDates: { start: string, end: string } | null
  initialData?: any // RAW event data
  onSaved: () => void
}

function reformatDateForInput(isoString: string) {
  const date = new Date(isoString)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function formatDateToIsoOutput(localString: string) {
    return new Date(localString).toISOString()
}

export function BlockSlotModal({ open, onOpenChange, initialDates, initialData, onSaved }: BlockSlotModalProps) {
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<BloqueoFormData>({
    resolver: zodResolver(bloqueoAgendaSchema),
    defaultValues: {
      fecha_inicio: initialDates ? reformatDateForInput(initialDates.start) : '',
      fecha_fin: initialDates ? reformatDateForInput(initialDates.end) : '',
      motivo: '',
      es_recurrente: false
    }
  })

  React.useEffect(() => {
    if (open) {
      if (initialData) {
        form.reset({
          fecha_inicio: reformatDateForInput(initialData.fecha_inicio),
          fecha_fin: reformatDateForInput(initialData.fecha_fin),
          motivo: initialData.motivo || '',
          es_recurrente: initialData.es_recurrente || false
        })
      } else if (initialDates) {
        form.reset({
          fecha_inicio: reformatDateForInput(initialDates.start),
          fecha_fin: reformatDateForInput(initialDates.end),
          motivo: '',
          es_recurrente: false
        })
      }
    }
  }, [initialDates, initialData, open, form])

  async function onDelete() {
      if (!initialData) return
      setIsLoading(true)
      try {
          const response = await fetch(`/api/turnero/bloqueos/${initialData.id}`, { method: 'DELETE' })
          if (!response.ok) {
              const err = await response.json()
              throw new Error(err.error || 'Error al eliminar')
          }
          toast.success('Bloqueo eliminado')
          onSaved()
          onOpenChange(false)
      } catch (e: any) {
          toast.error('Error al eliminar', { description: e.message })
      } finally {
          setIsLoading(false)
      }
  }

  async function onSubmit(data: BloqueoFormData) {
    setIsLoading(true)
    try {
      const payload = {
          ...data,
          fecha_inicio: formatDateToIsoOutput(data.fecha_inicio),
          fecha_fin: formatDateToIsoOutput(data.fecha_fin)
      }

      const method = initialData ? 'PATCH' : 'POST'
      const url = initialData ? `/api/turnero/bloqueos/${initialData.id}` : '/api/turnero/bloqueos'
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error)
      }

      toast.success(initialData ? 'Bloqueo actualizado' : 'Horario bloqueado exitosamente')
      form.reset()
      onSaved()
      onOpenChange(false)
    } catch (error: any) {
      toast.error('Error al guardar bloqueo', { description: error.message })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
              <Ban className="w-4 h-4 text-destructive" />
            </div>
            <div>
              <DialogTitle>{initialData ? 'Editar Bloqueo' : 'Bloquear Horario'}</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Este bloque marcará indisponibilidad temporal en la agenda.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            
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
                  <FormLabel>Motivo <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                  <FormControl>
                     <Textarea
                       placeholder="Ej: Congreso médico, vacaciones, motivo personal..."
                       className="resize-none"
                       rows={3}
                       {...field}
                       value={field.value || ''}
                     />
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
                      <AlertDialogTitle>¿Eliminar este bloqueo?</AlertDialogTitle>
                      <AlertDialogDescription>
                        El horario quedará disponible nuevamente en la agenda.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
                <Button
                  type="submit"
                  disabled={isLoading}
                  variant={initialData ? 'default' : 'destructive'}
                  className="min-w-32"
                >
                  {isLoading
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : (initialData ? 'Guardar Cambios' : 'Confirmar Bloqueo')
                  }
                </Button>
              </div>
            </DialogFooter>

          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
