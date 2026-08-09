'use client'

import { AlertTriangle, Loader2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface DescartarDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isLoading?: boolean
}

// Confirmación de descarte de un BORRADOR de consulta. Controlado, igual que
// `finalizar-dialog.tsx`; la estética destructiva (título en `text-destructive` con
// AlertTriangle + acción en `bg-destructive`) sigue a `pacientes/paciente-acciones.tsx`.
// El borrado es FÍSICO y sin rastro: por eso el texto no promete ninguna papelera.
export function DescartarDialog({ open, onOpenChange, onConfirm, isLoading }: DescartarDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            ¿Descartar este borrador?
          </AlertDialogTitle>
          <AlertDialogDescription>
            El borrador y todo lo que hayas cargado en él se <strong>eliminan
            definitivamente</strong>: no queda copia ni registro. <strong>Esta acción no se
            puede deshacer.</strong> Solo se descartan borradores — las consultas
            finalizadas forman parte de la historia clínica y se conservan siempre.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-destructive hover:bg-destructive/90"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Descartar borrador
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
