'use server'

import { createClient } from '@/lib/supabase/server'
import { tenantDeProfile } from '@/lib/auth/tenant'
import type { MensajeInterno } from '@/types/mensaje'
import { revalidatePath } from 'next/cache'

/**
 * Obtiene todos los mensajes raíz (sin parent_id) del usuario actual.
 * Retorna threads ordenados por el más reciente.
 *
 * NOTA: Las FK de mensajes_internos apuntan a auth.users (no a profiles),
 * por lo que PostgREST no puede resolver el join inline
 * remitente:remitente_id(full_name, role). Solución: fetch de mensajes
 * sin joins + fetch de profiles por separado + merge manual.
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

  // ⚠ `tenantDeProfile` y no `resolverTenant`: el `profile` de arriba se sigue
  // usando (`acceso_mensajeria`), así que una query interna sería una segunda
  // lectura de la misma fila.
  const medicoId = tenantDeProfile(profile, user.id)
  if (!medicoId) return { threads: [], currentUserId: user.id, error: 'Sin médico vinculado' }

  // Paso 1: mensajes raíz sin join a profiles
  const { data: msgs, error } = await supabase
    .from('mensajes_internos')
    .select('*, lecturas:mensajes_lecturas(user_id, leido_at)')
    .is('parent_id', null)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return { threads: [], currentUserId: user.id, error: error.message }
  if (!msgs || msgs.length === 0) return { threads: [], currentUserId: user.id }

  // Paso 2: perfiles de todos los participantes
  const userIds = [
    ...new Set([
      ...msgs.map((m) => m.remitente_id as string).filter(Boolean),
      ...msgs.map((m) => m.destinatario_id as string).filter(Boolean),
    ]),
  ]

  const { data: perfiles } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('id', userIds)

  const profileMap = new Map((perfiles ?? []).map((p) => [p.id, p]))

  // Paso 3: merge
  const threads = msgs.map((m) => ({
    ...m,
    remitente: profileMap.get(m.remitente_id) ?? null,
    destinatario: m.destinatario_id ? (profileMap.get(m.destinatario_id) ?? null) : null,
  })) as MensajeInterno[]

  return { threads, currentUserId: user.id }
}

/**
 * Obtiene el hilo completo: mensaje raíz + todas sus respuestas cronológicas.
 */
export async function obtenerHilo(parentId: string): Promise<{
  mensajes: MensajeInterno[]
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { mensajes: [], error: 'No autenticado' }

  // Paso 1: traer raíz y respuestas sin joins a profiles
  const { data: raiz, error: raizError } = await supabase
    .from('mensajes_internos')
    .select('*, lecturas:mensajes_lecturas(user_id, leido_at)')
    .eq('id', parentId)
    .single()

  if (raizError || !raiz) return { mensajes: [], error: 'Mensaje no encontrado' }

  const { data: respuestas, error: respError } = await supabase
    .from('mensajes_internos')
    .select('*, lecturas:mensajes_lecturas(user_id, leido_at)')
    .eq('parent_id', parentId)
    .order('created_at', { ascending: true })

  if (respError) return { mensajes: [], error: respError.message }

  const todos = [raiz, ...(respuestas ?? [])]

  // Paso 2: perfiles de todos los participantes
  const userIds = [
    ...new Set([
      ...todos.map((m) => m.remitente_id as string).filter(Boolean),
      ...todos.map((m) => m.destinatario_id as string).filter(Boolean),
    ]),
  ]

  const { data: perfiles } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('id', userIds)

  const profileMap = new Map((perfiles ?? []).map((p) => [p.id, p]))

  // Paso 3: merge
  const mensajes = todos.map((m) => ({
    ...m,
    remitente: profileMap.get(m.remitente_id) ?? null,
    destinatario: m.destinatario_id ? (profileMap.get(m.destinatario_id) ?? null) : null,
  })) as MensajeInterno[]

  return { mensajes }
}

/**
 * Elimina un mensaje por su ID.
 * Si es el mensaje raíz, elimina también todas sus respuestas.
 */
export async function eliminarMensaje(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  // 1. Borrar todas las respuestas de este mensaje si es raíz
  const { error: errorRespuestas } = await supabase
    .from('mensajes_internos')
    .delete()
    .eq('parent_id', id)

  if (errorRespuestas) return { error: errorRespuestas.message }

  // 2. Borrar el mensaje principal
  const { error } = await supabase
    .from('mensajes_internos')
    .delete()
    .eq('id', id)

  if (error) return { error: error.message }

  // Revalidar las páginas
  revalidatePath('/mensajes')
  revalidatePath('/notificaciones')

  return {}
}

