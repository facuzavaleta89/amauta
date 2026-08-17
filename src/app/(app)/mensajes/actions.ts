'use server'

import { createClient } from '@/lib/supabase/server'
import { tenantDeProfile } from '@/lib/auth/tenant'
import type { MensajeInterno, RespuestaEstadoLectura } from '@/types/mensaje'
import { revalidatePath } from 'next/cache'

/**
 * Obtiene todos los mensajes raíz (sin parent_id) del usuario actual.
 * Retorna threads ordenados por el más reciente, cada uno con la señal
 * `tiene_respuestas_no_leidas` (ver paso 3).
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

  // Paso 3: ¿qué hilos tienen RESPUESTAS no leídas para mí?
  //
  // El paso 1 trae solo RAÍCES, así que el estado de lectura de las respuestas
  // (`parent_id` no nulo) no llegaba nunca al cliente: la bandeja evaluaba el hilo
  // por el estado de su raíz y el indicador no se encendía, aunque el badge global
  // sí contara la respuesta (`contarMensajesNoLeidos` no filtra por `parent_id`).
  // Esta query cierra esa divergencia con UNA señal booleana por hilo.
  //
  // ⚠ Segunda query y NO un embebido `respuestas:mensajes_internos!parent_id(...)`:
  //   el criterio de "no leído" de un mensaje GRUPAL es la AUSENCIA de mi fila en
  //   `mensajes_lecturas`, y PostgREST no expresa un NOT EXISTS como filtro de
  //   recurso embebido (no hay `having count = 0`); resolverlo en la base pediría
  //   una vista/función, o sea una migración. Encima el hint de una FK
  //   AUTORREFERENCIAL es ambiguo en dirección (padre vs. hijos) y `!inner` sobre
  //   una tabla con RLS descarta el PADRE cuando los hijos quedan filtrados.
  const idsRaiz = msgs.map((m) => m.id as string)

  const { data: respuestas, error: respError } = await supabase
    .from('mensajes_internos')
    .select('parent_id, es_grupal, remitente_id, leido, lecturas:mensajes_lecturas(user_id)')
    .in('parent_id', idsRaiz)
    .neq('remitente_id', user.id)   // las mías nunca son "no leídas" para mí
    .overrideTypes<RespuestaEstadoLectura[], { merge: false }>()

  if (respError) {
    // DEGRADA, no rompe: sin la señal la bandeja queda como estaba (sin indicador
    // en las respuestas) pero sigue mostrando las conversaciones, y el badge global
    // —que se calcula aparte, en (app)/layout.tsx— sigue avisando que hay algo sin
    // leer. Contraste DELIBERADO con `buscarSolapamientos` (nota técnica 23), donde
    // el fail-open dejaba pisar un turno: acá el peor caso es un punto que falta.
    console.error('[obtenerBandeja] respuestas no leídas:', respError.message)
  }

  // Mismo criterio que `esNoLeido` en bandeja.tsx, aplicado a las respuestas:
  //   · grupal      → no leída si NO hay fila mía en `mensajes_lecturas`.
  //   · individual  → no leída si `leido = false`. Alcanza con eso porque
  //     `mensajes_ver` (RLS) solo me muestra las individuales donde soy remitente
  //     o destinatario, y las mías ya las descartó el `.neq` de arriba: si la veo y
  //     no la mandé yo, es mía de recibir.
  const hilosConRespuestasNoLeidas = new Set(
    (respuestas ?? [])
      .filter((r) =>
        r.es_grupal
          ? !(r.lecturas ?? []).some((l) => l.user_id === user.id)
          : !r.leido
      )
      .map((r) => r.parent_id)
  )

  // Paso 4: merge
  const threads = msgs.map((m) => ({
    ...m,
    remitente: profileMap.get(m.remitente_id) ?? null,
    destinatario: m.destinatario_id ? (profileMap.get(m.destinatario_id) ?? null) : null,
    tiene_respuestas_no_leidas: hilosConRespuestasNoLeidas.has(m.id),
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

