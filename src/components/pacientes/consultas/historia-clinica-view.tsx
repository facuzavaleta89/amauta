'use client'

import { useState, useCallback } from 'react'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ConsultaTimeline } from './consulta-timeline'
import { ConsultaDetail } from './consulta-detail'
import { HCCompletaPDFButton } from './pdf-download-button'
import type { Consulta } from '@/types/consulta'

interface PacienteData {
  nombre_completo: string
  dni: string
  fecha_nacimiento: string
  obra_social_nombre?: string | null
  numero_afiliado?: string | null
}

interface HistoriaClinicaViewProps {
  pacienteId: string
  paciente: PacienteData
  archivado?: boolean
  initialConsultas: Consulta[]
  /** Usuario logueado: lo necesita la regla de descarte de borradores (médico o autor). */
  currentUserId: string
}

type PanelMode = 'empty' | 'new' | 'view' | 'edit'

export function HistoriaClinicaView({
  pacienteId,
  paciente,
  archivado = false,
  initialConsultas,
  currentUserId,
}: HistoriaClinicaViewProps) {
  const [consultas, setConsultas] = useState<Consulta[]>(initialConsultas)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [panelMode, setPanelMode] = useState<PanelMode>('empty')
  // Mobile: 'list' | 'detail'
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')

  const selectedConsulta = consultas.find((c) => c.id === selectedId) ?? null

  // ── Handlers ──────────────────────────────────────────────

  const handleSelectConsulta = useCallback((id: string) => {
    const c = consultas.find((x) => x.id === id)
    if (!c) return
    setSelectedId(id)
    // Borradores son editables; finalizadas son solo lectura
    setPanelMode(c.estado === 'borrador' ? 'edit' : 'view')
    setMobileView('detail')
  }, [consultas])

  const handleNew = useCallback(() => {
    if (archivado) return // paciente archivado: no se crean consultas nuevas
    setSelectedId(null)
    setPanelMode('new')
    setMobileView('detail')
  }, [archivado])

  const handleCancel = useCallback(() => {
    if (selectedId) {
      // Volver a ver la que estaba seleccionada
      const c = consultas.find((x) => x.id === selectedId)
      setPanelMode(c?.estado === 'borrador' ? 'edit' : 'view')
    } else {
      setPanelMode('empty')
    }
    setMobileView('list')
  }, [selectedId, consultas])

  const handleSaved = useCallback((saved: Consulta) => {
    setConsultas((prev) => {
      const idx = prev.findIndex((c) => c.id === saved.id)
      if (idx >= 0) {
        const updated = [...prev]
        updated[idx] = saved
        return updated.sort(
          (a, b) => new Date(b.fecha_hora).getTime() - new Date(a.fecha_hora).getTime()
        )
      }
      // Nueva consulta: agregar al inicio (ordenadas desc)
      return [saved, ...prev].sort(
        (a, b) => new Date(b.fecha_hora).getTime() - new Date(a.fecha_hora).getTime()
      )
    })
    setSelectedId(saved.id)
    // Si se finalizó, pasar a modo vista (ya no editable)
    setPanelMode(saved.estado === 'finalizada' ? 'view' : 'edit')
    setMobileView('detail')
  }, [])

  // Borrador descartado: se va de la lista y el panel vuelve a vacío. El descarte es
  // físico, así que no hay estado intermedio que mostrar — y en mobile conviene volver
  // a la lista, porque el detalle que se estaba viendo ya no existe.
  const handleDeleted = useCallback((deletedId: string) => {
    setConsultas((prev) => prev.filter((c) => c.id !== deletedId))
    setSelectedId(null)
    setPanelMode('empty')
    setMobileView('list')
  }, [])

  const handleBackToList = useCallback(() => {
    setMobileView('list')
  }, [])

  // ── Render ─────────────────────────────────────────────────

  const detailNode = panelMode === 'empty' ? (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
      <div className="p-5 rounded-full bg-muted">
        <svg className="h-10 w-10 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <p className="font-medium text-foreground">Seleccioná una consulta</p>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Hacé clic en una consulta de la lista para ver su detalle,<br />
        o creá una nueva.
      </p>
    </div>
  ) : (
    <ConsultaDetail
      key={panelMode === 'new' ? 'new' : selectedId ?? 'new'}
      mode={panelMode === 'new' ? 'new' : panelMode}
      consulta={panelMode === 'new' ? null : selectedConsulta}
      pacienteId={pacienteId}
      currentUserId={currentUserId}
      archivado={archivado}
      onSaved={handleSaved}
      onCancel={handleCancel}
      onDeleted={handleDeleted}
    />
  )

  return (
    <div className="flex flex-col h-full gap-0">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 pb-4 shrink-0 flex-wrap">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="rounded-full shrink-0">
            <Link href={`/pacientes/${pacienteId}`}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Historia Clínica</h1>
            <p className="text-sm text-muted-foreground">{paciente.nombre_completo}</p>
          </div>
        </div>
        <HCCompletaPDFButton
          pacienteId={pacienteId}
          finalizadasCount={consultas.filter((c) => c.estado === 'finalizada').length}
        />
      </div>

      {/* ── Layout dos columnas (desktop) / una columna (mobile) ── */}
      <div className="flex-1 min-h-0 flex rounded-xl border border-border/60 shadow-sm overflow-hidden bg-card">

        {/* ── Columna izquierda: Timeline ── */}
        <div className={[
          'w-full md:w-72 lg:w-80 shrink-0 border-r border-border/60 overflow-hidden',
          // Mobile: ocultar si estamos en detalle
          mobileView === 'detail' ? 'hidden md:flex md:flex-col' : 'flex flex-col',
        ].join(' ')}>
          <ConsultaTimeline
            consultas={consultas}
            selectedId={selectedId}
            isCreatingNew={panelMode === 'new'}
            archivado={archivado}
            onSelect={handleSelectConsulta}
            onNew={handleNew}
          />
        </div>

        {/* ── Columna derecha: Detalle ── */}
        <div className={[
          'flex-1 overflow-y-auto',
          mobileView === 'list' ? 'hidden md:block' : 'block',
        ].join(' ')}>
          {/* Botón volver en mobile */}
          {mobileView === 'detail' && (
            <div className="md:hidden p-3 border-b border-border/60">
              <Button variant="ghost" size="sm" onClick={handleBackToList} className="gap-1.5 -ml-1">
                <ArrowLeft className="h-4 w-4" />
                Volver a la lista
              </Button>
            </div>
          )}
          <div className="p-5 md:p-6">
            {detailNode}
          </div>
        </div>
      </div>
    </div>
  )
}
