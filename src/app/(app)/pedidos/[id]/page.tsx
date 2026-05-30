import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { PedidoDocView } from '@/components/pedidos/pedido-pdf'
import type { Metadata } from 'next'
import type { UserRole, Matricula } from '@/types/roles'

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

  // Cargar datos del médico firmante con admin client para evitar RLS restrictivo sobre perfiles
  const admin = createAdminClient()
  const { data: medico } = await admin
    .from('profiles')
    .select('full_name, titulo, matriculas, firma_url, logo_url')
    .eq('id', pedido.firmado_por)
    .single()

  // Rol del usuario actual
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
    <PedidoDocView
      pedido={pedido}
      medicoNombre={displayName}
      medicoMatricula={matriculaFormatted}
      medicoFirma={medico?.firma_url ?? null}
      medicoLogo={medico?.logo_url ?? null}
      userRole={userRole}
    />
  )
}
