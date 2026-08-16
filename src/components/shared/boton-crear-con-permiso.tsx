'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { usePermisos } from '@/contexts/permisos-context'
import type { PermisoKey } from '@/types/roles'

interface BotonCrearConPermisoProps {
  /** Permiso granular exigido. El médico siempre lo tiene (`tienePermiso` devuelve true). */
  permiso: PermisoKey
  /** Destino cuando el permiso está. */
  href: string
  /** Contenido del botón (ícono + texto), tal cual iría dentro del `<Link>`. */
  children: React.ReactNode
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
  className?: string
  /** Texto del `title` cuando queda deshabilitado. */
  tituloSinPermiso?: string
}

/**
 * Botón de acción que se **deshabilita** cuando el usuario no tiene el permiso, en vez
 * de dejarlo navegar y rebotar contra `/sin-acceso`.
 *
 * ── POR QUÉ EXISTE (y por qué es un Client Component) ───────────────────────
 * Las páginas de listado (`/pedidos`, `/certificados`) son Server Components que **no
 * consultan `profiles`**: su única relación con permisos es `verificarPermiso('ver_…')`,
 * que devuelve `void` y no deja el dato afuera. Grisar desde el servidor habría pedido
 * una query nueva por página. Este componente evita eso: los 12 permisos **ya están en
 * el cliente**, en el `PermisosProvider` que monta el layout de `(app)`.
 *
 * ⚠ Sin permiso se renderiza un `<Button disabled>` **sin `<Link>`**: un `<a>` no se
 * deshabilita con `disabled`, así que hay que sacar el link, no taparlo.
 *
 * ⚠ Es SOLO UX. La autorización real la hacen la página destino (que redirige) y el
 * endpoint (403). Este botón no protege nada por sí mismo.
 */
export function BotonCrearConPermiso({
  permiso,
  href,
  children,
  variant,
  size,
  className,
  tituloSinPermiso,
}: BotonCrearConPermisoProps) {
  const { tienePermiso } = usePermisos()

  if (!tienePermiso(permiso)) {
    return (
      <Button variant={variant} size={size} className={className} disabled title={tituloSinPermiso}>
        {children}
      </Button>
    )
  }

  return (
    <Button asChild variant={variant} size={size} className={className}>
      <Link href={href}>{children}</Link>
    </Button>
  )
}
