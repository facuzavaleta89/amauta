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
import { NotificacionesMedico } from './notificaciones-medico'
import { LogOut, User } from 'lucide-react'
import type { UserRole } from '@/types/roles'

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
  solicitudesPendientes?: Solicitud[]
}

export function Header({
  userFullName,
  userRole,
  userEmail,
  userId,
  medicoId,
  solicitudesPendientes = [],
}: HeaderProps) {
  const initials = userFullName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const roleLabel =
    userRole === 'medico' ? 'Médico' : 'Asistente'

  return (
    <header className="h-14 border-b border-border bg-card/80 backdrop-blur-sm flex items-center justify-between px-6 shrink-0">
      {/* Breadcrumb */}
      <Breadcrumb />

      {/* Acciones del usuario */}
      <div className="flex items-center gap-2">
        {/* Campana de notificaciones — solo para médicos */}
        {userRole === 'medico' && (
          <NotificacionesMedico
            medicoId={userId}
            solicitudesIniciales={solicitudesPendientes}
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
                  {userFullName}
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
                <p className="font-medium text-sm">{userFullName}</p>
                <p className="text-xs text-muted-foreground font-normal">{userEmail}</p>
                <p className="text-xs text-primary font-normal mt-0.5">{roleLabel}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 text-sm cursor-pointer">
              <User className="h-4 w-4 text-muted-foreground" />
              Mi perfil
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              id="logout-button"
              className="gap-2 text-sm text-destructive focus:text-destructive cursor-pointer"
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
