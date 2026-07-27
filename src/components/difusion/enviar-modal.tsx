'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Send, Search, Loader2, Users, AlertCircle, Mail } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const LIMITE_DIARIO = 100

interface Destinatario {
  id: string
  nombre_completo: string
  email: string
  sexo: 'masculino' | 'femenino' | 'otro'
  obra_social: string | null
}

interface EnvioError {
  paciente_id: string
  email: string
  error: string
}

interface EnviarModalProps {
  postId: string
  postTitulo: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SEXO_LABEL: Record<Destinatario['sexo'], string> = {
  masculino: 'Masculino',
  femenino: 'Femenino',
  otro: 'Otro',
}

const SIN_OBRA = '__sin__' // valor centinela del filtro para "Sin obra social"

export function EnviarModal({ postId, postTitulo, open, onOpenChange }: EnviarModalProps) {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [destinatarios, setDestinatarios] = useState<Destinatario[]>([])

  // Selección GLOBAL (independiente del filtro).
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Filtros (solo cambian lo que se ve, no la selección).
  const [search, setSearch] = useState('')
  const [obraFilter, setObraFilter] = useState<string>('todas')
  const [sexoFilter, setSexoFilter] = useState<string>('todos')

  const [sending, setSending] = useState(false)
  const [fallidos, setFallidos] = useState<EnvioError[] | null>(null)
  const [needsRefreshOnClose, setNeedsRefreshOnClose] = useState(false)

  // ── Cargar destinatarios al abrir ──────────────────────────────
  useEffect(() => {
    if (!open) return
    let cancel = false

    // Reset de estado en cada apertura.
    setLoading(true)
    setLoadError(null)
    setFallidos(null)
    setSearch('')
    setObraFilter('todas')
    setSexoFilter('todos')

    ;(async () => {
      try {
        const res = await fetch('/api/difusion/destinatarios')
        const json = await res.json()
        if (cancel) return
        if (!res.ok) throw new Error(json.error || 'No se pudo cargar la lista')
        const lista: Destinatario[] = json.data ?? []
        setDestinatarios(lista)
        setSelected(new Set(lista.map((d) => d.id))) // todos tildados por defecto
      } catch (err) {
        if (!cancel) setLoadError(err instanceof Error ? err.message : 'Error al cargar')
      } finally {
        if (!cancel) setLoading(false)
      }
    })()

    return () => {
      cancel = true
    }
  }, [open])

  // ── Opciones de obra social (derivadas de la lista) ────────────
  const obrasUnicas = useMemo(() => {
    const set = new Set<string>()
    for (const d of destinatarios) if (d.obra_social) set.add(d.obra_social)
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'))
  }, [destinatarios])
  const haySinObra = useMemo(() => destinatarios.some((d) => !d.obra_social), [destinatarios])

  // ── Filas visibles (según filtros) ─────────────────────────────
  const visibles = useMemo(() => {
    const q = search.trim().toLowerCase()
    return destinatarios.filter((d) => {
      if (q && !d.nombre_completo.toLowerCase().includes(q)) return false
      if (obraFilter === SIN_OBRA && d.obra_social) return false
      if (obraFilter !== 'todas' && obraFilter !== SIN_OBRA && d.obra_social !== obraFilter) return false
      if (sexoFilter !== 'todos' && d.sexo !== sexoFilter) return false
      return true
    })
  }, [destinatarios, search, obraFilter, sexoFilter])

  const total = selected.size
  const excedeLimite = total > LIMITE_DIARIO
  const visiblesTodosTildados = visibles.length > 0 && visibles.every((d) => selected.has(d.id))

  // ── Acciones de selección ──────────────────────────────────────
  function toggleUno(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleVisibles() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (visiblesTodosTildados) {
        for (const d of visibles) next.delete(d.id) // destildar visibles
      } else {
        for (const d of visibles) next.add(d.id) // tildar visibles
      }
      return next
    })
  }

  // ── Envío ──────────────────────────────────────────────────────
  async function handleEnviar() {
    if (total === 0 || excedeLimite) return
    setSending(true)
    setFallidos(null)
    try {
      const res = await fetch('/api/difusion/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, destinatario_ids: Array.from(selected) }),
      })
      const json = await res.json()
      if (!res.ok) {
        // 400 / 409 / 429 / 500 → mensaje claro, no cerrar.
        toast.error(json.error || 'No se pudo enviar')
        return
      }

      const exitosos: number = json.exitosos ?? 0
      const listaErrores: EnvioError[] = json.errores ?? []

      if (listaErrores.length === 0) {
        toast.success(`Se enviaron ${exitosos} de ${exitosos} comunicados.`)
        setNeedsRefreshOnClose(false)
        onOpenChange(false)
        router.refresh()
      } else {
        // Parcial: el post quedó 'enviado' si hubo ≥1 éxito. Mantener abierto y mostrar fallidos.
        toast.warning(`Se enviaron ${exitosos}; ${listaErrores.length} fallaron.`)
        setFallidos(listaErrores)
        setNeedsRefreshOnClose(true)
      }
    } catch {
      toast.error('Error de red al enviar')
    } finally {
      setSending(false)
    }
  }

  // Al cerrar, si hubo un envío parcial, refrescar para reflejar el estado 'enviado'.
  function handleOpenChange(next: boolean) {
    if (!next && needsRefreshOnClose) {
      setNeedsRefreshOnClose(false)
      router.refresh()
    }
    onOpenChange(next)
  }

  const nombrePorId = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of destinatarios) m.set(d.id, d.nombre_completo)
    return m
  }, [destinatarios])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl gap-0 p-0 overflow-hidden flex flex-col max-h-[85vh]">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            Enviar por email
          </DialogTitle>
          <DialogDescription className="truncate">
            Elegí a quién enviar <span className="font-medium text-foreground">“{postTitulo}”</span>.
          </DialogDescription>
        </DialogHeader>

        {/* Cuerpo: ocupa el espacio flexible entre header y footer. Solo la lista scrollea. */}
        <div className="flex-1 min-h-0 flex flex-col gap-3 px-6 py-4">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : loadError ? (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {loadError}
            </div>
          ) : destinatarios.length === 0 ? (
            <div className="text-center py-10">
              <Mail className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No hay pacientes activos con un email válido para enviar este comunicado.
              </p>
            </div>
          ) : (
            <>
              {/* Filtros (fijos, con wrap limpio en anchos chicos) */}
              <div className="shrink-0 flex flex-col sm:flex-row sm:flex-wrap gap-2">
                <div className="relative flex-1 min-w-[160px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por nombre…"
                    className="pl-9"
                  />
                </div>
                <Select value={obraFilter} onValueChange={setObraFilter}>
                  <SelectTrigger className="sm:w-48">
                    <SelectValue placeholder="Obra social" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas las obras sociales</SelectItem>
                    {haySinObra && <SelectItem value={SIN_OBRA}>Sin obra social</SelectItem>}
                    {obrasUnicas.map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sexoFilter} onValueChange={setSexoFilter}>
                  <SelectTrigger className="sm:w-36">
                    <SelectValue placeholder="Sexo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="masculino">Masculino</SelectItem>
                    <SelectItem value="femenino">Femenino</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Barra de acciones sobre visibles (fija) */}
              <div className="shrink-0 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={toggleVisibles}
                  disabled={visibles.length === 0}
                  className="text-primary hover:underline disabled:opacity-40 disabled:no-underline"
                >
                  {visiblesTodosTildados ? 'Destildar visibles' : 'Tildar visibles'}
                  {` (${visibles.length})`}
                </button>
                <span className="text-muted-foreground">
                  {visibles.length} de {destinatarios.length} mostrados
                </span>
              </div>

              {/* Lista: única zona con scroll interno; ocupa el espacio flexible del medio. */}
              <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border divide-y divide-border/50">
                {visibles.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Ningún paciente coincide con el filtro.
                  </p>
                ) : (
                  visibles.map((d) => (
                    <label
                      key={d.id}
                      className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        checked={selected.has(d.id)}
                        onChange={() => toggleUno(d.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{d.nombre_completo}</p>
                        <p className="text-xs text-muted-foreground truncate">{d.email}</p>
                      </div>
                      <span className="hidden sm:block shrink-0 text-xs text-muted-foreground max-w-[38%] truncate">
                        {d.obra_social ?? 'Sin obra social'}
                        <span className="mx-1.5 text-border">·</span>
                        {SEXO_LABEL[d.sexo]}
                      </span>
                    </label>
                  ))
                )}
              </div>

              {/* Lista de fallidos (persistente tras un envío parcial; fija, con scroll interno) */}
              {fallidos && fallidos.length > 0 && (
                <div className="shrink-0 rounded-lg border border-destructive/20 bg-destructive/10 p-3 space-y-2">
                  <p className="text-sm font-semibold text-destructive flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    No se pudo enviar a {fallidos.length} destinatario{fallidos.length !== 1 ? 's' : ''}
                  </p>
                  <ul className="max-h-40 overflow-y-auto space-y-1 text-xs">
                    {fallidos.map((f) => (
                      <li key={f.paciente_id} className="text-destructive/90">
                        <span className="font-medium">{nombrePorId.get(f.paciente_id) ?? f.email}</span>
                        <span className="text-destructive/70"> — {f.email}: {f.error}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer (fijo abajo; mx-0/mb-0 neutralizan los márgenes negativos del footer base con p-0) */}
        <DialogFooter className="shrink-0 mx-0 mb-0 px-6 py-4 border-t border-border sm:justify-between items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className={excedeLimite ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-foreground'}>
              {total} seleccionado{total !== 1 ? 's' : ''}
            </span>
            {excedeLimite && (
              <span className="text-xs text-amber-700 dark:text-amber-400">
                · el límite diario es {LIMITE_DIARIO}; destildá algunos
              </span>
            )}
          </div>
          <Button
            onClick={handleEnviar}
            disabled={loading || sending || total === 0 || excedeLimite || destinatarios.length === 0}
            className="gap-2 min-w-[130px]"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? 'Enviando…' : `Enviar (${total})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
