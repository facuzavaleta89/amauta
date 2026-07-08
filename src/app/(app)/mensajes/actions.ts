'use server'

import { createClient } from '@/lib/supabase/server'
import type { MensajeInterno } from '@/types/mensaje'

/**
 * Obtiene todos los mensajes raíz (sin parent_id) del usuario actual,
 * junto con la cantidad de respuestas en el hilo.
 * Retorna threads ordenados por el mensaje más reciente del hilo.
 */
export async function obtenerBandeja(): Promise<{
  threads: MensajeInterno[]
  currentUserId: string
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { threads: [], currentUserId: '', error: 'No autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, medico_id, acceso_mensajeria')
    .eq('id', user.id)
    .single()

  if (!profile) return { threads: [], currentUserId: user.id, error: 'Perfil no encontrado' }

  const isMedico = profile.role === 'medico'
  const tieneAcceso = isMedico || (profile.acceso_mensajeria ?? false)
  if (!tieneAcceso) return { threads: [], currentUserId: user.id, error: 'Sin acceso a mensajería' }

  const medicoId = isMedico ? user.id : (profile.medico_id ?? '')
  if (!medicoId) return { threads: [], currentUserId: user.id, error: 'Sin médico vinculado' }

  // Traer mensajes raíz (parent_id IS NULL) donde el usuario es remitente o destinatario
  // Para mensajes grupales: cualquiera del tenant los ve
  const { data: msgs, error } = await supabase
    .from('mensajes_internos')
    .select(`
      *,
      remitente:remitente_id(full_name, role),
      destinatario:destinatario_id(full_name, role),
      lecturas:mensajes_lecturas(user_id, leido_at)
    `)
    .is('parent_id', null)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return { threads: [], currentUserId: user.id, error: error.message }

  return {
    threads: (msgs as MensajeInterno[]) ?? [],
    currentUserId: user.id,
  }
}

/**
 * Obtiene el hilo completo: mensaje raíz + todas sus respuestas en orden cronológico.
 */
export async function obtenerHilo(parentId: string): Promise<{
  mensajes: MensajeInterno[]
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { mensajes: [], error: 'No autenticado' }

  // Traer raíz
  const { data: raiz, error: raizError } = await supabase
    .from('mensajes_internos')
    .select(`
      *,
      remitente:remitente_id(full_name, role),
      destinatario:destinatario_id(full_name, role),
      lecturas:mensajes_lecturas(user_id, leido_at)
    `)
    .eq('id', parentId)
    .single()

  if (raizError || !raiz) return { mensajes: [], error: 'Mensaje no encontrado' }

  // Traer respuestas
  const { data: respuestas, error: respError } = await supabase
    .from('mensajes_internos')
    .select(`
      *,
      remitente:remitente_id(full_name, role),
      destinatario:destinatario_id(full_name, role),
      lecturas:mensajes_lecturas(user_id, leido_at)
    `)
    .eq('parent_id', parentId)
    .order('created_at', { ascending: true })

  if (respError) return { mensajes: [raiz as MensajeInterno], error: respError.message }

  return {
    mensajes: [raiz as MensajeInterno, ...((respuestas as MensajeInterno[]) ?? [])],
  }
}
