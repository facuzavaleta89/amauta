import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  ClipboardList,
  FileText,
  Megaphone,
  Pill,
  NotebookPen,
  Bell,
  MessageSquare,
} from 'lucide-react'
import type { PermisoKey } from '@/types/roles'

export type UserRole = 'medico' | 'asistente'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  roles: UserRole[]         // Roles que pueden ver este item
  /** Permiso requerido para que los asistentes vean este item (médico siempre lo ve) */
  permiso?: PermisoKey
  badge?: string            // Ej: "Próximamente"
  badgeVariant?: 'default' | 'secondary' | 'outline'
  /** Si true, muestra el badge de mensajes no leídos en lugar de un texto estático */
  showMensajesBadge?: boolean
}

export const navItems: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    roles: ['medico', 'asistente'],
    // Dashboard siempre visible (no requiere permiso específico)
  },
  {
    href: '/pacientes',
    label: 'Pacientes',
    icon: Users,
    roles: ['medico', 'asistente'],
    permiso: 'ver_pacientes',
  },
  {
    href: '/turnero',
    label: 'Turnero',
    icon: CalendarDays,
    roles: ['medico', 'asistente'],
    permiso: 'ver_turnos',
  },
  {
    href: '/pedidos',
    label: 'Pedidos',
    icon: ClipboardList,
    roles: ['medico', 'asistente'],
    permiso: 'ver_pedidos',
  },
  {
    href: '/certificados',
    label: 'Certificados',
    icon: FileText,
    roles: ['medico', 'asistente'],
    permiso: 'ver_certificados',
  },
  {
    href: '/difusion',
    label: 'Difusión',
    icon: Megaphone,
    roles: ['medico', 'asistente'],  // Asistente puede crear borradores
    // Sin permiso específico — difusión es visible para todos los asistentes vinculados
  },
  {
    href: '/notas',
    label: 'Notas',
    icon: NotebookPen,
    roles: ['medico', 'asistente'],
    // Sin permiso específico — cada usuario ve solo sus propias notas
  },
  {
    href: '/notificaciones',
    label: 'Notificaciones',
    icon: Bell,
    roles: ['medico'],   // Solo médico (solicitudes de vinculación + sistema)
  },
  {
    href: '/mensajes',
    label: 'Mensajes',
    icon: MessageSquare,
    roles: ['medico', 'asistente'],
    permiso: 'acceso_mensajeria',
    showMensajesBadge: true,
  },
  {
    href: '/recetas',
    label: 'Recetas',
    icon: Pill,
    roles: ['medico'],          // Solo médico
    badge: 'Próx.',
    badgeVariant: 'outline',
  },
]

export function getNavItemsByRole(role: UserRole): NavItem[] {
  return navItems.filter((item) => item.roles.includes(role))
}
