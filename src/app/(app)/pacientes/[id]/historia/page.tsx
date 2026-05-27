import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { HistoriaClinicaView } from '@/components/pacientes/consultas/historia-clinica-view'
import type { Consulta } from '@/types/consulta'

interface Props {
  params: Promise<{ id: string }>
}

export const metadata: Metadata = {
  title: 'Historia Clínica',
}

export default async function HistoriaClinicaPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  // Auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  // Perfil y permisos
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, medico_id, puede_ver_historias')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'asistente' && !profile?.puede_ver_historias) {
    redirect('/dashboard')
  }

  const tenantMedicoId =
    profile?.role === 'medico'    ? user.id :
    profile?.role === 'asistente' ? profile?.medico_id :
    null

  if (!tenantMedicoId) redirect('/dashboard')

  // Paciente
  const { data: paciente, error: pacienteError } = await supabase
    .from('pacientes')
    .select('id, nombre_completo, dni, fecha_nacimiento, obra_social_otro, numero_afiliado, obras_sociales(nombre)')
    .eq('id', id)
    .single()

  if (pacienteError || !paciente) notFound()

  // Médico (para el PDF)
  const { data: medicoProfile } = await supabase
    .from('profiles')
    .select('full_name, matricula, firma_url')
    .eq('id', tenantMedicoId)
    .single()

  // Consultas iniciales (las primeras 50, orden desc)
  const { data: consultas } = await supabase
    .from('consultas')
    .select('*')
    .eq('paciente_id', id)
    .eq('medico_id', tenantMedicoId)
    .order('fecha_hora', { ascending: false })
    .limit(50)

  const obrasSociales = paciente.obras_sociales as unknown as { nombre: string } | null

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.16))]">
      <HistoriaClinicaView
        pacienteId={id}
        paciente={{
          nombre_completo:    paciente.nombre_completo,
          dni:                paciente.dni,
          fecha_nacimiento:   paciente.fecha_nacimiento,
          obra_social_nombre: obrasSociales?.nombre ?? paciente.obra_social_otro ?? null,
          numero_afiliado:    paciente.numero_afiliado ?? null,
        }}
        medico={{
          full_name:  medicoProfile?.full_name ?? '',
          matricula:  medicoProfile?.matricula  ?? null,
          firma_url:  medicoProfile?.firma_url  ?? null,
        }}
        initialConsultas={(consultas ?? []) as Consulta[]}
      />
    </div>
  )
}
