import { createClient } from '@/lib/supabase/server'
import { resolverTenant } from '@/lib/auth/tenant'
import { verificarPermiso } from '@/lib/utils/verificar-permiso'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { HistoriaClinicaView } from '@/components/pacientes/consultas/historia-clinica-view'
import { resolverObraSocial, type ConObraSocial } from '@/lib/pacientes/obra-social'
import type { Consulta } from '@/types/consulta'

interface Props {
  params: Promise<{ id: string }>
}

export const metadata: Metadata = {
  title: 'Historia Clínica',
}

export default async function HistoriaClinicaPage({ params }: Props) {
  // Guard: redirecciona a /sin-acceso si es asistente sin permiso ver_historia_clinica
  await verificarPermiso('ver_historia_clinica')

  const { id } = await params
  const supabase = await createClient()

  // Auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  // Perfil y permisos
  const tenantMedicoId = await resolverTenant(supabase, user.id)

  if (!tenantMedicoId) redirect('/dashboard')

  // Paciente
  const { data: paciente, error: pacienteError } = await supabase
    .from('pacientes')
    .select('id, nombre_completo, dni, fecha_nacimiento, obra_social_otro, numero_afiliado, archivado_at, obras_sociales(nombre)')
    .eq('id', id)
    .single()

  if (pacienteError || !paciente) notFound()

  // Consultas iniciales (las primeras 50, orden desc)
  const { data: consultas } = await supabase
    .from('consultas')
    .select('*')
    .eq('paciente_id', id)
    .eq('medico_id', tenantMedicoId)
    .order('fecha_hora', { ascending: false })
    .limit(50)

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.16))]">
      <HistoriaClinicaView
        pacienteId={id}
        paciente={{
          nombre_completo:    paciente.nombre_completo,
          dni:                paciente.dni,
          fecha_nacimiento:   paciente.fecha_nacimiento,
          // ⚠ La aserción reemplaza al cast previo: sin tipos generados de `Database`,
          // supabase-js infiere el embebido como ARRAY y PostgREST devuelve un OBJETO.
          obra_social_nombre: resolverObraSocial(paciente as unknown as ConObraSocial),
          numero_afiliado:    paciente.numero_afiliado ?? null,
        }}
        archivado={Boolean(paciente.archivado_at)}
        initialConsultas={(consultas ?? []) as Consulta[]}
        currentUserId={user.id}
      />
    </div>
  )
}
