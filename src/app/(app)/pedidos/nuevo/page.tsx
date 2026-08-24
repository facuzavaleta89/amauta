import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolverAcceso } from '@/lib/auth/tenant'
import { PedidoForm } from '@/components/pedidos/pedido-form'
import PageHeader from '@/components/shared/page-header'

export const metadata = {
  title: 'Nuevo Pedido de Estudios',
}

interface Props {
  searchParams: Promise<{ paciente_id?: string }>
}

export default async function NuevoPedidoPage({ searchParams }: Props) {
  const { paciente_id } = await searchParams

  // Guard de apertura: sin `crear_pedidos` esta página no se abre, ni siquiera por URL
  // directa. Antes se mostraba el formulario completo y el rechazo llegaba recién al
  // guardar (403 del POST). Mismos destinos que historia/estudios.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const acceso = await resolverAcceso(supabase, user.id, 'crear_pedidos')
  if (!acceso.ok) {
    if (acceso.motivo === 'sin-permiso') redirect('/sin-acceso')
    if (acceso.motivo === 'sin-tenant') redirect('/dashboard')
    redirect('/login')
  }

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Nuevo Pedido de Estudios"
        description="Emití un pedido de estudios complementarios para un paciente"
        backHref="/pedidos"
      />

      <PedidoForm preselectedPacienteId={paciente_id ?? null} />
    </div>
  )
}
