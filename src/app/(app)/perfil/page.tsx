import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { PerfilForm } from '@/components/perfil/perfil-form'
import type { Matricula, PermisosAsistente } from '@/types/roles'
import { PERMISOS_DEFAULT } from '@/types/roles'

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
      .select(`
        id, full_name, created_at,
        ver_pacientes, editar_pacientes,
        ver_historia_clinica, crear_consultas, finalizar_consultas,
        ver_turnos, gestionar_turnos,
        ver_pedidos, crear_pedidos,
        ver_certificados, crear_certificados,
        acceso_mensajeria
      `)
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
            created_at: a.created_at,
            permisos: {
              ver_pacientes:        a.ver_pacientes        ?? PERMISOS_DEFAULT.ver_pacientes,
              editar_pacientes:     a.editar_pacientes     ?? PERMISOS_DEFAULT.editar_pacientes,
              ver_historia_clinica: a.ver_historia_clinica ?? PERMISOS_DEFAULT.ver_historia_clinica,
              crear_consultas:      a.crear_consultas      ?? PERMISOS_DEFAULT.crear_consultas,
              finalizar_consultas:  a.finalizar_consultas  ?? PERMISOS_DEFAULT.finalizar_consultas,
              ver_turnos:           a.ver_turnos           ?? PERMISOS_DEFAULT.ver_turnos,
              gestionar_turnos:     a.gestionar_turnos     ?? PERMISOS_DEFAULT.gestionar_turnos,
              ver_pedidos:          a.ver_pedidos          ?? PERMISOS_DEFAULT.ver_pedidos,
              crear_pedidos:        a.crear_pedidos        ?? PERMISOS_DEFAULT.crear_pedidos,
              ver_certificados:     a.ver_certificados     ?? PERMISOS_DEFAULT.ver_certificados,
              crear_certificados:   a.crear_certificados   ?? PERMISOS_DEFAULT.crear_certificados,
              acceso_mensajeria:    a.acceso_mensajeria    ?? PERMISOS_DEFAULT.acceso_mensajeria,
            } satisfies PermisosAsistente,
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

  // Normalizar matriculas: la columna puede venir null de Supabase hasta que haya datos
  const matriculas: Matricula[] = Array.isArray(profile.matriculas)
    ? profile.matriculas
    : []

  // Permisos del perfil de usuario (solo relevante si es asistente)
  const permisos: PermisosAsistente = {
    ver_pacientes:        profile.ver_pacientes        ?? PERMISOS_DEFAULT.ver_pacientes,
    editar_pacientes:     profile.editar_pacientes     ?? PERMISOS_DEFAULT.editar_pacientes,
    ver_historia_clinica: profile.ver_historia_clinica ?? PERMISOS_DEFAULT.ver_historia_clinica,
    crear_consultas:      profile.crear_consultas      ?? PERMISOS_DEFAULT.crear_consultas,
    finalizar_consultas:  profile.finalizar_consultas  ?? PERMISOS_DEFAULT.finalizar_consultas,
    ver_turnos:           profile.ver_turnos           ?? PERMISOS_DEFAULT.ver_turnos,
    gestionar_turnos:     profile.gestionar_turnos     ?? PERMISOS_DEFAULT.gestionar_turnos,
    ver_pedidos:          profile.ver_pedidos          ?? PERMISOS_DEFAULT.ver_pedidos,
    crear_pedidos:        profile.crear_pedidos        ?? PERMISOS_DEFAULT.crear_pedidos,
    ver_certificados:     profile.ver_certificados     ?? PERMISOS_DEFAULT.ver_certificados,
    crear_certificados:   profile.crear_certificados   ?? PERMISOS_DEFAULT.crear_certificados,
    acceso_mensajeria:    profile.acceso_mensajeria    ?? PERMISOS_DEFAULT.acceso_mensajeria,
  }

  return (
    <div className="py-2">
      <PerfilForm
        profile={{
          id: profile.id,
          full_name: profile.full_name,
          role: profile.role,
          matriculas,
          titulo: profile.titulo ?? null,
          firma_url: profile.firma_url,
          logo_url: profile.logo_url ?? null,
          medico_id: profile.medico_id,
          permisos,
        }}
        userEmail={user.email ?? ''}
        medicoVinculado={medicoVinculado}
        asistentesIniciales={asistentes}
      />
    </div>
  )
}
