import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { CertificadoDocView } from '@/components/certificados/certificado-pdf'
import type { Metadata } from 'next'
import type { UserRole } from '@/types/roles'

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

  const { data: medico } = await supabase
    .from('profiles')
    .select('full_name, matricula')
    .eq('id', certificado.firmado_por)
    .single()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  const userRole = (profile?.role ?? 'asistente') as UserRole

  return (
    <CertificadoDocView
      certificado={certificado}
      medicoNombre={medico?.full_name ?? 'Médico'}
      medicoMatricula={medico?.matricula ?? null}
      userRole={userRole}
    />
  )
}
