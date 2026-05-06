import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { PedidoDocView } from '@/components/pedidos/pedido-pdf'
import type { Metadata } from 'next'
import type { UserRole } from '@/types/roles'

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

  // Cargar datos del médico firmante
  const { data: medico } = await supabase
    .from('profiles')
    .select('full_name, matricula')
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

  return (
    <PedidoDocView
      pedido={pedido}
      medicoNombre={medico?.full_name ?? 'Médico'}
      medicoMatricula={medico?.matricula ?? null}
      userRole={userRole}
    />
  )
}
