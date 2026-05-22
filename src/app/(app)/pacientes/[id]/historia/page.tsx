import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { HistoriaClinicaForm } from '@/components/pacientes/historia-clinica-form'

interface Props {
  params: Promise<{ id: string }>
}

export const metadata = {
  title: 'Historia Clínica',
}

export default async function HistoriaClinicaPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  // Verificar permisos del usuario actual
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, puede_ver_historias')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'asistente' && profile?.puede_ver_historias === false) {
    redirect('/dashboard')
  }

  // Buscar paciente
  const { data: paciente, error: pacienteError } = await supabase
    .from('pacientes')
    .select('id, nombre_completo')
    .eq('id', id)
    .single()

  if (pacienteError || !paciente) {
    notFound()
  }

  // Obtener historia clínica si existe
  const { data: historia } = await supabase
    .from('historia_clinica')
    .select('*')
    .eq('paciente_id', id)
    .single()

  return (
    <div className="max-w-5xl mx-auto">
      <HistoriaClinicaForm
        pacienteId={paciente.id}
        pacienteNombre={paciente.nombre_completo}
        initialData={historia}
      />
    </div>
  )
}
