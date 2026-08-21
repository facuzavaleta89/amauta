'use server'

import { createClient } from '@/lib/supabase/server'
import { resolverAcceso, tenantDeProfile } from '@/lib/auth/tenant'
import { uuidSchema } from '@/lib/validations/shared'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { obtenerSolicitudesPendientes } from '@/app/onboarding/actions'
import { MARCADO_SIN_FILAS, type MensajeNoLeido } from '@/types/mensaje'
import { ITEM_TYPE_SOLICITUD, type ItemPendiente } from '@/types/notificacion'

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

  // ⚠ El permiso se le exigía al DESTINATARIO (más abajo) pero no al REMITENTE: un
  // asistente sin `acceso_mensajeria` podía enviar. `resolverAcceso` cubre las dos
  // cosas —permiso y tenant— en la misma query que antes hacía `resolverTenant`.
  const acceso = await resolverAcceso(supabase, user.id, 'acceso_mensajeria')
  if (!acceso.ok) {
    return {
      error: acceso.motivo === 'sin-permiso' ? 'Sin acceso a mensajería'
           : acceso.motivo === 'sin-tenant'  ? 'Sin médico vinculado'
           : 'Perfil no encontrado',
    }
  }
  const medicoId = acceso.tenantMedicoId

  // ⚠ `parent_id` se insertaba TAL CUAL, sin verificar nada. Era la vía para crear un
  // hilo de TRES niveles: la base no lo impide (no hay constraint que prohíba un
  // `parent_id` apuntando a un mensaje que ya tiene padre), pero la UI solo muestra
  // dos —`obtenerHilo` trae la raíz y UN nivel de hijos—, así que un "nieto" quedaba
  // invisible en pantalla y sin embargo `contarMensajesNoLeidos` lo contaba: un badge
  // que no se puede bajar. Se exige que exista, sea del tenant y sea RAÍZ.
  if (parsed.data.parent_id) {
    const { data: padre } = await supabase
      .from('mensajes_internos')
      .select('id, parent_id')
      .eq('id', parsed.data.parent_id)
      .eq('medico_id', medicoId)
      .maybeSingle()

    // Un solo mensaje para las tres causas (no existe / otro tenant / no es raíz):
    // el `parent_id` lo elige el cliente, así que distinguirlas dejaría sondear ids.
    if (!padre || padre.parent_id !== null) {
      return { error: 'El mensaje al que estás respondiendo no existe' }
    }
  }

  // Validar que el destinatario pertenezca al mismo tenant (si es individual)
  if (!parsed.data.es_grupal && parsed.data.destinatario_id) {
    const { data: destProfile } = await supabase
      .from('profiles')
      .select('role, medico_id, acceso_mensajeria')
      .eq('id', parsed.data.destinatario_id)
      .single()

    if (!destProfile) return { error: 'El destinatario no existe' }

    const destMedicoId = tenantDeProfile(destProfile, parsed.data.destinatario_id)

    if (destMedicoId !== medicoId) {
      return { error: 'El destinatario no pertenece al mismo consultorio' }
    }

    // Validar permisos de mensajería del asistente destinatario
    if (destProfile.role === 'asistente' && !destProfile.acceso_mensajeria) {
      return { error: 'El asistente seleccionado no tiene permisos de mensajería' }
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

  revalidatePath('/mensajes')
  revalidatePath('/notificaciones')
  return { error: null }
}

export async function marcarMensajeLeido(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  // ⚠ Mismas guardas que `obtenerHilo`: es la otra superficie de acceso POR ID del
  // dominio. El id llega del cliente, y la RLS `mensajes_ver` no exige
  // `acceso_mensajeria` ni aísla los individuales por tenant.
  // Un id mal formado responde igual que uno ajeno: no se distingue "inválido" de
  // "no tuyo" (misma regla de no filtrar existencia).
  if (!uuidSchema.safeParse(id).success) return { error: 'Mensaje no encontrado' }

  const acceso = await resolverAcceso(supabase, user.id, 'acceso_mensajeria')
  if (!acceso.ok) {
    return {
      error: acceso.motivo === 'sin-permiso' ? 'Sin acceso a mensajería'
           : acceso.motivo === 'sin-tenant'  ? 'Sin médico vinculado'
           : 'Perfil no encontrado',
    }
  }
  const medicoId = acceso.tenantMedicoId

  // Primero verificar si el mensaje es grupal o individual
  // `maybeSingle` y no `single`: "no hay fila" es un caso esperado (id ajeno, de otro
  // tenant, o inexistente), no un error que haya que distinguir.
  const { data: msg } = await supabase
    .from('mensajes_internos')
    .select('es_grupal')
    .eq('id', id)
    .eq('medico_id', medicoId)
    .maybeSingle()

  if (!msg) return { error: 'Mensaje no encontrado' }

  if (msg.es_grupal) {
    // Para grupales: registrar mi lectura en mensajes_lecturas.
    // ⚠ `ignoreDuplicates: true` NO es cosmético: emite
    // `Prefer: resolution=ignore-duplicates` → `INSERT … ON CONFLICT DO NOTHING`.
    // Sin él (merge-duplicates → `ON CONFLICT DO UPDATE`) marcar dos veces el mismo
    // mensaje toma el camino de UPDATE, y `mensajes_lecturas` NO tiene política de
    // UPDATE (solo `lecturas_select_own` e `lecturas_insert_own`, ver schema.sql),
    // así que el reintento fallaba. Y no hay nada que actualizar: la fila es solo
    // la PK (mensaje_id, user_id). Se resuelve sin tocar la base.
    const { error } = await supabase
      .from('mensajes_lecturas')
      .upsert(
        { mensaje_id: id, user_id: user.id },
        { onConflict: 'mensaje_id,user_id', ignoreDuplicates: true }
      )
    if (error) return { error: error.message }
  } else {
    // Para individuales: update leido = true.
    // ⚠ El `.select('id')` NO es decorativo: sin él PostgREST responde 204 con
    // cuerpo vacío y supabase-js devuelve `data: null, error: null`, así que un
    // UPDATE que afecta 0 filas es INDISTINGUIBLE de uno exitoso. Una fila filtrada
    // por RLS en un UPDATE no es un rechazo (no hay error), es una fila que no entra
    // en el conjunto: el silencio era total.
    const { data, error } = await supabase
      .from('mensajes_internos')
      .update({ leido: true, leido_at: new Date().toISOString() })
      .eq('id', id)
      .eq('medico_id', medicoId)   // defensa en profundidad, igual que la lectura de arriba
      .eq('destinatario_id', user.id)
      .select('id')
      .overrideTypes<{ id: string }[], { merge: false }>()
    if (error) return { error: error.message }
    // 0 filas ⇒ ninguna pasó `id + destinatario_id` y la RLS `mensajes_marcar_leido`.
    // En uso normal es inalcanzable (ver el JSDoc de MARCADO_SIN_FILAS), así que
    // viaja como sentinel: el llamador lo loguea sin molestar al usuario con un
    // toast que no puede accionar. Se reusa el `{ error }` que la action ya devuelve
    // para no volver heterogénea su firma inferida.
    if (!data || data.length === 0) return { error: MARCADO_SIN_FILAS }
  }

  revalidatePath('/notificaciones')
  revalidatePath('/mensajes')
  // El contador de los dos badges se calcula en (app)/layout.tsx. Los grupos de
  // rutas no agregan segmento a la URL, así que el layout de `(app)` solo se
  // alcanza invalidando por la raíz — mismo criterio que marcarNotificacionesLeidas.
  revalidatePath('/', 'layout')
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

  // Único consumidor: el selector de destinatarios de `(app)/mensajes/page.tsx`, o sea
  // contexto de mensajería puro — por eso exigir el permiso acá no afecta a nadie más.
  const acceso = await resolverAcceso(supabase, user.id, 'acceso_mensajeria')
  if (!acceso.ok) {
    return {
      data: [],
      error: acceso.motivo === 'sin-permiso' ? 'Sin acceso a mensajería'
           : acceso.motivo === 'sin-tenant'  ? 'Sin médico vinculado'
           : 'Perfil no encontrado',
    }
  }
  const medicoId = acceso.tenantMedicoId

  // Traer: el médico + todos sus asistentes, excluyendo el usuario actual
  const { data: medico } = await supabase
    .from('profiles')
    .select('id, full_name, role, acceso_mensajeria')
    .eq('id', medicoId)
    .single()

  const { data: asistentes } = await supabase
    .from('profiles')
    .select('id, full_name, role, acceso_mensajeria')
    .eq('medico_id', medicoId)
    .eq('role', 'asistente')

  const todos = [
    ...(medico ? [medico] : []),
    ...(asistentes ?? []),
  ].filter((p) => p.id !== user.id)

  return { data: todos, error: null }
}

/** Cuenta mensajes no leídos del usuario actual (individuales + grupales).
 *  Retorna 0 ante cualquier error para no romper el layout de la app. */
export async function contarMensajesNoLeidos(): Promise<number> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 0

    // ⚠ `resolverAcceso` y no `resolverTenant`: suma el chequeo de `acceso_mensajeria`
    // SIN pagar una query extra — las dos leen la MISMA fila de `profiles` una sola
    // vez; la diferencia es que ésta proyecta también los 12 permisos. Ver el análisis
    // de costo en RESPUESTA.md: esta action corre en (app)/layout.tsx, o sea en cada
    // render de cada página, así que un round-trip de más se multiplicaría por toda la app.
    const acceso = await resolverAcceso(supabase, user.id, 'acceso_mensajeria')
    if (!acceso.ok) return 0
    const medicoId = acceso.tenantMedicoId

    // 1) No leídos individuales (destinatario = yo, leido = false)
    // ⚠ El `.eq('medico_id', …)` cierra la incoherencia que abrió el filtro de tenant
    // de la bandeja: sin él, el badge contaba individuales de un tenant ANTERIOR que
    // `obtenerBandeja` ya no lista, y el número no se podía bajar desde la UI.
    const { count: individuales } = await supabase
      .from('mensajes_internos')
      .select('id', { count: 'exact', head: true })
      .eq('medico_id', medicoId)
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
  } catch {
    // Un error en mensajes no debe romper el layout de la app
    return 0
  }
}

