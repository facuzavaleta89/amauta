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

  // Resumen del envío (leído de difusion_envios). El SELECT queda acotado al tenant por
  // la RLS envios_select. El join a pacientes resuelve el nombre; si el paciente se borró
  // (paciente_id NULL por ON DELETE SET NULL) o no es visible, se cae al email_destino
  // guardado en la fila (snapshot del momento del envío). Solo se consulta si ya se envió.
  let envioResumen: {
    total: number
    ok: number
    fallidos: { paciente_id: string | null; nombre: string | null; email: string | null; error: string | null }[]
  } | null = null

  if (post.estado === 'enviado') {
    const { data: envios } = await supabase
      .from('difusion_envios')
      .select('paciente_id, email_destino, enviado_ok, error_msg, pacientes ( nombre_completo )')
      .eq('post_id', id)
      .order('enviado_ok', { ascending: true }) // fallidos (false) primero
      .order('enviado_at', { ascending: true })

    if (envios && envios.length > 0) {
      const fallidos = envios
        .filter((e) => !e.enviado_ok)
        .map((e) => {
          const pac = e.pacientes as unknown as { nombre_completo: string } | null
          return {
            paciente_id: e.paciente_id,
            nombre: pac?.nombre_completo ?? null,
            email: e.email_destino,
            error: e.error_msg,
          }
        })
      envioResumen = {
        total: envios.length,
        ok: envios.filter((e) => e.enviado_ok).length,
        fallidos,
      }
    }
  }

  // El contenedor de ancho vive acá (regla única de las páginas de detalle); el
  // encabezado lo emite `DifusionPreview` con PageHeader, porque sus acciones
  // (eliminar, editar, configurar envío) son estado de cliente.
  return (
    <div className="max-w-4xl space-y-6">
      <DifusionPreview post={post} envioResumen={envioResumen} />
    </div>
  )
}
