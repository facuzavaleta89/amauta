import { createClient } from '@/lib/supabase/server'
import { resolverAcceso } from '@/lib/auth/tenant'
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

  // Permiso + tenant en UNA sola lectura de `profiles`. Antes eran dos:
  // `verificarPermiso` hacía su propia query y `resolverTenant` otra.
  // Los destinos de redirect son los mismos que antes, uno por motivo.
  const acceso = await resolverAcceso(supabase, user.id, 'ver_historia_clinica')
  if (!acceso.ok) {
    if (acceso.motivo === 'sin-permiso') redirect('/sin-acceso')
    if (acceso.motivo === 'sin-tenant') redirect('/dashboard')
    redirect('/login')
  }
  const tenantMedicoId = acceso.tenantMedicoId

  // Paciente
  // El `.eq('creado_por', …)` es defensa en profundidad: la RLS `pacientes_select` ya
  // exige `creado_por = get_medico_id()`, que resuelve al mismo valor con la misma
  // regla. No cambia qué filas vuelven; suma un segundo guardián, como el resto del
  // repo hace con toda tabla que tenga columna de tenant DIRECTA.
  // ⚠ La columna es `creado_por`, NO `medico_id`: `pacientes` es la excepción del esquema
  // y su tenant key se llama distinto. La query de `consultas` de acá abajo sí usa
  // `medico_id` — las dos están bien, no unificar los nombres.
  const { data: paciente, error: pacienteError } = await supabase
    .from('pacientes')
    // Proyección MÍNIMA: `nombre_completo` es lo único que renderiza HistoriaClinicaView y
    // `archivado_at` alimenta el flag de solo-lectura. Antes traía además dni,
    // fecha_nacimiento, numero_afiliado, obra_social_otro y el join obras_sociales(nombre)
    // para llenar props que nadie leía.
    .select('id, nombre_completo, archivado_at')
    .eq('id', id)
    .eq('creado_por', tenantMedicoId)
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
    // Página de PANTALLA COMPLETA: mismo contenedor que el turnero, palabra por
    // palabra (ver el comentario del <main> en `layout-shell.tsx`).
    // ⚠ `HistoriaClinicaView` también se dimensiona con `h-full`, así que depende del
    // mismo alto definido. El síntoma acá no era una página en blanco sino uno más
    // sutil: la vista crecía con el largo del timeline y scrolleaba la PÁGINA entera en
    // vez de scrollear la columna de consultas (medido: 2560px de alto para 2500px de
    // timeline). Por eso "se veía bien" y estaba mal igual.
    <div className="h-full flex flex-col">
      <HistoriaClinicaView
        pacienteId={id}
        paciente={{ nombre_completo: paciente.nombre_completo }}
        archivado={Boolean(paciente.archivado_at)}
        initialConsultas={(consultas ?? []) as Consulta[]}
        currentUserId={user.id}
      />
    </div>
  )
}