/** Últimos mensajes no leídos del usuario (individuales + grupales), para la campanita.
 *  Retorna [] ante cualquier error para no romper el layout de la app. */
export async function obtenerMensajesNoLeidos(): Promise<MensajeNoLeido[]> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    // Mismo criterio que `contarMensajesNoLeidos`: permiso + tenant en UNA query.
    const acceso = await resolverAcceso(supabase, user.id, 'acceso_mensajeria')
    if (!acceso.ok) return []
    const medicoId = acceso.tenantMedicoId

    const cols = 'id, parent_id, asunto, remitente_id, es_grupal, created_at'

    // 1) Individuales no leídos (destinatario = yo, y DEL TENANT — ver el comentario
    //    equivalente en `contarMensajesNoLeidos`: los dos tienen que contar lo mismo,
    //    o el badge y su dropdown se contradicen entre sí.)
    const { data: individuales } = await supabase
      .from('mensajes_internos')
      .select(cols)
      .eq('medico_id', medicoId)
      .eq('destinatario_id', user.id)
      .eq('leido', false)
      .eq('es_grupal', false)
      .order('created_at', { ascending: false })
      .limit(20)

    // 2) Grupales no leídos (del tenant, no míos, sin lectura mía)
    const { data: gruposLeidos } = await supabase
      .from('mensajes_lecturas')
      .select('mensaje_id')
      .eq('user_id', user.id)
    const idsLeidos = (gruposLeidos ?? []).map((r) => r.mensaje_id)

    let gruposQuery = supabase
      .from('mensajes_internos')
      .select(cols)
      .eq('medico_id', medicoId)
      .eq('es_grupal', true)
      .neq('remitente_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
    if (idsLeidos.length > 0) {
      gruposQuery = gruposQuery.not('id', 'in', `(${idsLeidos.join(',')})`)
    }
    const { data: grupales } = await gruposQuery

    const combinados = [...(individuales ?? []), ...(grupales ?? [])]
    if (combinados.length === 0) return []

    // Nombres de remitentes (las FK apuntan a auth.users, así que se traen de profiles aparte)
    const remitenteIds = [...new Set(combinados.map((m) => m.remitente_id).filter(Boolean))]
    const { data: perfiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', remitenteIds)
    const nombreMap = new Map((perfiles ?? []).map((p) => [p.id, p.full_name]))

    return combinados
      .map((m) => ({
        id: m.id,
        thread_id: m.parent_id ?? m.id,
        asunto: m.asunto,
        remitente_nombre: nombreMap.get(m.remitente_id) ?? 'Alguien',
        es_grupal: m.es_grupal,
        created_at: m.created_at,
      }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 15)
  } catch {
    return []
  }
}

// ══════════════════════════════════════════════════════════════════════════
// FUENTE DE VERDAD COMPARTIDA — badge de la campanita + página /notificaciones
// ══════════════════════════════════════════════════════════════════════════
// El badge sumaba `solicitudes + mensajes` y NUNCA leía la tabla `notificaciones`,
// mientras que la página sí la leía: por eso un turno agendado por un asistente
// aparecía en el listado pero no en el número. Para que no vuelvan a divergir,
// cada fuente se lee y se normaliza en UN SOLO lugar, a la forma `ItemPendiente`
// (la que la página ya armaba inline).
//
// Camino elegido: (b) normalizador por fuente + wrappers finos por contexto, en
// vez de (a) una única función con flags. Motivos:
//   · Los dos consumidores no piden "lo mismo filtrado": la página quiere el
//     HISTORIAL de solicitudes + avisos (sin mensajes) y el badge quiere lo NO
//     LEÍDO. Con flags la firma terminaba en (incluirMensajes, incluirSolicitudes,
//     soloNoLeidas): ilegible en el call site y fácil de invocar mal.
//   · Cada wrapper nombra su contexto y documenta su subconjunto en un solo lugar.
//
// ⚠ Por qué NO hay un `obtenerItemsBadge()` que traiga las tres fuentes juntas:
//   el dropdown renderiza solicitudes y mensajes con datos ricos (email del
//   solicitante, thread_id, es_grupal) y sobre todo los MUTA en el cliente por
//   Realtime (notificaciones-bell.tsx). Si el count llegara ya calculado del
//   servidor, un mensaje entrante por Realtime dejaría de incrementarlo. Por eso
//   el count se sigue armando en el cliente y de acá sale solo su tercer sumando.
//   La garantía anti-divergencia no se pierde: la tabla `notificaciones` se lee
//   en UN único lugar (`leerNotificacionesSistema`), que alimenta a los dos.
//
// Nota: no hay normalizador de MENSAJES porque hoy ningún consumidor los pide en
// esta forma (la página los excluye por decisión de producto y el dropdown
// necesita el shape rico de `MensajeNoLeido`). Si alguna vez hacen falta
// normalizados, el lugar es acá, junto a los otros dos.

/** Tope de avisos que viajan al badge. El contador muestra "9+" a partir de 10,
 *  así que un tope alto no cambia lo que se ve y acota el payload del layout.
 *  Mismo criterio que `obtenerMensajesNoLeidos` (que corta en 15). */
const LIMITE_NOTIFICACIONES_BADGE = 20

/**
 * Base: lee y normaliza los avisos del sistema (tabla `notificaciones`).
 * ⚠ ÚNICO lugar del repo que lee esa tabla — si aparece un `tipo` nuevo, entra
 *   por acá y lo ven a la vez el badge y la página.
 *
 * Solo corre para el MÉDICO: la RLS `notificaciones_select` es
 * `medico_id = auth.uid()`, así que para un asistente devolvería siempre vacío
 * (un resultado engañoso, indistinguible de "no hay avisos"). Se corta antes.
 * Devuelve [] ante cualquier error para no romper el layout de la app.
 */
async function leerNotificacionesSistema(
  opts: { soloNoLeidas: boolean; limite?: number }
): Promise<ItemPendiente[]> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data: myProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    // Los avisos son del médico (tenant key = su propio id). Un asistente no los lee.
    if (myProfile?.role !== 'medico') return []

    let query = supabase
      .from('notificaciones')
      .select('id, titulo, mensaje, tipo, leida, payload, created_at')
      .eq('medico_id', user.id)
      .order('created_at', { ascending: false })

    if (opts.soloNoLeidas) query = query.eq('leida', false)
    if (opts.limite) query = query.limit(opts.limite)

    const { data } = await query

    return (data ?? []).map((n) => ({
      id: n.id,
      type: n.tipo,
      title: n.titulo,
      message: n.mensaje,
      date: n.created_at,
      read: n.leida ?? false,   // la columna es nullable con DEFAULT false
      payload: n.payload,
    }))
  } catch {
    return []
  }
}

