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

export type UserRole = 'medico' | 'secretario'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  roles: UserRole[]         // Roles que pueden ver este item
  badge?: string            // Ej: "Próximamente"
  badgeVariant?: 'default' | 'secondary' | 'outline'
}

export const navItems: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    roles: ['medico', 'secretario'],
  },
  {
    href: '/pacientes',
    label: 'Pacientes',
    icon: Users,
    roles: ['medico', 'secretario'],
  },
  {
    href: '/turnero',
    label: 'Turnero',
    icon: CalendarDays,
    roles: ['medico', 'secretario'],
  },
  {
    href: '/pedidos',
    label: 'Pedidos',
    icon: ClipboardList,
    roles: ['medico', 'secretario'],
  },
  {
    href: '/certificados',
    label: 'Certificados',
    icon: FileText,
    roles: ['medico', 'secretario'],
  },
  {
    href: '/difusion',
    label: 'Difusión',
    icon: Megaphone,
    roles: ['medico'],          // Solo médico
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
