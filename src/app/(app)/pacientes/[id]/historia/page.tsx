import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
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
