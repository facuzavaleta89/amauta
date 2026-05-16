import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DifusionForm } from '@/components/difusion/difusion-form'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, medico_id')
    .eq('id', user.id)
    .single()

  const tenantMedicoId = profile?.role === 'medico' ? user.id : profile?.medico_id
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
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Link
          href={`/difusion/${id}`}
          className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-muted"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Editar Comunicado</h1>
          <p className="text-sm text-muted-foreground mt-0.5 truncate max-w-md">
            {post.titulo}
          </p>
        </div>
      </div>

      <DifusionForm initialData={post} />
    </div>
  )
}
