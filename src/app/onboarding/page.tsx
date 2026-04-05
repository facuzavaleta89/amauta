import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obtenerMiSolicitud } from './actions'
import { OnboardingClient } from './onboarding-client'

export const metadata = { title: 'Vincular médico — Amauta' }

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, medico_id, full_name')
    .eq('id', user.id)
    .single()

  const role = profile?.role ?? 'asistente'
  
  // Si ya está vinculado, mandarlo al dashboard
  if (profile?.medico_id) redirect('/dashboard')
  if (role !== 'asistente') redirect('/dashboard')

  // Buscar si ya tiene una solicitud enviada
  const { data: solicitudActual } = await obtenerMiSolicitud()

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <OnboardingClient
        userName={profile?.full_name ?? user.email ?? 'Asistente'}
        solicitudActual={solicitudActual}
      />
    </div>
  )
}
