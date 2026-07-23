'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Download, Loader2, ArrowLeft,
  User, Calendar, Stethoscope, FileText, AlertCircle, Ban,
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
import type { Pedido } from '@/types/pedido'

interface PedidoDocViewProps {
  pedido: Pedido
  medicoNombre: string
  medicoMatricula?: string | null
  medicoFirma?: string | null
  medicoLogo?: string | null
  /** True si el documento no tiene emisor_snapshot (bug): se muestra un aviso. */
  sinEmisor?: boolean
  userRole: 'medico' | 'asistente'
}


export function PedidoDocView({
  pedido,
  medicoNombre,
  medicoMatricula,
  medicoFirma,
  medicoLogo,
  sinEmisor,
  userRole,
}: PedidoDocViewProps) {
  const router = useRouter()
  const [estado, setEstado] = useState(pedido.estado)
  const [isAnulando, setIsAnulando] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  async function descargarPDF() {
    setIsDownloading(true)
    try {
      const res = await fetch(`/api/pedidos/${pedido.id}/pdf`)
      if (!res.ok) throw new Error('Error al generar el PDF')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `pedido_${pedido.paciente_nombre.replace(/\s+/g, '_')}_${pedido.fecha_pedido}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('No se pudo generar el PDF')
    } finally {
      setIsDownloading(false)
    }
  }

  async function anularPedido() {
    setIsAnulando(true)
    try {
      const res = await fetch(`/api/pedidos/${pedido.id}/anular`, { method: 'POST' })
      if (!res.ok) throw new Error('Error al anular')
      toast.success('Pedido anulado')
      setEstado('revocado')
      router.refresh()
    } catch {
      toast.error('No se pudo anular el pedido')
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
            href="/pedidos"
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">Pedido de Estudios</h1>
              {estado === 'revocado' && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium ring-1 ring-inset bg-red-500/10 text-red-700 dark:text-red-400 ring-red-500/30">
                  Anulado
                </span>
              )}
              {estado !== 'revocado' && (
                <Badge variant="outline" className="text-xs">
                  {formatFecha(pedido.fecha_pedido)}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {pedido.paciente_nombre}
            </p>
          </div>
        </div>

        {/* Acciones */}
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
                  <AlertDialogTitle>¿Anular pedido médico?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción marcará el pedido de estudios como <strong>inválido</strong>. El QR público indicará que el documento está revocado, aunque el PDF siga impreso. Esta acción no se puede deshacer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={anularPedido}
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

          {estado === 'revocado' ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={isDownloading} className="gap-2">
                  {isDownloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {isDownloading ? 'Generando...' : 'Descargar PDF'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Descargar documento anulado?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Este documento fue anulado. El PDF que vas a descargar es el original tal como se emitió y no lleva marca de anulación. Quien escanee el QR verá que está revocado.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={descargarPDF}>
                    Descargar igual
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button onClick={descargarPDF} disabled={isDownloading} className="gap-2">
              {isDownloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {isDownloading ? 'Generando...' : 'Descargar PDF'}
            </Button>
          )}
        </div>
      </div>

      {/* ── DOCUMENTO PREVIEW ───────────────────────────────── */}
      <div className="bg-white border border-border/60 rounded-xl shadow-lg overflow-hidden print:shadow-none">
        {estado === 'revocado' && (
          <div className="bg-red-50 dark:bg-red-950/20 border-b border-red-200 dark:border-red-900/40 px-8 py-3 text-center text-sm font-semibold text-red-800 dark:text-red-200 flex items-center justify-center gap-2">
            <Ban className="h-4.5 w-4.5" />
            Este documento ha sido anulado y no es válido para su uso.
          </div>
        )}

        {sinEmisor && (
          <div className="bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-900/40 px-8 py-3 text-center text-sm font-semibold text-amber-800 dark:text-amber-200 flex items-center justify-center gap-2">
            <AlertCircle className="h-4.5 w-4.5" />
            Este documento no tiene datos del emisor registrados. No se generó correctamente: contactá al administrador.
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

        {/* Línea verde */}
        <div className="h-0.5 bg-primary" />

        {/* Cuerpo del documento */}
        <div className="px-8 py-8 space-y-7">

          {/* Título */}
          <div className="text-center">
            <h2 className="text-xl font-bold text-primary uppercase tracking-widest">
              Pedido de Estudios
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
                <p className="text-sm font-semibold text-foreground">{pedido.paciente_nombre}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">DNI</p>
                <p className="text-sm font-mono font-semibold text-foreground">{pedido.paciente_dni}</p>
              </div>
              {pedido.obra_social_nombre && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Obra Social</p>
                  <p className="text-sm font-semibold text-foreground">{pedido.obra_social_nombre}</p>
                </div>
              )}
              {pedido.numero_afiliado && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">N° Afiliado</p>
                  <p className="text-sm font-mono font-semibold text-foreground">{pedido.numero_afiliado}</p>
                </div>
              )}
            </div>
          </div>

          <div className="h-px bg-primary/10" />

          {/* Diagnóstico */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-bold text-primary uppercase tracking-widest">
                Diagnóstico Presuntivo
              </h3>
            </div>
            <div className="border-l-4 border-primary pl-4">
              <p className="text-sm text-foreground leading-relaxed">{pedido.diagnostico}</p>
            </div>
          </div>

          {/* Estudios */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-bold text-primary uppercase tracking-widest">
                Estudios Solicitados
              </h3>
            </div>
            <div className="border-l-4 border-primary pl-4">
              <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">
                {pedido.estudios_pedidos}
              </p>
            </div>
          </div>

          {/* Indicaciones */}
          {pedido.indicaciones && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex gap-3">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-1">
                  Indicaciones para el Paciente
                </p>
                <p className="text-sm text-amber-900 leading-relaxed">{pedido.indicaciones}</p>
              </div>
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

        {/* Footer del documento */}
        <div className="border-t border-border/40 bg-muted/30 px-8 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Calendar className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {formatFechaLarga(pedido.fecha_pedido)}
            </span>
          </div>
          <span className="text-xs text-primary font-bold tracking-widest">AMAUTA</span>
          <span className="text-xs text-muted-foreground font-mono">
            ID: {pedido.id.slice(0, 8).toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  )
}
