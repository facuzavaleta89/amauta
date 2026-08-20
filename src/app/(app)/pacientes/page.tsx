import { createClient } from '@/lib/supabase/server'
import { resolverAcceso } from '@/lib/auth/tenant'
import { redirect } from 'next/navigation'
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
  const supabase = await createClient()

  // Guard: permiso + tenant en UNA sola lectura de `profiles`. Antes acá iba
  // `verificarPermiso('ver_pacientes')`, que hace exactamente esta misma query por
  // dentro pero devuelve `void`: el `tenantMedicoId` que `resolverAcceso` ya había
  // resuelto se descartaba, y por eso la query de abajo era la única lectura de
  // `pacientes` de la app sin filtro de tenant. Mismos destinos de redirect que las
  // otras páginas migradas (/pedidos/nuevo, /pacientes/nuevo, [id]/estudios…).
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const acceso = await resolverAcceso(supabase, user.id, 'ver_pacientes')
  if (!acceso.ok) {
    if (acceso.motivo === 'sin-permiso') redirect('/sin-acceso')
    if (acceso.motivo === 'sin-tenant') redirect('/dashboard')
    redirect('/login')
  }

  const resolvedParams = await searchParams
  const q = typeof resolvedParams.q === 'string' ? resolvedParams.q : ''
  const obraSocialId = typeof resolvedParams.obra_social_id === 'string' ? resolvedParams.obra_social_id : ''
  const sexo = typeof resolvedParams.sexo === 'string' ? resolvedParams.sexo : ''
  const verArchivados = resolvedParams.archivados === 'true'

  // Escapar caracteres especiales de SQL LIKE para evitar alteraciones en la búsqueda
  // (mismo tratamiento que `GET /api/pacientes` hace sobre este mismo parámetro).
  const qSanitizado = q.slice(0, 100).trim().replace(/[%_\\]/g, (c) => `\\${c}`)

  // Buscar obras sociales para el filtro
  // ⚠ Sin filtro de tenant a propósito: es un catálogo global compartido, no tiene
  // columna de tenant (su RLS es `auth.role() = 'authenticated'`).
  const { data: obrasSociales } = await supabase.from('obras_sociales').select('*').order('nombre')

  // Construir query de pacientes
  // El `.eq('creado_por', …)` es defensa en profundidad: la RLS `pacientes_select` ya
  // exige `creado_por = get_medico_id()`, que resuelve al mismo valor con la misma
  // regla. No cambia qué filas vuelven; suma un segundo guardián, como el resto del
  // repo hace con toda tabla que tenga columna de tenant DIRECTA.
  let query = supabase
    .from('pacientes')
    .select(`
      *,
      obras_sociales ( nombre )
    `)
    .eq('creado_por', acceso.tenantMedicoId)
    .order('created_at', { ascending: false })

  // Por defecto solo activos; el filtro "Mostrar archivados" los incluye.
  if (!verArchivados) {
    query = query.is('archivado_at', null)
  }

  if (qSanitizado) {
    // Busca por DNI exacto o LIKE nombre
    query = query.or(`dni.ilike.%${qSanitizado}%,nombre_completo.ilike.%${qSanitizado}%`)
  }

  if (obraSocialId && obraSocialId !== 'all') {
    query = query.eq('obra_social_id', obraSocialId)
  }

  if (sexo && sexo !== 'all') {
    query = query.eq('sexo', sexo)
  }

  const { data: pacientes, error } = await query

  if (error) {
    console.error('[PacientesPage] Error cargando pacientes:', error)
  }

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
