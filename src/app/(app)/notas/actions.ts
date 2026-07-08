'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const notaSchema = z.object({
  titulo: z.string().min(1, 'El título es requerido').max(200, 'Máximo 200 caracteres').trim(),
  cuerpo: z.string().max(10000).default(''),
})

export async function crearNota(formData: { titulo: string; cuerpo: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const parsed = notaSchema.safeParse(formData)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { error } = await supabase.from('notas').insert({
    user_id: user.id,
    titulo: parsed.data.titulo,
    cuerpo: parsed.data.cuerpo,
  })

  if (error) return { error: error.message }

  revalidatePath('/notas')
  return { error: null }
}

export async function actualizarNota(
  id: string,
  formData: { titulo: string; cuerpo: string }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const parsed = notaSchema.safeParse(formData)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { error } = await supabase
    .from('notas')
    .update({ titulo: parsed.data.titulo, cuerpo: parsed.data.cuerpo })
    .eq('id', id)
    .eq('user_id', user.id) // doble seguridad además del RLS

  if (error) return { error: error.message }

  revalidatePath('/notas')
  return { error: null }
}

export async function eliminarNota(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { error } = await supabase
    .from('notas')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id) // doble seguridad además del RLS

  if (error) return { error: error.message }

  revalidatePath('/notas')
  return { error: null }
}
