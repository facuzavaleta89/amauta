import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { obtenerAsistentes } from './actions'
import { PerfilForm } from '@/components/perfil/perfil-form'
import PageHeader from '@/components/shared/page-header'
import type { Asistente, Matricula, PermisosAsistente } from '@/types/roles'
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

  // 3. Si es médico: Cargar asistentes vinculados.
  // La query (select + filtros + orden + enriquecido de email + normalización de
  // permisos) vive en `obtenerAsistentes()`, que declara este mismo shape: la página
  // la consume en vez de repetirla inline. El guard de rol se mantiene ACÁ —la action
  // no chequea rol— para que la llamada ocurra solo para el médico, igual que antes.
  let asistentes: Asistente[] = []
  let errorAsistentes = false
  if (profile.role === 'medico') {
    const { data, error } = await obtenerAsistentes()
    if (error) {
      errorAsistentes = true
    } else {
      asistentes = data ?? []
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
    <div className="max-w-4xl space-y-6">
      {/* El encabezado vivía dentro de `PerfilForm` (Client Component). Se subió
          acá: es texto estático, no depende de nada del cliente, y así la página
          queda con la misma forma que el resto (contenedor + PageHeader). */}
      <PageHeader
        title="Mi Perfil"
        description="Gestioná tus datos personales, firma digitalizada y accesos de asistentes."
      />
      {errorAsistentes && (
        <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="text-sm text-warning-strong">
            No se pudieron cargar los asistentes. Recargá la página o intentá más tarde.
          </p>
        </div>
      )}
      <PerfilForm
        profile={{
          id: profile.id,
          full_name: profile.full_name,
          role: profile.role,
          dni: profile.dni ?? null,
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
