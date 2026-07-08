import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LayoutShell } from '@/components/layout/layout-shell'
import type { UserRole, PermisosAsistente } from '@/types/roles'
import { PERMISOS_DEFAULT } from '@/types/roles'
import { obtenerSolicitudesPendientes } from '@/app/onboarding/actions'
import { contarMensajesNoLeidos } from '@/app/(app)/notificaciones/actions'

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
    .select(`
      full_name, role, medico_id, titulo,
      ver_pacientes, editar_pacientes,
      ver_historia_clinica, crear_consultas, finalizar_consultas,
      ver_turnos, gestionar_turnos,
      ver_pedidos, crear_pedidos,
      ver_certificados, crear_certificados,
      acceso_mensajeria
    `)
    .eq('id', user.id)
    .single()

  const userRole = (profile?.role ?? 'asistente') as UserRole
  const userFullName = profile?.full_name ?? user.email ?? 'Usuario'
  const userEmail = user.email ?? ''
  const medicoId = profile?.medico_id as string | null
  const userTitulo = (profile?.titulo as string | null) ?? null

  // Guard: asistente no vinculado → onboarding obligatorio
  if (userRole === 'asistente' && !medicoId) {
    redirect('/onboarding')
  }

  // Cargar permisos: médico = null (acceso total), asistente = sus permisos
  const permisos: PermisosAsistente | null = userRole === 'medico'
    ? null
    : {
        ver_pacientes:        profile?.ver_pacientes        ?? PERMISOS_DEFAULT.ver_pacientes,
        editar_pacientes:     profile?.editar_pacientes     ?? PERMISOS_DEFAULT.editar_pacientes,
        ver_historia_clinica: profile?.ver_historia_clinica ?? PERMISOS_DEFAULT.ver_historia_clinica,
        crear_consultas:      profile?.crear_consultas      ?? PERMISOS_DEFAULT.crear_consultas,
        finalizar_consultas:  profile?.finalizar_consultas  ?? PERMISOS_DEFAULT.finalizar_consultas,
        ver_turnos:           profile?.ver_turnos           ?? PERMISOS_DEFAULT.ver_turnos,
        gestionar_turnos:     profile?.gestionar_turnos     ?? PERMISOS_DEFAULT.gestionar_turnos,
        ver_pedidos:          profile?.ver_pedidos          ?? PERMISOS_DEFAULT.ver_pedidos,
        crear_pedidos:        profile?.crear_pedidos        ?? PERMISOS_DEFAULT.crear_pedidos,
        ver_certificados:     profile?.ver_certificados     ?? PERMISOS_DEFAULT.ver_certificados,
        crear_certificados:   profile?.crear_certificados   ?? PERMISOS_DEFAULT.crear_certificados,
        acceso_mensajeria:    profile?.acceso_mensajeria    ?? PERMISOS_DEFAULT.acceso_mensajeria,
      }

  const { data: solicitudesPendientes } = userRole === 'medico'
    ? await obtenerSolicitudesPendientes()
    : { data: [] }

  // Badge de mensajes no leídos (todos los roles con acceso)
  const tieneAccesoMensajeria = userRole === 'medico' || (profile?.acceso_mensajeria ?? false)
  const mensajesNoLeidos = tieneAccesoMensajeria ? await contarMensajesNoLeidos() : 0

  return (
    <LayoutShell
      userFullName={userFullName}
      userRole={userRole}
      userEmail={userEmail}
      userId={user.id}
      medicoId={medicoId}
      userTitulo={userTitulo}
      permisos={permisos}
      solicitudesPendientes={solicitudesPendientes ?? []}
      mensajesNoLeidos={mensajesNoLeidos}
    >
      {children}
    </LayoutShell>
  )
}