/**
 * Normaliza las solicitudes de vinculación pendientes (solo las recibe el médico).
 * Reutiliza `obtenerSolicitudesPendientes()` en vez de repetir su query + el
 * enriquecido con nombre/email del solicitante.
 */
async function leerSolicitudesNormalizadas(): Promise<ItemPendiente[]> {
  const { data } = await obtenerSolicitudesPendientes()
  return (data ?? []).map((s) => ({
    id: s.id,
    type: ITEM_TYPE_SOLICITUD,
    title: 'Solicitud de vinculación',
    message: `${s.solicitante_nombre} (${s.solicitante_email}) quiere vincularse como tu asistente.`,
    date: s.created_at,
    read: false,          // una solicitud pendiente es, por definición, algo sin atender
    payload: s,
  }))
}

/**
 * Para la PÁGINA /notificaciones: solicitudes pendientes + avisos del sistema,
 * con el HISTORIAL COMPLETO (leídos y no leídos), ordenado por fecha descendente.
 * Sin mensajes: esos viven en /mensajes (decisión de producto).
 */
export async function obtenerItemsPagina(): Promise<ItemPendiente[]> {
  const [solicitudes, avisos] = await Promise.all([
    leerSolicitudesNormalizadas(),
    leerNotificacionesSistema({ soloNoLeidas: false }),
  ])

  return [...solicitudes, ...avisos].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )
}

