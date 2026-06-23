'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { differenceInYears } from 'date-fns'
import {
  Download, Loader2, Trash2, ArrowLeft,
  User, Calendar, Award, Clock, Ban,
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

interface CertificadoDocViewProps {
  certificado: Certificado
  medicoNombre: string
  medicoMatricula?: string | null
  medicoFirma?: string | null
  medicoLogo?: string | null
  userRole: 'medico' | 'asistente'
}


export function CertificadoDocView({
  certificado,
  medicoNombre,
  medicoMatricula,
  medicoFirma,
  medicoLogo,
  userRole,
}: CertificadoDocViewProps) {
  const router = useRouter()
  const [isDownloading, setIsDownloading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const [estado, setEstado] = useState(certificado.estado)
  const [isAnulando, setIsAnulando] = useState(false)

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

  async function anularCertificado() {
    setIsAnulando(true)
    try {
      const res = await fetch(`/api/certificados/${certificado.id}/anular`, { method: 'POST' })
      if (!res.ok) throw new Error('Error al anular')
      toast.success('Documento anulado')
      setEstado('revocado')
      router.refresh()
    } catch {
      toast.error('No se pudo anular el certificado')
    } finally {
      setIsAnulando(false)
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
              {estado === 'revocado' && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium ring-1 ring-inset bg-red-500/10 text-red-700 dark:text-red-400 ring-red-500/30">
                  Anulado
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {certificado.paciente_nombre}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {userRole === 'medico' && estado === 'emitido' && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-destructive hover:bg-destructive/10 border-destructive/20 gap-2">
                  <Ban className="h-4 w-4" />
                  Anular Documento
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Anular certificado médico?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción marcará el certificado como <strong>inválido</strong>. El QR público indicará que el documento está revocado, aunque el PDF siga impreso. Esta acción no se puede deshacer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={anularCertificado}
                    disabled={isAnulando}
                    className="bg-destructive hover:bg-destructive/90"
                  >
                    {isAnulando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    Anular
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

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
        {estado === 'revocado' && (
          <div className="bg-red-50 dark:bg-red-950/20 border-b border-red-200 dark:border-red-900/40 px-8 py-3 text-center text-sm font-semibold text-red-800 dark:text-red-200 flex items-center justify-center gap-2">
            <Ban className="h-4.5 w-4.5" />
            Este documento ha sido anulado y no es válido para su uso.
          </div>
        )}

        {/* Membrete */}
        <div className="bg-gradient-to-r from-primary/5 to-primary/10 border-b border-primary/20 px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {medicoLogo ? (
                <img src={medicoLogo} alt="Logo" className="w-12 h-10 object-contain select-none pointer-events-none" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center shrink-0">
                  <span className="text-primary-foreground font-bold text-base">A</span>
                </div>
              )}
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
            <div className="text-right min-w-[200px] flex flex-col items-center">
              {medicoFirma && (
                <div className="h-14 w-auto flex items-center justify-center mb-1">
                  <img
                    src={medicoFirma}
                    alt="Firma digital"
                    className="max-h-14 w-auto object-contain select-none pointer-events-none"
                  />
                </div>
              )}
              <div className="border-b border-foreground w-full mb-2" />
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
