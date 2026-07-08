'use client'

import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { Loader2, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Nota } from '@/types/nota'
import { crearNota, actualizarNota, eliminarNota } from '@/app/(app)/notas/actions'

interface Props {
  nota: Nota | null   // null = nueva
  onSaved: (nota: Nota, isNew: boolean) => void
  onDeleted: (id: string) => void
  onClose: () => void
}

export function NotaForm({ nota, onSaved, onDeleted, onClose }: Props) {
  const isNew = nota === null
  const [titulo, setTitulo] = useState(nota?.titulo ?? '')
  const [cuerpo, setCuerpo] = useState(nota?.cuerpo ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const tituloRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    tituloRef.current?.focus()
  }, [])

  async function handleSave() {
    if (!titulo.trim()) {
      toast.error('El título es requerido')
      return
    }
    setSaving(true)
    try {
      if (isNew) {
        const { error } = await crearNota({ titulo: titulo.trim(), cuerpo })
        if (error) throw new Error(error)
        // Construir objeto local para actualizar UI sin re-fetch
        const ahora = new Date().toISOString()
        onSaved(
          { id: crypto.randomUUID(), user_id: '', titulo: titulo.trim(), cuerpo, created_at: ahora, updated_at: ahora },
          true
        )
        toast.success('Nota creada')
      } else {
        const { error } = await actualizarNota(nota.id, { titulo: titulo.trim(), cuerpo })
        if (error) throw new Error(error)
        onSaved({ ...nota, titulo: titulo.trim(), cuerpo, updated_at: new Date().toISOString() }, false)
        toast.success('Nota guardada')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!nota || isNew) return
    setDeleting(true)
    try {
      const { error } = await eliminarNota(nota.id)
      if (error) throw new Error(error)
      onDeleted(nota.id)
      toast.success('Nota eliminada')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    } finally {
      setDeleting(false)
    }
  }

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-xl bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="font-semibold text-base">
            {isNew ? 'Nueva nota' : 'Editar nota'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nota-titulo">Título *</Label>
            <Input
              id="nota-titulo"
              ref={tituloRef}
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Título de la nota…"
              maxLength={200}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault()
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nota-cuerpo">Contenido</Label>
            <Textarea
              id="nota-cuerpo"
              value={cuerpo}
              onChange={(e) => setCuerpo(e.target.value)}
              placeholder="Escribí tu nota acá…"
              rows={10}
              className="resize-none font-mono text-sm leading-relaxed"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-border bg-muted/30 shrink-0">
          {!isNew ? (
            <Button
              id="eliminar-nota-btn"
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={deleting || saving}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Eliminar
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving || deleting}>
              Cancelar
            </Button>
            <Button
              id="guardar-nota-btn"
              size="sm"
              onClick={handleSave}
              disabled={saving || deleting || !titulo.trim()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isNew ? 'Crear nota' : 'Guardar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
