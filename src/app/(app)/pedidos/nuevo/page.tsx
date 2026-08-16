import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolverAcceso } from '@/lib/auth/tenant'
import { PedidoForm } from '@/components/pedidos/pedido-form'

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
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/pedidos"
          className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-muted"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Nuevo Pedido de Estudios</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Emití un pedido de estudios complementarios para un paciente
          </p>
        </div>
      </div>

      <PedidoForm preselectedPacienteId={paciente_id ?? null} />
    </div>
  )
}