/**
 * Para el BADGE de la campanita: avisos del sistema SIN LEER — el tercer sumando
 * del contador, junto a las solicitudes y los mensajes que ya llegan por props.
 * Devuelve [] si el usuario no es el médico.
 */
export async function obtenerNotificacionesNoLeidas(): Promise<ItemPendiente[]> {
  return leerNotificacionesSistema({
    soloNoLeidas: true,
    limite: LIMITE_NOTIFICACIONES_BADGE,
  })
}

/**
 * Marca como leídos TODOS los avisos del sistema del médico actual.
 *
 * Usa el cliente de servidor con la sesión del usuario, NO el admin client: la
 * RLS `notificaciones_update` es `medico_id = auth.uid()`, así que el propio
 * médico puede hacerlo (y un asistente no afecta ninguna fila, aunque llame).
 * Idempotente: si no hay filas sin leer, el UPDATE toca 0 filas y no falla.
 */
export async function marcarNotificacionesLeidas(): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { error } = await supabase
    .from('notificaciones')
    .update({ leida: true })
    .eq('medico_id', user.id)
    .eq('leida', false)

  if (error) return { error: error.message }

  revalidatePath('/notificaciones')
  // El contador del badge se calcula en (app)/layout.tsx. Los grupos de rutas no
  // agregan segmento a la URL, así que el layout de `(app)` se invalida por la
  // raíz: es la única forma de alcanzarlo con revalidatePath. Barato acá porque
  // todas las rutas de la app son dinámicas (dependen de la sesión) y no hay
  // caché de página que perder.
  revalidatePath('/', 'layout')
  return { error: null }
}
