import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LayoutShell } from '@/components/layout/layout-shell'
import type { UserRole } from '@/types/roles'
import { obtenerSolicitudesPendientes } from '@/app/onboarding/actions'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, medico_id')
    .eq('id', user.id)
    .single()

  const userRole = (profile?.role ?? 'asistente') as UserRole
  const userFullName = profile?.full_name ?? user.email ?? 'Usuario'
  const userEmail = user.email ?? ''
  const medicoId = profile?.medico_id as string | null

  // Guard: asistente no vinculado → onboarding obligatorio
  if (userRole === 'asistente' && !medicoId) {
    redirect('/onboarding')
  }

  const { data: solicitudesPendientes } = userRole === 'medico'
    ? await obtenerSolicitudesPendientes()
    : { data: [] }

  return (
    <LayoutShell
      userFullName={userFullName}
      userRole={userRole}
      userEmail={userEmail}
      userId={user.id}
      medicoId={medicoId}
      solicitudesPendientes={solicitudesPendientes ?? []}
    >
      {children}
    </LayoutShell>
  )
}
