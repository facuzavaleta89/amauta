import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { PerfilForm } from '@/components/perfil/perfil-form'

export const metadata = {
  title: 'Mi Perfil — Amauta',
  description: 'Gestión de perfil profesional, firma digitalizada y asistentes de consultorio.',
}

export default async function PerfilPage() {
  const supabase = await createClient()

  // 1. Obtener usuario de autenticación
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    notFound()
  }

  // 2. Obtener perfil de la base de datos
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    notFound()
  }

  // 3. Si es médico: Cargar asistentes vinculados
  let asistentes: any[] = []
  if (profile.role === 'medico') {
    const { data: rawAsistentes } = await supabase
      .from('profiles')
      .select('id, full_name, puede_ver_historias, puede_editar_agenda, created_at')
      .eq('role', 'asistente')
      .eq('medico_id', user.id)
      .order('full_name')

    if (rawAsistentes && rawAsistentes.length > 0) {
      // Enriquecer con emails de Auth (requiere admin client)
      const admin = createAdminClient()
      asistentes = await Promise.all(
        rawAsistentes.map(async (a) => {
          const { data: authData } = await admin.auth.admin.getUserById(a.id)
          return {
            id: a.id,
            full_name: a.full_name,
            email: authData?.user?.email ?? 'Sin email',
            puede_ver_historias: a.puede_ver_historias ?? true,
            puede_editar_agenda: a.puede_editar_agenda ?? true,
            created_at: a.created_at,
          }
        })
      )
    }
  }

  // 4. Si es asistente: Cargar datos básicos del médico vinculado
  let medicoVinculado: { full_name: string; email: string } | null = null
  if (profile.role === 'asistente' && profile.medico_id) {
    const { data: medicoProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', profile.medico_id)
      .single()

    if (medicoProfile) {
      const admin = createAdminClient()
      const { data: medicoAuth } = await admin.auth.admin.getUserById(profile.medico_id)
      medicoVinculado = {
        full_name: medicoProfile.full_name,
        email: medicoAuth?.user?.email ?? '',
      }
    }
  }

  return (
    <div className="py-2">
      <PerfilForm
        profile={{
          id: profile.id,
          full_name: profile.full_name,
          role: profile.role,
          matricula: profile.matricula,
          firma_url: profile.firma_url,
          puede_ver_historias: profile.puede_ver_historias ?? true,
          puede_editar_agenda: profile.puede_editar_agenda ?? true,
          medico_id: profile.medico_id,
        }}
        userEmail={user.email ?? ''}
        medicoVinculado={medicoVinculado}
        asistentesIniciales={asistentes}
      />
    </div>
  )
}
