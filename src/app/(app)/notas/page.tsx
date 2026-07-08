import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PageHeader from '@/components/shared/page-header'
import { NotasList } from '@/components/notas/notas-list'
import type { Nota } from '@/types/nota'

export const metadata = {
  title: 'Mis Notas',
  description: 'Apuntes y notas de trabajo personales',
}

export default async function NotasPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: notas, error } = await supabase
    .from('notas')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[NotasPage] Error cargando notas:', error)
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Mis Notas"
        description="Apuntes y recordatorios laborales. Solo vos podés ver tus notas."
      />
      <NotasList notas={(notas as Nota[]) ?? []} />
    </div>
  )
}
