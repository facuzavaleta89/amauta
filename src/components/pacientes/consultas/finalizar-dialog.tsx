'use client'

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

interface FinalizarDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isLoading?: boolean
}

export function FinalizarDialog({ open, onOpenChange, onConfirm, isLoading }: FinalizarDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Finalizar esta consulta?</AlertDialogTitle>
          <AlertDialogDescription>
            Una vez finalizada, la consulta <strong>no podrá editarse</strong> bajo ninguna
            circunstancia. Si necesitás corregir algo, deberás crear una nueva consulta
            con referencia a ésta.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-success text-success-foreground hover:bg-success/90 focus:ring-success"
          >
            {isLoading ? 'Finalizando…' : 'Finalizar consulta'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
