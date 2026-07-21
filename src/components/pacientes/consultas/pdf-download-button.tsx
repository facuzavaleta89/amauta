'use client'

import { useState } from 'react'
import { Download, Loader2, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

// Descarga un PDF desde un endpoint del servidor (Content-Disposition: attachment).
// Reemplaza la generación en el navegador: @react-pdf ya no entra al bundle del cliente.
async function descargarPdf(url: string, fallbackName: string) {
  const res = await fetch(url)
  if (!res.ok) {
    const msg = await res.text().catch(() => '')
    throw new Error(msg || 'No se pudo generar el PDF')
  }
  const blob = await res.blob()

  // Nombre de archivo desde el header, con fallback
  const disposition = res.headers.get('Content-Disposition') ?? ''
  const match = /filename="?([^"]+)"?/.exec(disposition)
  const filename = match?.[1] ?? fallbackName

  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(objectUrl)
}

// ── Botón: PDF de consulta individual ────────────────────────

interface ConsultaPDFButtonProps {
  consultaId: string
  variant?: 'default' | 'outline' | 'ghost'
}

export function ConsultaPDFButton({ consultaId, variant = 'outline' }: ConsultaPDFButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false)

  async function handleDownload() {
    setIsGenerating(true)
    try {
      await descargarPdf(`/api/consultas/${consultaId}/pdf`, `consulta_${consultaId}.pdf`)
    } catch (err) {
      console.error(err)
      toast.error((err as Error).message || 'Error al generar el PDF')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <Button variant={variant} onClick={handleDownload} disabled={isGenerating} className="gap-2">
      {isGenerating ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      {isGenerating ? 'Generando…' : 'Descargar PDF'}
    </Button>
  )
}

// ── Botón: PDF de HC completa ─────────────────────────────────

interface HCCompletaPDFButtonProps {
  pacienteId: string
  finalizadasCount: number
}

export function HCCompletaPDFButton({ pacienteId, finalizadasCount }: HCCompletaPDFButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false)

  async function handleDownload() {
    if (finalizadasCount === 0) {
      toast.info('No hay consultas finalizadas para descargar')
      return
    }
    setIsGenerating(true)
    try {
      await descargarPdf(`/api/pacientes/${pacienteId}/historia/pdf`, `HC_completa_${pacienteId}.pdf`)
    } catch (err) {
      console.error(err)
      toast.error((err as Error).message || 'Error al generar la HC completa')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <Button
      variant="outline"
      onClick={handleDownload}
      disabled={isGenerating || finalizadasCount === 0}
      className="gap-2"
    >
      {isGenerating ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileText className="h-4 w-4" />
      )}
      {isGenerating
        ? 'Generando…'
        : `Descargar HC completa${finalizadasCount > 0 ? ` (${finalizadasCount})` : ''}`}
    </Button>
  )
}
