'use client'

import { useCallback, useSyncExternalStore } from 'react'

export type ViewMode = 'grid' | 'list'

// Suscriptores del mismo tab (localStorage no dispara 'storage' en la pestaña
// que escribe, así que notificamos manualmente al guardar).
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function subscribe(callback: () => void) {
  listeners.add(callback)
  window.addEventListener('storage', callback) // sincroniza entre pestañas
  return () => {
    listeners.delete(callback)
    window.removeEventListener('storage', callback)
  }
}

/**
 * Recuerda la preferencia de vista (mosaico / lista) de una sección en
 * `localStorage`, bajo la clave indicada.
 *
 * Usa `useSyncExternalStore`: en el servidor y en la hidratación devuelve el
 * default (`getServerSnapshot`), y recién en el cliente lee el valor guardado.
 * React garantiza que no haya hydration mismatch, sin leer `localStorage`
 * durante el render.
 */
export function useViewMode(
  storageKey: string,
  defaultMode: ViewMode = 'grid',
): [ViewMode, (mode: ViewMode) => void] {
  const getSnapshot = useCallback((): ViewMode => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved === 'grid' || saved === 'list') return saved
    } catch {
      // localStorage no disponible: se usa el default
    }
    return defaultMode
  }, [storageKey, defaultMode])

  const getServerSnapshot = useCallback((): ViewMode => defaultMode, [defaultMode])

  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const setMode = useCallback(
    (next: ViewMode) => {
      try {
        localStorage.setItem(storageKey, next)
      } catch {
        // ignorar: la preferencia simplemente no persiste
      }
      notify()
    },
    [storageKey],
  )

  return [mode, setMode]
}
