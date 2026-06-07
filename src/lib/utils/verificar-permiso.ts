import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { PermisoKey } from '@/types/roles'

/**
 * Verifica server-side si el usuario actual tiene el permiso dado.
 * - Médicos: siempre tienen acceso.
 * - Asistentes: se verifica el campo booleano en profiles.
 * - No autenticado: redirige a /login.
 *
 * Si no tiene permiso, redirige a /sin-acceso.
 *
 * Uso en page.tsx:
 *   await verificarPermiso('ver_pacientes')
 */
export async function verificarPermiso(permiso: PermisoKey): Promise<void> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select(`role, ${permiso}`)
    .eq('id', user.id)
    .single()

  if (!profile) {
    redirect('/login')
  }

  // Médico tiene acceso total
  if (profile.role === 'medico') return

  // Asistente: verificar el permiso específico
  const tienePermiso = (profile as Record<string, unknown>)[permiso] === true
  if (!tienePermiso) {
    redirect('/sin-acceso')
  }
}
