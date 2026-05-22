'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { differenceInYears } from 'date-fns'
import {
  Download, Loader2, Trash2, ArrowLeft,
  User, Calendar, Award, Clock,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatFecha, formatFechaLarga } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import Link from 'next/link'
import type { Certificado } from '@/types/pedido'
import { CERTIFICADO_TIPO_LABELS } from '@/lib/validations/pedido.schema'

interface CertificadoDocViewProps {
  certificado: Certificado
  medicoNombre: string
  medicoMatricula?: string | null
  userRole: 'medico' | 'asistente'
}


const TIPO_BADGE_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  aptitud_fisica: { bg: 'bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400', ring: 'ring-emerald-500/30' },
  reposo:         { bg: 'bg-blue-500/10',    text: 'text-blue-700 dark:text-blue-400',       ring: 'ring-blue-500/30'    },
  diagnostico:    { bg: 'bg-violet-500/10',  text: 'text-violet-700 dark:text-violet-400',   ring: 'ring-violet-500/30'  },
  libre_deuda:    { bg: 'bg-amber-500/10',   text: 'text-amber-700 dark:text-amber-400',     ring: 'ring-amber-500/30'   },
  otro:           { bg: 'bg-muted',          text: 'text-muted-foreground',                  ring: 'ring-border'         },
}

