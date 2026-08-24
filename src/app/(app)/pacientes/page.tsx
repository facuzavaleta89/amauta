import { createClient } from '@/lib/supabase/server'
import { resolverAcceso } from '@/lib/auth/tenant'
import { redirect } from 'next/navigation'
import { PatientTable } from '@/components/pacientes/patient-table'
import { PatientFilters } from '@/components/pacientes/patient-filters'
import { FILTRO_SIN_OBRA_SOCIAL } from '@/lib/pacientes/obra-social'
import { sanitizarTextoBusqueda } from '@/lib/validations/shared'
import { BotonCrearConPermiso } from '@/components/shared/boton-crear-con-permiso'
import PageHeader from '@/components/shared/page-header'
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

  // Criterio compartido de escapado de LIKE (`sanitizarTextoBusqueda`): lo usan los 4
  // buscadores por nombre/DNI de la app. ⚠ `q` (crudo) queda para la UI; `qSanitizado`
  // es solo para el patrón del `ilike`.
  const qSanitizado = sanitizarTextoBusqueda(q)

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

  if (obraSocialId === FILTRO_SIN_OBRA_SOCIAL) {
    // "Particular / Sin obra social" = AUSENCIA de cobertura, no una fila de catálogo
    // (la homónima que sembraba la 001 se eliminó en la migración 045).
    //
    // ⚠ Las DOS condiciones son necesarias, y la segunda es la que no se ve venir: hay
    // pacientes con `obra_social_id IS NULL` que SÍ tienen obra social, cargada como
    // TEXTO LIBRE en `obra_social_otro` (la vía de escape para las que no están en el
    // catálogo). Filtrar solo por el id nulo los traería, y no son particulares.
    //
    // El criterio es el equivalente EXACTO de lo que hace `resolverObraSocial` para
    // devolver `null`: `obras_sociales?.nombre ?? (obra_social_otro?.trim() || null)`.
    //
    // ⚠ El `.trim()` del helper NO se replica con un `IS NULL` a secas ni con un
    // `eq.` a la cadena vacía: un `obra_social_otro = '   '` (solo espacios) el helper lo
    // colapsa a `null` —o sea, para la app ese paciente NO tiene obra social— y los dos
    // filtros ingenuos lo dejarían afuera. Por eso el segundo término es el operador
    // `match` de PostgREST (el `~` de Postgres, regex POSIX) contra `^\s*$`, que matchea
    // la cadena vacía Y la de solo espacios. `\s` es una escapada válida de las ARE de
    // Postgres, y el patrón no lleva ningún carácter reservado de PostgREST (`,`, `.`,
    // `:`, paréntesis), así que viaja literal dentro del `.or()`.
    //
    // Los dos `.or()` de esta query (éste y el de la búsqueda por texto) se combinan con
    // AND entre sí, que es lo que se busca: PostgREST ANDea los parámetros repetidos.
    query = query
      .is('obra_social_id', null)
      .or('obra_social_otro.is.null,obra_social_otro.match.^\\s*$')
  } else if (obraSocialId && obraSocialId !== 'all') {
    query = query.eq('obra_social_id', obraSocialId)
  }

  if (sexo && sexo !== 'all') {
    query = query.eq('sexo', sexo)
  }

  const { data: pacientes, error } = await query

  if (error) {
    console.error('[PacientesPage] Error cargando pacientes:', error)
  }

  const total = pacientes?.length ?? 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pacientes"
        description="Gestión de pacientes e historia clínica"
      >
        <BotonCrearConPermiso
          permiso="editar_pacientes"
          href="/pacientes/nuevo"
          className="gap-2"
          tituloSinPermiso="Requiere permiso para dar de alta pacientes"
        >
          <PlusCircle className="h-4 w-4" />
          Nuevo Paciente
        </BotonCrearConPermiso>
      </PageHeader>

      <PatientFilters obrasSociales={obrasSociales || []} />

      {/* Contador PERMANENTE: se muestra siempre, no solo cuando hay búsqueda de texto
          (a diferencia de los de /pedidos y /certificados). El número es EXACTO porque
          esta query no tiene `.limit()` ni paginación: `total` es la cantidad real de
          filas que devolvió el filtro, no una página. */}
      <p className="text-sm text-muted-foreground -mt-2" aria-live="polite">
        {total === 1 ? '1 paciente' : `${total} pacientes`}
        {verArchivados && ' (incluye archivados)'}
      </p>

      <PatientTable pacientes={pacientes || []} />
    </div>
  )
}
