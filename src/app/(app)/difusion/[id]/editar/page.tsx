import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DifusionForm } from '@/components/difusion/difusion-form'

export const metadata = {
  title: 'Editar Comunicado — Amauta',
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditarDifusionPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: post, error } = await supabase
    .from('difusion_posts')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !post) {
    notFound()
  }

  return (
    <div className="space-y-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-foreground">Editar Comunicado</h1>
        <p className="text-muted-foreground mt-1 mb-8">
          Modificá el contenido o el estado del post.
        </p>
        <DifusionForm initialData={post} />
      </div>
    </div>
  )
}
