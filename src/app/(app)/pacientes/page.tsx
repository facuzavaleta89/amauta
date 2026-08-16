import { createClient } from '@/lib/supabase/server'
import { verificarPermiso } from '@/lib/utils/verificar-permiso'
import { PatientTable } from '@/components/pacientes/patient-table'
import { PatientFilters } from '@/components/pacientes/patient-filters'
import { BotonCrearConPermiso } from '@/components/shared/boton-crear-con-permiso'
import { PlusCircle } from 'lucide-react'

export const metadata = {
  title: 'Pacientes',
}

interface PacientesPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function PacientesPage({ searchParams }: PacientesPageProps) {
  // Guard: redirige a /sin-acceso si el asistente no tiene ver_pacientes
  await verificarPermiso('ver_pacientes')

  const supabase = await createClient()


  const resolvedParams = await searchParams
  const q = typeof resolvedParams.q === 'string' ? resolvedParams.q : ''
  const obraSocialId = typeof resolvedParams.obra_social_id === 'string' ? resolvedParams.obra_social_id : ''
  const sexo = typeof resolvedParams.sexo === 'string' ? resolvedParams.sexo : ''
  const verArchivados = resolvedParams.archivados === 'true'

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

  // Por defecto solo activos; el filtro "Mostrar archivados" los incluye.
  if (!verArchivados) {
    query = query.is('archivado_at', null)
  }

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
        <BotonCrearConPermiso
          permiso="editar_pacientes"
          href="/pacientes/nuevo"
          className="gap-2"
          tituloSinPermiso="Requiere permiso para dar de alta pacientes"
        >
          <PlusCircle className="h-4 w-4" />
          Nuevo Paciente
        </BotonCrearConPermiso>
      </div>

      <PatientFilters obrasSociales={obrasSociales || []} />

      <PatientTable pacientes={pacientes || []} />
    </div>
  )
}
