'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Home } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

const routeLabels: Record<string, string> = {
  dashboard: 'Dashboard',
  pacientes: 'Pacientes',
  turnero: 'Turnero',
  pedidos: 'Pedidos',
  certificados: 'Certificados',
  difusion: 'Difusión',
  recetas: 'Recetas',
  nuevo: 'Nuevo',
  nueva: 'Nueva',
  'historia-clinica': 'Historia Clínica',
  historia: 'Historia Clínica',
  estudios: 'Estudios',
  evolucion: 'Evolución',
}

export function Breadcrumb() {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm">
      <Link
        href="/dashboard"
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        <Home className="h-3.5 w-3.5" />
      </Link>
      {segments.map((segment, index) => {
        const href = '/' + segments.slice(0, index + 1).join('/')
        const isLast = index === segments.length - 1
        // Si parece un UUID, mostrar "Detalle"
        const isUuid = /^[0-9a-f-]{36}$/.test(segment)
        const label = isUuid ? 'Detalle' : (routeLabels[segment] ?? segment)

        return (
          <span key={href} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
            {isLast ? (
              <span className={cn('font-medium text-foreground')}>{label}</span>
            ) : (
              <Link
                href={href}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
