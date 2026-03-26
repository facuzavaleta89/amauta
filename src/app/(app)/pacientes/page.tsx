import { createClient } from '@/lib/supabase/server'
import { PatientTable } from '@/components/pacientes/patient-table'
import { PatientFilters } from '@/components/pacientes/patient-filters'
import { Button } from '@/components/ui/button'
import { PlusCircle } from 'lucide-react'
import Link from 'next/link'

export const metadata = {
  title: 'Pacientes',
}

interface PacientesPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function PacientesPage({ searchParams }: PacientesPageProps) {
  const supabase = await createClient()

  const resolvedParams = await searchParams
  const q = typeof resolvedParams.q === 'string' ? resolvedParams.q : ''
  const obraSocialId = typeof resolvedParams.obra_social_id === 'string' ? resolvedParams.obra_social_id : ''
  const sexo = typeof resolvedParams.sexo === 'string' ? resolvedParams.sexo : ''

  // Buscar obras sociales para el filtro
  const { data: obrasSociales } = await supabase.from('obras_sociales').select('*').order('nombre')

  // Construir query de pacientes
  let query = supabase
    .from('pacientes')
    .select(`
      *,
      obras_sociales ( nombre )
    `)
    .order('created_at', { ascending: false })

  if (q) {
    // Busca por DNI exacto o LIKE nombre
    query = query.or(`dni.ilike.%${q}%,nombre_completo.ilike.%${q}%`)
  }

  if (obraSocialId && obraSocialId !== 'all') {
    query = query.eq('obra_social_id', obraSocialId)
  }

  if (sexo && sexo !== 'all') {
    query = query.eq('sexo', sexo)
  }

  const { data: pacientes } = await query

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pacientes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestión de pacientes e historia clínica
          </p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/pacientes/nuevo">
            <PlusCircle className="h-4 w-4" />
            Nuevo Paciente
          </Link>
        </Button>
      </div>

      <PatientFilters obrasSociales={obrasSociales || []} />

      <PatientTable pacientes={pacientes || []} />
    </div>
  )
}
