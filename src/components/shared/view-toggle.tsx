'use client'

import { LayoutGrid, List } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { ViewMode } from '@/hooks/use-view-mode'

interface ViewToggleProps {
  mode: ViewMode
  onChange: (mode: ViewMode) => void
  className?: string
}

/**
 * Selector de vista mosaico / lista. Controlado: recibe el modo actual y
 * notifica los cambios por `onChange`. La persistencia vive en `useViewMode`.
 */
export function ViewToggle({ mode, onChange, className }: ViewToggleProps) {
  const options: { value: ViewMode; label: string; icon: typeof LayoutGrid }[] = [
    { value: 'grid', label: 'Vista mosaico', icon: LayoutGrid },
    { value: 'list', label: 'Vista lista', icon: List },
  ]

  return (
    <div
      role="group"
      aria-label="Modo de vista"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5',
        className,
      )}
    >
      {options.map(({ value, label, icon: Icon }) => {
        const active = mode === value
        return (
          <button
            key={value}
            type="button"
            aria-label={label}
            aria-pressed={active}
            onClick={() => onChange(value)}
            className={cn(
              'flex items-center justify-center rounded-md p-1.5 transition-colors',
              'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        )
      })}
    </div>
  )
}
