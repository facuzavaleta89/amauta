import React from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

interface PageHeaderProps {
  title: string
  description?: string
  /**
   * Ruta del enlace "volver". Cuando está presente se renderiza a la IZQUIERDA
   * del bloque de título un <Link> con el ícono ChevronLeft.
   *
   * ⚠ Es una RUTA FIJA a propósito: no acepta navegación al historial
   * (`router.back()`). Un back-link que depende del historial no se puede
   * expresar acá y queda del lado de la página (ver RESPUESTA.md).
   *
   * Cuando NO se pasa, el encabezado queda exactamente como estaba antes de
   * existir esta prop: un único <div> con el h1 y la descripción.
   */
  backHref?: string
  /** Acciones del encabezado (botones, badges de estado). Van a la derecha. */
  children?: React.ReactNode
}

/**
 * Encabezado ÚNICO de las páginas del área autenticada (`src/app/(app)/**`).
 *
 * ⚠ No lleva ícono decorativo junto al título: es una decisión de producto, no
 * una limitación de la API. Si aparece la tentación de agregar uno, es un
 * cambio de producto, no un detalle de componente.
 */
export default function PageHeader({ title, description, backHref, children }: PageHeaderProps) {
  const tituloBloque = (
    <div>
      <h1 className="text-2xl font-bold text-foreground">{title}</h1>
      {description && (
        <p className="text-sm text-muted-foreground mt-1">
          {description}
        </p>
      )}
    </div>
  )

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      {backHref ? (
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={backHref}
            aria-label="Volver"
            title="Volver"
            className="shrink-0 p-2 -ml-2 rounded-full text-muted-foreground transition-colors hover:text-foreground hover:bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          {tituloBloque}
        </div>
      ) : (
        tituloBloque
      )}
      {children && (
        <div className="flex items-center gap-2">
          {children}
        </div>
      )}
    </div>
  )
}
