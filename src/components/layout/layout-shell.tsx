'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from './sidebar'
import { Header } from './header'
import { PermisosProvider, MensajesProvider } from '@/contexts/permisos-context'
import type { UserRole, PermisosAsistente } from '@/types/roles'
import type { MensajeNoLeido } from '@/types/mensaje'
import type { ItemPendiente } from '@/types/notificacion'
import { createClient } from '@/lib/supabase/client'

interface Solicitud {
  id: string
  solicitante_nombre: string
  solicitante_email: string
  mensaje: string | null
  created_at: string
}

interface LayoutShellProps {
  userFullName: string
  userRole: UserRole
  userEmail: string
  userId: string
  medicoId: string | null
  userTitulo: string | null
  permisos: PermisosAsistente | null
  solicitudesPendientes: Solicitud[]
  mensajesNoLeidos: number
  mensajesIniciales: MensajeNoLeido[]
  /** Avisos del sistema sin leer (solo médico) — tercer sumando del badge */
  notificacionesSistema: ItemPendiente[]
  children: React.ReactNode
}

export function LayoutShell({
  userFullName,
  userRole,
  userEmail,
  userId,
  medicoId,
  userTitulo,
  permisos,
  solicitudesPendientes,
  mensajesNoLeidos,
  mensajesIniciales,
  notificacionesSistema,
  children,
}: LayoutShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const router = useRouter()

  const handleClose = useCallback(() => setSidebarOpen(false), [])
  const handleToggle = useCallback(() => setSidebarOpen((prev) => !prev), [])

  // Realtime: si el médico cambia los permisos del asistente,
  // refrescar la página para que el contexto se actualice.
  useEffect(() => {
    if (userRole !== 'asistente') return

    const supabase = createClient()
    const channel = supabase
      .channel(`permisos-asistente-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        () => {
          // Permisos cambiados → refrescar Server Components
          router.refresh()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, userRole, router])

  return (
    <PermisosProvider esMedico={userRole === 'medico'} permisos={permisos}>
      <MensajesProvider mensajesNoLeidos={mensajesNoLeidos}>
        <div className="flex h-dvh overflow-hidden bg-background">
          {/* ── Backdrop móvil ─────────────────────────────────────── */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
              onClick={handleClose}
              aria-hidden="true"
            />
          )}

          {/* ── Sidebar ────────────────────────────────────────────── */}
          <Sidebar
            userFullName={userFullName}
            userRole={userRole}
            userEmail={userEmail}
            userTitulo={userTitulo}
            open={sidebarOpen}
            onClose={handleClose}
          />

          {/* ── Contenido principal ────────────────────────────────── */}
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            <Header
              userFullName={userFullName}
              userRole={userRole}
              userEmail={userEmail}
              userId={userId}
              medicoId={medicoId}
              userTitulo={userTitulo}
              solicitudesPendientes={solicitudesPendientes}
              mensajesIniciales={mensajesIniciales}
              notificacionesSistema={notificacionesSistema}
              tieneAccesoMensajeria={userRole === 'medico' || (permisos?.acceso_mensajeria ?? false)}
              onMenuToggle={handleToggle}
            />
            <main className="flex-1 overflow-y-auto scrollbar-thin">
              <div className="p-3 sm:p-4 md:p-6 animate-fade-in">
                {children}
              </div>
            </main>
          </div>
        </div>
      </MensajesProvider>
    </PermisosProvider>
  )
}

