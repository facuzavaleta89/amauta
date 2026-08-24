'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore, Trash2, AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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

interface PacienteAccionesProps {
  patientId: string
  patientName: string
  archivado: boolean
}

// Acciones destructivas de la ficha del paciente. Se renderiza SOLO para el médico.
// - Archivar / Desarchivar (Ley 26.529: los datos se conservan, no se borran).
// - Eliminar definitivamente: excepción para altas erróneas sin actuaciones (el servidor
//   valida y devuelve 409 si el paciente tiene cualquier actuación registrada).
export function PacienteAcciones({ patientId, patientName, archivado }: PacienteAccionesProps) {
  const router = useRouter()
  const [isArchiving, setIsArchiving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  async function toggleArchivado() {
    setIsArchiving(true)
    try {
      const res = await fetch(`/api/pacientes/${patientId}/archivar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivar: !archivado }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'No se pudo completar la acción')
      }
      toast.success(archivado ? 'Paciente reactivado' : 'Paciente archivado')
      router.refresh()
    } catch (error: unknown) {
      toast.error((error as Error).message || 'No se pudo completar la acción')
    } finally {
      setIsArchiving(false)
    }
  }

  async function eliminarDefinitivo() {
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/pacientes/${patientId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        // 409 → tiene actuaciones; mostramos el motivo tal cual lo explica el servidor.
        throw new Error(data?.error || 'No se pudo eliminar el paciente')
      }
      toast.success('Paciente eliminado definitivamente')
      router.push('/pacientes')
      router.refresh()
    } catch (error: unknown) {
      toast.error((error as Error).message || 'No se pudo eliminar el paciente')
      setIsDeleting(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* Archivar / Desarchivar */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" className="gap-2">
            {archivado ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            <span className="hidden sm:inline">{archivado ? 'Desarchivar' : 'Archivar'}</span>
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {archivado ? '¿Reactivar paciente?' : '¿Archivar paciente?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {archivado ? (
                <>
                  <strong>{patientName}</strong> volverá a aparecer en los listados activos y podrás
                  volver a emitir documentos y turnos para este paciente.
                </>
              ) : (
                <>
                  Archivar <strong>no borra los datos</strong>: la historia clínica y todos los
                  registros de <strong>{patientName}</strong> se conservan. Solo sale de los listados
                  activos y no se le podrán emitir documentos nuevos hasta reactivarlo.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={toggleArchivado} disabled={isArchiving}>
              {isArchiving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {archivado ? 'Desarchivar' : 'Archivar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Eliminar definitivamente (excepción) */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            aria-label="Eliminar definitivamente"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive-strong">
              <AlertTriangle className="h-5 w-5" />
              Eliminar definitivamente
            </AlertDialogTitle>
            <AlertDialogDescription>
              Solo es posible eliminar pacientes cargados por error, <strong>sin ninguna actuación
              registrada</strong> (consultas, historia clínica, estudios, turnos, pedidos o
              certificados). Si <strong>{patientName}</strong> tiene actuaciones, la eliminación se
              rechazará y deberás <strong>archivarlo</strong> en su lugar. Esta acción no se puede
              deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={eliminarDefinitivo}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Eliminar definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
