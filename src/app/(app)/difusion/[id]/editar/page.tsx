import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolverTenant } from '@/lib/auth/tenant'
import { DifusionForm } from '@/components/difusion/difusion-form'
import PageHeader from '@/components/shared/page-header'
import type { Metadata } from 'next'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('difusion_posts')
    .select('titulo')
    .eq('id', id)
    .single()
  return { title: data ? `Editar: ${data.titulo} — Amauta` : 'Editar Comunicado — Amauta' }
}

export default async function EditarDifusionPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  // Verificar autenticación y tenant
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const tenantMedicoId = await resolverTenant(supabase, user.id)
  if (!tenantMedicoId) redirect('/onboarding')

  const { data: post, error } = await supabase
    .from('difusion_posts')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !post) notFound()

  // Verificar que el post pertenece al tenant del usuario
  if (post.medico_id !== tenantMedicoId) notFound()

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Editar Comunicado"
        description={post.titulo}
        backHref={`/difusion/${id}`}
      />

      <DifusionForm initialData={post} />
    </div>
  )
}
