'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Search, Plus, StickyNote, Clock } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Nota } from '@/types/nota'
import { NotaForm } from './nota-form'

interface Props {
  notas: Nota[]
}

export function NotasList({ notas: initialNotas }: Props) {
  const [notas, setNotas] = useState<Nota[]>(initialNotas)
  const [query, setQuery] = useState('')
  const [editando, setEditando] = useState<Nota | null | 'nueva'>(null)

  const filtered = notas.filter((n) => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return n.titulo.toLowerCase().includes(q) || n.cuerpo.toLowerCase().includes(q)
  })

  function handleSaved(nota: Nota, isNew: boolean) {
    setNotas((prev) =>
      isNew ? [nota, ...prev] : prev.map((n) => (n.id === nota.id ? nota : n))
    )
    setEditando(null)
  }

  function handleDeleted(id: string) {
    setNotas((prev) => prev.filter((n) => n.id !== id))
    setEditando(null)
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="notas-search"
            placeholder="Buscar en tus notas…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          id="nueva-nota-btn"
          onClick={() => setEditando('nueva')}
          className="shrink-0"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nueva nota
        </Button>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border border-dashed rounded-xl bg-card">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
            <StickyNote className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">
            {query ? 'Sin resultados' : 'Sin notas aún'}
          </h3>
          <p className="text-sm text-muted-foreground mt-1 text-center max-w-xs">
            {query
              ? 'Probá con otras palabras clave.'
              : 'Creá tu primera nota para empezar a registrar apuntes.'}
          </p>
          {!query && (
            <Button
              className="mt-4"
              onClick={() => setEditando('nueva')}
            >
              <Plus className="h-4 w-4 mr-2" />
              Crear nota
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((nota) => (
            <button
              key={nota.id}
              id={`nota-${nota.id}`}
              onClick={() => setEditando(nota)}
              className="group text-left p-4 rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all duration-200 space-y-2"
            >
              <h3 className="font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                {nota.titulo}
              </h3>
              {nota.cuerpo && (
                <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                  {nota.cuerpo}
                </p>
              )}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
                <Clock className="h-3 w-3 shrink-0" />
                <span>
                  {format(new Date(nota.updated_at), "d 'de' MMM, HH:mm", { locale: es })}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Modal de creación/edición */}
      {editando !== null && (
        <NotaForm
          nota={editando === 'nueva' ? null : editando}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onClose={() => setEditando(null)}
        />
      )}
    </>
  )
}
