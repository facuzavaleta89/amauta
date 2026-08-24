import { createClient } from '@/lib/supabase/server'
import { resolverAcceso } from '@/lib/auth/tenant'
import { redirect } from 'next/navigation'
import { PatientForm } from '@/components/pacientes/patient-form'
import PageHeader from '@/components/shared/page-header'

export const metadata = {
  title: 'Nuevo Paciente',
}

export default async function NuevoPacientePage() {
  const supabase = await createClient()

  // Guard de apertura: sin `editar_pacientes` esta página no se abre, ni siquiera por URL
  // directa. Antes se mostraba el formulario completo y el rechazo llegaba recién al
  // guardar. ⚠ El permiso del ALTA es `editar_pacientes`: no existe un `crear_pacientes`,
  // y es el mismo que exige la RLS `pacientes_insert`. Mismos destinos que /pedidos/nuevo.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const acceso = await resolverAcceso(supabase, user.id, 'editar_pacientes')
  if (!acceso.ok) {
    if (acceso.motivo === 'sin-permiso') redirect('/sin-acceso')
    if (acceso.motivo === 'sin-tenant') redirect('/dashboard')
    redirect('/login')
  }

  // Buscar obras sociales para el dropdown (después de la guarda: si no ve el form,
  // no hace falta cargar el catálogo).
  const { data: obrasSociales } = await supabase.from('obras_sociales').select('*').order('nombre')

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Nuevo Paciente"
        description="Registrá un nuevo paciente en el sistema"
        backHref="/pacientes"
      />

      <PatientForm obrasSociales={obrasSociales || []} />
    </div>
  )
}
