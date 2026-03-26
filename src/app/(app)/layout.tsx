import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import type { UserRole } from '@/constants/nav-items'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  // Verificar sesión al nivel del layout (seguro, server-side)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Obtener el perfil del usuario para el rol y nombre
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  const userFullName = profile?.full_name ?? user.email ?? 'Usuario'
  const userRole = (profile?.role ?? 'secretario') as UserRole
  const userEmail = user.email ?? ''

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar fijo */}
      <Sidebar
        userFullName={userFullName}
        userRole={userRole}
        userEmail={userEmail}
      />

      {/* Contenido principal */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header
          userFullName={userFullName}
          userRole={userRole}
          userEmail={userEmail}
        />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="p-6 animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
