'use client'

import { useState } from 'react'
import { Download, Loader2, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type { Consulta } from '@/types/consulta'

import type { Matricula } from '@/types/roles'

interface PacienteData {
  nombre_completo: string
  dni: string
  fecha_nacimiento: string
  obra_social_nombre?: string | null
  numero_afiliado?: string | null
}

interface MedicoData {
  full_name: string
  titulo?: string | null
  matriculas?: Matricula[]
  firma_url?: string | null
  logo_url?: string | null
}

// ── Botón: PDF de consulta individual ────────────────────────

interface ConsultaPDFButtonProps {
  consulta: Consulta
  paciente: PacienteData
  medico: MedicoData
  variant?: 'default' | 'outline' | 'ghost'
}

export function ConsultaPDFButton({
  consulta,
  paciente,
  medico,
  variant = 'outline',
}: ConsultaPDFButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false)

  async function handleDownload() {
    setIsGenerating(true)
    try {
      const { pdf } = await import('@react-pdf/renderer')
      const { ConsultaIndividualPDF } = await import('@/lib/pdf/consulta-template')

      const blob = await pdf(
        <ConsultaIndividualPDF consulta={consulta} paciente={paciente} medico={medico} />
      ).toBlob()

      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      const fecha = new Date(consulta.fecha_hora)
        .toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        .replace(/\//g, '-')
      a.href     = url
      a.download = `consulta_${paciente.nombre_completo.replace(/\s+/g, '_')}_${fecha}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
      toast.error('Error al generar el PDF')
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
  consultas: Consulta[]
  paciente: PacienteData
  medico: MedicoData
}

export function HCCompletaPDFButton({ consultas, paciente, medico }: HCCompletaPDFButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false)

  const finalizadas = consultas.filter((c) => c.estado === 'finalizada')

  async function handleDownload() {
    if (finalizadas.length === 0) {
      toast.info('No hay consultas finalizadas para descargar')
      return
    }
    setIsGenerating(true)
    try {
      const { pdf } = await import('@react-pdf/renderer')
      const { HCCompletaPDF } = await import('@/lib/pdf/consulta-template')

      const blob = await pdf(
        <HCCompletaPDF consultas={finalizadas} paciente={paciente} medico={medico} />
      ).toBlob()

      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `HC_completa_${paciente.nombre_completo.replace(/\s+/g, '_')}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
      toast.error('Error al generar la HC completa')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <Button variant="outline" onClick={handleDownload} disabled={isGenerating || finalizadas.length === 0} className="gap-2">
      {isGenerating ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileText className="h-4 w-4" />
      )}
      {isGenerating
        ? 'Generando…'
        : `Descargar HC completa${finalizadas.length > 0 ? ` (${finalizadas.length})` : ''}`}
    </Button>
  )
}
