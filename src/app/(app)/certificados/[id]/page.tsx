import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { CertificadoDocView } from '@/components/certificados/certificado-pdf'
import { QRVerificacion } from '@/components/shared/qr-verificacion'
import type { Metadata } from 'next'
import type { UserRole, Matricula } from '@/types/roles'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('certificados')
    .select('paciente_nombre, tipo')
    .eq('id', id)
    .single()
  return {
    title: data
      ? `Certificado — ${data.paciente_nombre}`
      : 'Certificado Médico',
  }
}

export default async function CertificadoDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: certificado, error } = await supabase
    .from('certificados')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !certificado) notFound()

  // Cargar datos del médico firmante con admin client para evitar RLS restrictivo sobre perfiles
  const admin = createAdminClient()
  const { data: medico } = await admin
    .from('profiles')
    .select('full_name, titulo, matriculas, firma_url, logo_url')
    .eq('id', certificado.firmado_por)
    .single()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  const userRole = (profile?.role ?? 'asistente') as UserRole

  const matriculas: Matricula[] = Array.isArray(medico?.matriculas) ? medico.matriculas : []
  const matriculaFormatted = matriculas.length > 0
    ? matriculas.map((m) => `${m.tipo} ${m.numero}`).join('  |  ')
    : null
  const displayName = medico
    ? (medico.titulo ? `${medico.titulo} ${medico.full_name}` : medico.full_name)
    : 'Médico'

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <QRVerificacion
        codigo={certificado.codigo_verificacion}
        estado={certificado.estado}
      />
      <CertificadoDocView
        certificado={certificado}
        medicoNombre={displayName}
        medicoMatricula={matriculaFormatted}
        medicoFirma={medico?.firma_url ?? null}
        medicoLogo={medico?.logo_url ?? null}
        userRole={userRole}
      />
    </div>
  )
}
