'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const mensajeSchema = z.object({
  destinatario_id: z.string().nullable().optional(),
  es_grupal: z.boolean(),
  asunto: z.string().min(1, 'El asunto es requerido').max(200).trim(),
  cuerpo: z.string().min(1, 'El contenido es requerido').trim(),
  parent_id: z.string().uuid().nullable().optional(),
})

export async function enviarMensaje(formData: {
  destinatario_id?: string | null
  es_grupal: boolean
  asunto: string
  cuerpo: string
  parent_id?: string | null
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const parsed = mensajeSchema.safeParse(formData)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // Obtener medico_id del remitente
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, medico_id')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Perfil no encontrado' }

  const medicoId = profile.role === 'medico' ? user.id : profile.medico_id
  if (!medicoId) return { error: 'Sin médico vinculado' }

  // Validar que el destinatario pertenezca al mismo tenant (si es individual)
  if (!parsed.data.es_grupal && parsed.data.destinatario_id) {
    const { data: destProfile } = await supabase
      .from('profiles')
      .select('role, medico_id')
      .eq('id', parsed.data.destinatario_id)
      .single()

    const destMedicoId =
      destProfile?.role === 'medico' ? parsed.data.destinatario_id : destProfile?.medico_id

    if (destMedicoId !== medicoId) {
      return { error: 'El destinatario no pertenece al mismo consultorio' }
    }
  }

  const { error } = await supabase.from('mensajes_internos').insert({
    medico_id: medicoId,
    remitente_id: user.id,
    destinatario_id: parsed.data.es_grupal ? null : parsed.data.destinatario_id ?? null,
    es_grupal: parsed.data.es_grupal,
    asunto: parsed.data.asunto,
    cuerpo: parsed.data.cuerpo,
    parent_id: parsed.data.parent_id ?? null,
  })

  if (error) return { error: error.message }

  revalidatePath('/notificaciones')
  return { error: null }
}

export async function marcarMensajeLeido(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  // Primero verificar si el mensaje es grupal o individual
  const { data: msg } = await supabase
    .from('mensajes_internos')
    .select('es_grupal')
    .eq('id', id)
    .single()

  if (!msg) return { error: 'Mensaje no encontrado' }

  if (msg.es_grupal) {
    // Para grupales: insertar en mensajes_lecturas (upsert para idempotencia)
    const { error } = await supabase
      .from('mensajes_lecturas')
      .upsert({ mensaje_id: id, user_id: user.id }, { onConflict: 'mensaje_id,user_id' })
    if (error) return { error: error.message }
  } else {
    // Para individuales: update leido = true
    const { error } = await supabase
      .from('mensajes_internos')
      .update({ leido: true, leido_at: new Date().toISOString() })
      .eq('id', id)
      .eq('destinatario_id', user.id)
    if (error) return { error: error.message }
  }

  revalidatePath('/notificaciones')
  return { error: null }
}

/**
 * Retorna todos los usuarios del mismo tenant para el selector de destinatarios.
 * Incluye el médico y todos sus asistentes, excluyendo al usuario actual.
 */
export async function obtenerUsuariosTenant() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [], error: 'No autenticado' }

  const { data: myProfile } = await supabase
    .from('profiles')
    .select('role, medico_id')
    .eq('id', user.id)
    .single()

  if (!myProfile) return { data: [], error: 'Perfil no encontrado' }

  const medicoId = myProfile.role === 'medico' ? user.id : myProfile.medico_id
  if (!medicoId) return { data: [], error: 'Sin médico vinculado' }

  // Traer: el médico + todos sus asistentes, excluyendo el usuario actual
  const { data: medico } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', medicoId)
    .single()

  const { data: asistentes } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('medico_id', medicoId)
    .eq('role', 'asistente')

  const todos = [
    ...(medico ? [medico] : []),
    ...(asistentes ?? []),
  ].filter((p) => p.id !== user.id)

  return { data: todos, error: null }
}

/** Cuenta mensajes no leídos del usuario actual (individuales + grupales) */
export async function contarMensajesNoLeidos(): Promise<number> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const { data: myProfile } = await supabase
    .from('profiles')
    .select('role, medico_id')
    .eq('id', user.id)
    .single()

  const medicoId = myProfile?.role === 'medico' ? user.id : myProfile?.medico_id
  if (!medicoId) return 0

  // 1) No leídos individuales (destinatario = yo, leido = false)
  const { count: individuales } = await supabase
    .from('mensajes_internos')
    .select('id', { count: 'exact', head: true })
    .eq('destinatario_id', user.id)
    .eq('leido', false)
    .eq('es_grupal', false)

  // 2) Grupales no leídos (del tenant, donde NO hay lectura mía)
  const { data: gruposLeidos } = await supabase
    .from('mensajes_lecturas')
    .select('mensaje_id')
    .eq('user_id', user.id)

  const idsLeidos = (gruposLeidos ?? []).map((r) => r.mensaje_id)

  let gruposQuery = supabase
    .from('mensajes_internos')
    .select('id', { count: 'exact', head: true })
    .eq('medico_id', medicoId)
    .eq('es_grupal', true)
    .neq('remitente_id', user.id) // no contar los que yo envié

  if (idsLeidos.length > 0) {
    gruposQuery = gruposQuery.not('id', 'in', `(${idsLeidos.join(',')})`)
  }

  const { count: grupales } = await gruposQuery

  return (individuales ?? 0) + (grupales ?? 0)
}
