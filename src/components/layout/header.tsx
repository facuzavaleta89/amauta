'use client'

import { logout } from '@/app/(auth)/actions'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Breadcrumb } from './breadcrumb'
import { NotificacionesBell } from './notificaciones-bell'
import { LogOut, Menu, User } from 'lucide-react'
import type { UserRole } from '@/types/roles'
import type { MensajeNoLeido } from '@/types/mensaje'
import type { ItemPendiente } from '@/types/notificacion'
import Link from 'next/link'

interface Solicitud {
  id: string
  solicitante_nombre: string
  solicitante_email: string
  mensaje: string | null
  created_at: string
}

interface HeaderProps {
  userFullName: string
  userRole: UserRole
  userEmail: string
  userId: string
  medicoId: string | null
  userTitulo?: string | null
  solicitudesPendientes?: Solicitud[]
  mensajesIniciales?: MensajeNoLeido[]
  /** Avisos del sistema sin leer (solo médico) — tercer sumando del badge */
  notificacionesSistema?: ItemPendiente[]
  tieneAccesoMensajeria?: boolean
  onMenuToggle?: () => void
}

export function Header({
  userFullName,
  userRole,
  userEmail,
  userId,
  medicoId,
  userTitulo,
  solicitudesPendientes = [],
  mensajesIniciales = [],
  notificacionesSistema = [],
  tieneAccesoMensajeria = false,
  onMenuToggle,
}: HeaderProps) {
  const displayName = userTitulo ? `${userTitulo} ${userFullName}` : userFullName
  const initials = userFullName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const roleLabel = userRole === 'medico' ? 'Médico' : 'Asistente'

  return (
    <header className="h-14 border-b border-border bg-card/80 backdrop-blur-sm flex items-center gap-3 px-3 sm:px-4 md:px-6 shrink-0">
      {/* ── Hamburguesa (solo móvil) ─────────────────────────── */}
      <button
        id="sidebar-toggle"
        aria-label="Abrir menú"
        onClick={onMenuToggle}
        className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg hover:bg-muted transition-colors shrink-0"
      >
        <Menu className="h-5 w-5 text-muted-foreground" />
      </button>

      {/* ── Breadcrumb ──────────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <Breadcrumb />
      </div>

      {/* ── Acciones ────────────────────────────────────────── */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {/* Campanita unificada — solicitudes + avisos del sistema (médico) +
            mensajes no leídos (médico y asistente con acceso) */}
        {(userRole === 'medico' || tieneAccesoMensajeria) && (
          <NotificacionesBell
            esMedico={userRole === 'medico'}
            userId={userId}
            tenantId={userRole === 'medico' ? userId : (medicoId ?? '')}
            solicitudesIniciales={solicitudesPendientes}
            mensajesIniciales={mensajesIniciales}
            notificacionesSistema={notificacionesSistema}
          />
        )}

        {/* Menú de usuario */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              id="user-menu-trigger"
              className="flex items-center gap-2.5 rounded-lg hover:bg-muted px-2 py-1.5 transition-colors outline-none"
            >
              <div className="hidden sm:block text-right">
                <p className="text-sm font-medium text-foreground leading-none">
                  {displayName}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {roleLabel}
                </p>
              </div>
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div>
                <p className="font-medium text-sm">{displayName}</p>
                <p className="text-xs text-muted-foreground font-normal">{userEmail}</p>
                <p className="text-xs text-primary font-normal mt-0.5">{roleLabel}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuItem asChild className="gap-2 text-sm cursor-pointer">
              <Link href="/perfil">
                <User className="h-4 w-4 text-muted-foreground" />
                Mi perfil
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              id="logout-button"
              className="gap-2 text-sm text-destructive-strong focus:text-destructive-strong cursor-pointer"
              onSelect={async () => {
                await logout()
              }}
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
