import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolverAcceso } from '@/lib/auth/tenant'
import { CertificadoForm } from '@/components/certificados/certificado-form'
import PageHeader from '@/components/shared/page-header'

export const metadata = {
  title: 'Nuevo Certificado Médico',
}

interface Props {
  searchParams: Promise<{ paciente_id?: string }>
}

export default async function NuevoCertificadoPage({ searchParams }: Props) {
  const { paciente_id } = await searchParams

  // Guard de apertura: sin `crear_certificados` esta página no se abre, ni siquiera por
  // URL directa. Antes se mostraba el formulario completo y el rechazo llegaba recién al
  // guardar (403 del POST). Mismos destinos que historia/estudios.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const acceso = await resolverAcceso(supabase, user.id, 'crear_certificados')
  if (!acceso.ok) {
    if (acceso.motivo === 'sin-permiso') redirect('/sin-acceso')
    if (acceso.motivo === 'sin-tenant') redirect('/dashboard')
    redirect('/login')
  }

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Nuevo Certificado Médico"
        description="Emití un certificado para un paciente"
        backHref="/certificados"
      />

      <CertificadoForm preselectedPacienteId={paciente_id ?? null} />
    </div>
  )
}
