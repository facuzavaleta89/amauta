import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  ClipboardList,
  FileText,
  Megaphone,
  Pill,
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

