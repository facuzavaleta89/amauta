import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DifusionPreview } from '@/components/difusion/difusion-preview'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('difusion_posts')
    .select('titulo')
    .eq('id', id)
    .single()
  return {
    title: data ? `${data.titulo} — Amauta Difusión` : 'Comunicado',
  }
}

export default async function DifusionDetailPage({ params }: { params: Promise<{ id: string }> }) {
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

  return <DifusionPreview post={post} />
}
