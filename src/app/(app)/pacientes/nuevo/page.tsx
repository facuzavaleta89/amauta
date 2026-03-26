import { createClient } from '@/lib/supabase/server'
import { PatientForm } from '@/components/pacientes/patient-form'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'

export const metadata = {
  title: 'Nuevo Paciente',
}

export default async function NuevoPacientePage() {
  const supabase = await createClient()

  // Buscar obras sociales para el dropdown
  const { data: obrasSociales } = await supabase.from('obras_sociales').select('*').order('nombre')

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/pacientes"
          className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-muted"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Nuevo Paciente</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Registrá un nuevo paciente en el sistema
          </p>
        </div>
      </div>

      <PatientForm obrasSociales={obrasSociales || []} />
    </div>
  )
}
