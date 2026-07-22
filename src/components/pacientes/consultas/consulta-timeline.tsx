'use client'

import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { PlusCircle, ClipboardList, Archive } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Consulta } from '@/types/consulta'

interface ConsultaTimelineProps {
  consultas: Consulta[]
  selectedId: string | null
  isCreatingNew: boolean
  archivado?: boolean
  onSelect: (id: string) => void
  onNew: () => void
}

function EstadoBadge({ estado }: { estado: Consulta['estado'] }) {
  if (estado === 'finalizada') {
    return (
      <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">
        Finalizada
      </Badge>
    )
  }
  return (
    <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">
      Borrador
    </Badge>
  )
}

export function ConsultaTimeline({
  consultas,
  selectedId,
  isCreatingNew,
  archivado = false,
  onSelect,
  onNew,
}: ConsultaTimelineProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Encabezado con botón nueva consulta */}
      <div className="p-4 border-b border-border/60 shrink-0">
        {archivado ? (
          <>
            <Button
              id="btn-nueva-consulta"
              disabled
              className="w-full gap-2"
              size="sm"
              title="Paciente archivado: desarchivalo para registrar nuevas consultas"
            >
              <PlusCircle className="h-4 w-4" />
              Nueva consulta
            </Button>
            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
              <Archive className="h-3 w-3 mt-0.5 shrink-0" />
              Paciente archivado. Desarchivalo para registrar nuevas consultas.
            </p>
          </>
        ) : (
          <Button
            id="btn-nueva-consulta"
            onClick={onNew}
            className="w-full gap-2 bg-primary hover:bg-primary/90"
            size="sm"
          >
            <PlusCircle className="h-4 w-4" />
            Nueva consulta
          </Button>
        )}
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {consultas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-6 py-10 text-center">
            <div className="p-4 rounded-full bg-muted">
              <ClipboardList className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">Sin consultas registradas</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Hacé clic en &ldquo;Nueva consulta&rdquo; para registrar el primer encuentro médico.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {/* Tarjeta virtual: "Nueva consulta en curso" */}
            {isCreatingNew && (
              <li
                className="px-4 py-3 bg-primary/5 border-l-2 border-primary cursor-pointer"
                onClick={onNew}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-semibold text-primary">Nueva consulta</span>
                  <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 border-amber-200">
                    Borrador
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">En edición…</p>
              </li>
            )}

            {consultas.map((c) => {
              const isSelected = c.id === selectedId && !isCreatingNew
              return (
                <li
                  key={c.id}
                  id={`consulta-card-${c.id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(c.id)}
                  onKeyDown={(e) => e.key === 'Enter' && onSelect(c.id)}
                  className={cn(
                    'px-4 py-3 cursor-pointer transition-colors hover:bg-muted/50',
                    isSelected && 'bg-primary/5 border-l-2 border-primary',
                    !isSelected && 'border-l-2 border-transparent'
                  )}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <time className="text-xs font-semibold text-foreground tabular-nums">
                      {format(new Date(c.fecha_hora), "d MMM yyyy — HH:mm 'hs'", { locale: es })}
                    </time>
                    <EstadoBadge estado={c.estado} />
                  </div>

                  {c.motivo_consulta && (
                    <p className="text-xs text-foreground/80 truncate leading-snug">
                      {c.motivo_consulta.length > 70
                        ? c.motivo_consulta.slice(0, 70) + '…'
                        : c.motivo_consulta}
                    </p>
                  )}

                  {c.diagnostico && (
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {c.diagnostico.length > 60
                        ? c.diagnostico.slice(0, 60) + '…'
                        : c.diagnostico}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
