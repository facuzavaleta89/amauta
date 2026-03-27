'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getNavItemsByRole, type UserRole } from '@/constants/nav-items'

interface SidebarProps {
  userFullName: string
  userRole: UserRole
  userEmail: string
}

export function Sidebar({ userFullName, userRole, userEmail }: SidebarProps) {
  const pathname = usePathname()
  const items = getNavItemsByRole(userRole)

  const initials = userFullName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <aside className="flex flex-col h-full w-64 bg-sidebar border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <span className="text-primary-foreground font-bold text-sm">A</span>
        </div>
        <div>
          <p className="font-bold text-foreground text-sm leading-none">AMAUTA</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Gestión médica</p>
        </div>
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Navegación */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-thin">
        {items.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + '/')
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-sidebar-accent text-primary'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
              )}
            >
              <Icon
                className={cn(
                  'h-4 w-4 shrink-0',
                  isActive ? 'text-primary' : 'text-sidebar-foreground/50'
                )}
              />
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <Badge
                  variant={item.badgeVariant ?? 'outline'}
                  className="text-[10px] h-4 px-1.5 font-normal"
                >
                  {item.badge}
                </Badge>
              )}
            </Link>
          )
        })}
      </nav>

      <Separator className="bg-sidebar-border" />

      {/* Usuario */}
      <div className="px-4 py-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{userFullName}</p>
            <p className="text-[11px] text-muted-foreground truncate capitalize">
              {userRole} • {userEmail}
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}
