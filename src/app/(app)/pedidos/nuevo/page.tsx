import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { PedidoForm } from '@/components/pedidos/pedido-form'

export const metadata = {
  title: 'Nuevo Pedido de Estudios',
}

interface Props {
  searchParams: Promise<{ paciente_id?: string }>
}

export default async function NuevoPedidoPage({ searchParams }: Props) {
  const { paciente_id } = await searchParams

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
