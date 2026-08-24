import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { CertificadoDocView } from '@/components/certificados/certificado-pdf'
import { QRVerificacion } from '@/components/shared/qr-verificacion'
import type { Metadata } from 'next'
import type { UserRole, Matricula } from '@/types/roles'
import type { EmisorSnapshot } from '@/types/pedido'

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

  // Datos del médico: del SNAPSHOT congelado al emitir, NO de profiles en vivo.
  // Así el preview coincide siempre con el PDF descargado. Un documento sin snapshot
  // es un bug (tras la migración 028 todos lo tienen): se avisa, no se cae a profiles.
  const emisor = certificado.emisor_snapshot as EmisorSnapshot | null
  const sinEmisor = !emisor

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  const userRole = (profile?.role ?? 'asistente') as UserRole

  const matriculas: Matricula[] = Array.isArray(emisor?.matriculas) ? emisor!.matriculas : []
  const matriculaFormatted = matriculas.length > 0
    ? matriculas.map((m) => `${m.tipo} ${m.numero}`).join('  |  ')
    : null
  const displayName = emisor
    ? (emisor.titulo ? `${emisor.titulo} ${emisor.full_name}` : emisor.full_name)
    : '—'

  return (
    <div className="max-w-4xl space-y-6">
      {/* El QR baja DEBAJO del encabezado. Como `QRVerificacion` es un Server
          Component async y el encabezado vive en `CertificadoDocView` ('use client'),
          el QR viaja como SLOT: un Server Component pasado por prop a un Client
          Component. Renderizarlo adentro del client no es posible. */}
      <CertificadoDocView
        qr={
          <QRVerificacion
            codigo={certificado.codigo_verificacion}
            estado={certificado.estado}
          />
        }
        certificado={certificado}
        medicoNombre={displayName}
        medicoMatricula={matriculaFormatted}
        medicoFirma={emisor?.firma_url ?? null}
        medicoLogo={emisor?.logo_url ?? null}
        sinEmisor={sinEmisor}
        userRole={userRole}
      />
    </div>
  )
}
