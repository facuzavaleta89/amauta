'use client'

import { useState, useCallback } from 'react'
import { Sidebar } from './sidebar'
import { Header } from './header'
import type { UserRole } from '@/types/roles'

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
  solicitudesPendientes: Solicitud[]
  children: React.ReactNode
}

export function LayoutShell({
  userFullName,
  userRole,
  userEmail,
  userId,
  medicoId,
  userTitulo,
  solicitudesPendientes,
  children,
}: LayoutShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleClose = useCallback(() => setSidebarOpen(false), [])
  const handleToggle = useCallback(() => setSidebarOpen((prev) => !prev), [])

  return (
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
          onMenuToggle={handleToggle}
        />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="p-3 sm:p-4 md:p-6 animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
