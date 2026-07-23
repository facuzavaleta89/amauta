import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { PedidoDocView } from '@/components/pedidos/pedido-pdf'
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
    .from('pedidos')
    .select('paciente_nombre, fecha_pedido')
    .eq('id', id)
    .single()
  return {
    title: data
      ? `Pedido — ${data.paciente_nombre}`
      : 'Pedido de Estudios',
  }
}

export default async function PedidoDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  // Cargar el pedido
  const { data: pedido, error } = await supabase
    .from('pedidos')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !pedido) notFound()

  // Datos del médico: del SNAPSHOT congelado al emitir, NO de profiles en vivo.
  // Así el preview coincide siempre con el PDF descargado. Un documento sin snapshot
  // es un bug (tras la migración 028 todos lo tienen): se avisa, no se cae a profiles.
  const emisor = pedido.emisor_snapshot as EmisorSnapshot | null
  const sinEmisor = !emisor

  // Rol del usuario actual
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
    <div className="max-w-3xl mx-auto space-y-4">
      <QRVerificacion
        codigo={pedido.codigo_verificacion}
        estado={pedido.estado}
      />
      <PedidoDocView
        pedido={pedido}
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