export function CertificadoDocView({
  certificado,
  medicoNombre,
  medicoMatricula,
  userRole,
}: CertificadoDocViewProps) {
  const router = useRouter()
  const [isDownloading, setIsDownloading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const tipoLabel = CERTIFICADO_TIPO_LABELS[certificado.tipo] ?? 'Certificado'
  const badge = TIPO_BADGE_COLORS[certificado.tipo] ?? TIPO_BADGE_COLORS.otro

  // Calcular edad del paciente
  const edad = certificado.paciente_dob
    ? differenceInYears(new Date(), new Date(certificado.paciente_dob + 'T12:00:00'))
    : null

  async function descargarPDF() {
    setIsDownloading(true)
    try {
      const res = await fetch(`/api/certificados/${certificado.id}/pdf`)
      if (!res.ok) throw new Error('Error al generar el PDF')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `certificado_${certificado.tipo}_${certificado.paciente_nombre.replace(/\s+/g, '_')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('No se pudo generar el PDF')
    } finally {
      setIsDownloading(false)
    }
  }

  async function eliminarCertificado() {
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/certificados/${certificado.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al eliminar')
      toast.success('Certificado eliminado')
      router.push('/certificados')
      router.refresh()
    } catch {
      toast.error('No se pudo eliminar el certificado')
      setIsDeleting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/certificados"
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">Certificado Médico</h1>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ring-1 ring-inset ${badge.bg} ${badge.text} ${badge.ring}`}
              >
                {tipoLabel}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {certificado.paciente_nombre}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {userRole === 'medico' && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar certificado?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción no se puede deshacer. El certificado de <strong>{certificado.paciente_nombre}</strong> será eliminado permanentemente.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={eliminarCertificado}
                    disabled={isDeleting}
                    className="bg-destructive hover:bg-destructive/90"
                  >
                    {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          <Button onClick={descargarPDF} disabled={isDownloading} className="gap-2">
            {isDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {isDownloading ? 'Generando...' : 'Descargar PDF'}
          </Button>
        </div>
      </div>

      {/* ── DOCUMENTO PREVIEW ───────────────────────────────── */}
      <div className="bg-white border border-border/60 rounded-xl shadow-lg overflow-hidden">

        {/* Membrete */}
        <div className="bg-gradient-to-r from-primary/5 to-primary/10 border-b border-primary/20 px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center shrink-0">
                <span className="text-primary-foreground font-bold text-base">A</span>
              </div>
              <div>
                <p className="font-bold text-primary text-sm tracking-wider">AMAUTA</p>
                <p className="text-[11px] text-muted-foreground">Sistema de Gestión Médica</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-semibold text-sm text-foreground">{medicoNombre}</p>
              {medicoMatricula && (
                <p className="text-xs text-muted-foreground mt-0.5">{medicoMatricula}</p>
              )}
            </div>
          </div>
        </div>

        <div className="h-0.5 bg-primary" />

        {/* Cuerpo */}
        <div className="px-8 py-8 space-y-7">

          {/* Título */}
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-primary uppercase tracking-widest">
              Certificado Médico
            </h2>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">
              {certificado.tipo === 'otro' && certificado.tipo_descripcion
                ? certificado.tipo_descripcion
                : tipoLabel}
            </p>
          </div>

          {/* Datos del paciente */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-3">
              <User className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-bold text-primary uppercase tracking-widest">
                Datos del Paciente
              </h3>
            </div>
            <div className="bg-primary/5 rounded-lg px-5 py-4 grid grid-cols-2 gap-x-6 gap-y-2">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Paciente</p>
                <p className="text-sm font-semibold text-foreground">{certificado.paciente_nombre}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">DNI</p>
                <p className="text-sm font-mono font-semibold text-foreground">{certificado.paciente_dni}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Fecha Nac.</p>
                <p className="text-sm text-foreground">
                  {formatFechaLarga(certificado.paciente_dob)}
                  {edad !== null && <span className="text-muted-foreground ml-1">({edad} años)</span>}
                </p>
              </div>
              {certificado.obra_social_nombre && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Obra Social</p>
                  <p className="text-sm font-semibold text-foreground">{certificado.obra_social_nombre}</p>
                </div>
              )}
            </div>
          </div>

          <div className="h-px bg-primary/10" />

          {/* Contenido */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-bold text-primary uppercase tracking-widest">
                Certifico que
              </h3>
            </div>
            <div className="border-l-4 border-primary pl-4">
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                {certificado.contenido}
              </p>
            </div>
          </div>

          {/* Datos de reposo */}
          {certificado.tipo === 'reposo' && certificado.dias_reposo && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-5 py-4 flex gap-8">
              <div>
                <p className="text-[10px] text-blue-600 uppercase tracking-widest font-bold">
                  Días de Reposo
                </p>
                <p className="text-3xl font-bold text-blue-900 mt-1">{certificado.dias_reposo}</p>
              </div>
              {certificado.fecha_inicio_reposo && (
                <div className="border-l border-blue-200/50 pl-8">
                  <p className="text-[10px] text-blue-700 dark:text-blue-300 uppercase tracking-widest font-bold">
                    Inicio
                  </p>
                  <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mt-1">
                    {formatFechaLarga(certificado.fecha_inicio_reposo!)}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Validez */}
          {certificado.valido_hasta && (
            <div className="flex items-center gap-2 text-sm bg-amber-50/50 border border-amber-200/50 rounded-lg px-4 py-2">
              <Clock className="h-4 w-4 text-amber-700 dark:text-amber-300 shrink-0" />
              <span className="text-amber-900 dark:text-amber-100 font-medium">
                Válido hasta: {formatFechaLarga(certificado.valido_hasta!)}
              </span>
            </div>
          )}

          {/* Firma */}
          <div className="flex justify-end pt-6">
            <div className="text-right min-w-[200px]">
              <div className="border-b border-foreground mb-2" />
              <p className="text-sm font-semibold text-foreground">{medicoNombre}</p>
              {medicoMatricula && (
                <p className="text-xs text-muted-foreground">{medicoMatricula}</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border/40 bg-muted/30 px-8 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Calendar className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {formatFechaLarga(certificado.fecha_certificado)}
            </span>
          </div>
          <span className="text-xs text-primary font-bold tracking-widest">AMAUTA</span>
          <span className="text-xs text-muted-foreground font-mono">
            ID: {certificado.id.slice(0, 8).toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  )
}
