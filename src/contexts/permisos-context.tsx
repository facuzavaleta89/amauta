'use client'

import { createContext, useContext } from 'react'
import type { PermisosAsistente, PermisoKey } from '@/types/roles'

// ── Tipos del contexto ────────────────────────────────────────

interface PermisosContextValue {
  /** true si el usuario es médico (acceso total sin restricciones) */
  esMedico: boolean
  /** Permisos del asistente — null si es médico */
  permisos: PermisosAsistente | null
  /**
   * Verifica si el usuario actual tiene un permiso.
   * Si es médico siempre retorna true.
   * Si es asistente, consulta el permiso en `permisos`.
   */
  tienePermiso: (key: PermisoKey) => boolean
}

// ── Context ───────────────────────────────────────────────────

const PermisosContext = createContext<PermisosContextValue | null>(null)

// ── Provider ──────────────────────────────────────────────────

interface PermisosProviderProps {
  esMedico: boolean
  permisos: PermisosAsistente | null
  children: React.ReactNode
}

export function PermisosProvider({ esMedico, permisos, children }: PermisosProviderProps) {
  const tienePermiso = (key: PermisoKey): boolean => {
    if (esMedico) return true
    if (!permisos) return false
    return permisos[key] === true
  }

  return (
    <PermisosContext.Provider value={{ esMedico, permisos, tienePermiso }}>
      {children}
    </PermisosContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────

/**
 * Hook para acceder al sistema de permisos del usuario actual.
 * Debe usarse dentro de un componente envuelto en PermisosProvider.
 */
export function usePermisos(): PermisosContextValue {
  const ctx = useContext(PermisosContext)
  if (!ctx) {
    throw new Error('usePermisos debe usarse dentro de <PermisosProvider>')
  }
  return ctx
}

// ── Contexto separado para badge de mensajes no leídos ────────
// Separado del PermisosContext para no causar re-renders globales innecesarios.

interface MensajesContextValue {
  mensajesNoLeidos: number
}

const MensajesContext = createContext<MensajesContextValue>({ mensajesNoLeidos: 0 })

export function MensajesProvider({
  mensajesNoLeidos,
  children,
}: {
  mensajesNoLeidos: number
  children: React.ReactNode
}) {
  return (
    <MensajesContext.Provider value={{ mensajesNoLeidos }}>
      {children}
    </MensajesContext.Provider>
  )
}

export function useMensajes(): MensajesContextValue {
  return useContext(MensajesContext)
}
