'use server'

import { createClient } from '@/lib/supabase/server'
import { resolverAcceso, tenantDeProfile } from '@/lib/auth/tenant'
import { uuidSchema, isValidDateStr } from '@/lib/validations/shared'
import { BANDEJA_PAGINA, BANDEJA_PAGINA_MAX } from '@/constants/mensajes'
import type { MensajeInterno, RespuestaEstadoLectura } from '@/types/mensaje'
import { revalidatePath } from 'next/cache'

/**
 * Respuesta ÚNICA para "el mensaje no existe" y para "existe pero no podés verlo".
 *
 * ⚠ Deliberadamente indistinguibles: estas actions reciben un id ARBITRARIO del
 * cliente, así que dos mensajes distintos dejarían deducir por prueba y error qué ids
 * existen en la instalación. Un id inválido (no-UUID) devuelve lo mismo, por el mismo
 * motivo.
 */
const NO_ENCONTRADO = 'Mensaje no encontrado'

/**
 * Traduce el `motivo` de `resolverAcceso` a los textos que esta pantalla ya usaba,
 * para que las tres actions respondan igual ante la misma causa.
 *
 * ⚠ El orden de los chequeos de `resolverAcceso` es parte de su contrato (perfil →
 * permiso → tenant, ver CLAUDE.md → nota 24): un `'sin-tenant'` garantiza que el
 * permiso YA pasó.
 */
function mensajeDeAcceso(motivo: 'sin-perfil' | 'sin-permiso' | 'sin-tenant'): string {
  return motivo === 'sin-permiso' ? 'Sin acceso a mensajería'
       : motivo === 'sin-tenant'  ? 'Sin médico vinculado'
       : 'Perfil no encontrado'
}

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
export async function obtenerBandeja(opciones?: {
  /** `ultima_actividad_at` (ISO) del último hilo ya cargado. Sin él, primera página. */
  cursor?: string
  /** Tamaño de página. Se acota a [1, BANDEJA_PAGINA_MAX]. */
  limite?: number
}): Promise<{
  threads: MensajeInterno[]
  currentUserId: string
  /** ¿Quedan hilos más viejos por cargar? Lo calcula el truco del `limite + 1`. */
  hayMas: boolean
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { threads: [], currentUserId: '', hayMas: false, error: 'No autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, medico_id, acceso_mensajeria')
    .eq('id', user.id)
    .single()

  if (!profile) return { threads: [], currentUserId: user.id, hayMas: false, error: 'Perfil no encontrado' }

  const isMedico = profile.role === 'medico'
  const tieneAcceso = isMedico || (profile.acceso_mensajeria ?? false)
  if (!tieneAcceso) return { threads: [], currentUserId: user.id, hayMas: false, error: 'Sin acceso a mensajería' }

  // ⚠ `tenantDeProfile` y no `resolverTenant`: el `profile` de arriba se sigue
  // usando (`acceso_mensajeria`), así que una query interna sería una segunda
  // lectura de la misma fila.
  const medicoId = tenantDeProfile(profile, user.id)
  if (!medicoId) return { threads: [], currentUserId: user.id, hayMas: false, error: 'Sin médico vinculado' }

  // ── Validación de los parámetros de paginación ────────────────────────────
  // ⚠ VA DESPUÉS de las guardas de auth/permiso/tenant, no antes: primero se decide
  // SI PUEDE, después QUÉ TRAE. Es el orden que fija el canon de `resolverAcceso`
  // (CLAUDE.md → nota 24) y el que hace que un parámetro corrupto nunca sea la razón
  // por la que alguien sin permiso reciba una respuesta distinta.
  //
  // ⚠ Esta action es invocable por CUALQUIER cliente autenticado, así que el tamaño de
  // página necesita tope duro por arriba y piso por abajo. Mismo patrón que
  // `GET /api/consultas`, la única otra paginación del repo:
  //   const page  = Math.max(1, …);  const limit = Math.min(50, …)
  // Sin el `Math.min`, un `limite: 100000` traería la tabla entera — y con ella TODAS
  // las respuestas de esos hilos en el paso 3, que no tiene límite propio.
  const limite = Math.min(
    BANDEJA_PAGINA_MAX,
    Math.max(1, Math.trunc(opciones?.limite ?? BANDEJA_PAGINA))
  )

  // ⚠ Un cursor inválido DEGRADA A LA PRIMERA PÁGINA, no devuelve error. Es el criterio
  // del repo para los datos de entrada degenerados (mismo que `formatFecha`, que
  // devuelve el texto crudo en vez de lanzar): un parámetro corrupto no debe vaciar la
  // pantalla. `isValidDateStr` es el chequeo de fecha que ya usan los schemas de turnos
  // y pedidos — no se escribe uno nuevo.
  const cursor =
    opciones?.cursor && isValidDateStr(opciones.cursor) ? opciones.cursor : null

  // Paso 1: mensajes raíz sin join a profiles
  //
  // El `.eq('medico_id', …)` es defensa en profundidad: la RLS `mensajes_ver` ya
  // filtra, pero pide MENOS que esta pantalla — sus dos primeras ramas
  // (`remitente_id = auth.uid()`, `destinatario_id = auth.uid()`) NO miran el tenant,
  // así que un individual sobrevive a un cambio de médico. Hasta acá el `medicoId` se
  // calculaba, se validaba y NO se usaba: el aislamiento quedaba entero en la RLS.
  //
  // ⚠ ORDEN por `ultima_actividad_at` (migración 047), no por `created_at`: un hilo
  // viejo con una respuesta nueva tiene que SUBIR. La columna la mantiene un trigger.
  //
  // ⚠ Paginación por KEYSET (`.lt(cursor)`), no por offset. Con una lista ACUMULATIVA
  // en el cliente, el offset DUPLICARÍA hilos: cualquier mensaje nuevo corre la ventana
  // y la página 2 devolvería filas que la 1 ya trajo. El keyset compara contra un valor
  // absoluto. El cursor es SIMPLE (solo la fecha) y no compuesto porque la auditoría
  // previa no encontró ni un empate de `ultima_actividad_at`.
  //
  // ⚠ Se pide UNA FILA DE MÁS (`limite + 1`) para saber si quedan más, en vez de un
  // `count: 'exact'`: el count obliga a Postgres a contar TODAS las filas que matchean
  // en cada página, trabajo que crece con el tenant y que no se necesita — "cargar más"
  // no muestra "página 3 de 17". El +1 cuesta una fila.
  let query = supabase
    .from('mensajes_internos')
    .select('*, lecturas:mensajes_lecturas(user_id, leido_at)')
    .eq('medico_id', medicoId)
    .is('parent_id', null)
    .order('ultima_actividad_at', { ascending: false })
    .limit(limite + 1)

  if (cursor) query = query.lt('ultima_actividad_at', cursor)

  const { data: pagina, error } = await query

  if (error) return { threads: [], currentUserId: user.id, hayMas: false, error: error.message }

  // La fila extra del `limite + 1` NO se devuelve: solo dice que hay más.
  const hayMas = (pagina?.length ?? 0) > limite
  const msgs = (pagina ?? []).slice(0, limite)

  if (msgs.length === 0) return { threads: [], currentUserId: user.id, hayMas: false }

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
    .eq('medico_id', medicoId)      // defensa en profundidad, igual que el paso 1
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

  return { threads, currentUserId: user.id, hayMas }
}

/**
 * Obtiene el hilo completo: mensaje raíz + todas sus respuestas cronológicas.
 *
 * ⚠ Recibe un id ARBITRARIO del cliente (llega del `?hilo=` de la URL), así que es una
 * SUPERFICIE DE ACCESO por id y no puede confiar solo en la RLS: `mensajes_ver` no
 * exige `acceso_mensajeria` y sus ramas de mensajes individuales no miran el tenant.
 * Las guardas de app son las que hacen cumplir las reglas de producto.
 *
 * ⚠ Si el id es de una RESPUESTA, se NORMALIZA a su raíz en vez de rechazarlo —
 * mismo criterio `parent_id ?? id` con el que `obtenerMensajesNoLeidos` arma el
 * `thread_id` de los enlaces de la campanita.
 */
export async function obtenerHilo(parentId: string): Promise<{
  mensajes: MensajeInterno[]
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { mensajes: [], error: 'No autenticado' }

  // El id viene del cliente: se valida con el schema que ya usan los Route Handlers
  // del repo, no con uno nuevo. Un id mal formado responde NO_ENCONTRADO —igual que
  // uno ajeno— para no distinguir "inválido" de "no tuyo".
  if (!uuidSchema.safeParse(parentId).success) {
    return { mensajes: [], error: NO_ENCONTRADO }
  }

  const acceso = await resolverAcceso(supabase, user.id, 'acceso_mensajeria')
  if (!acceso.ok) return { mensajes: [], error: mensajeDeAcceso(acceso.motivo) }
  const medicoId = acceso.tenantMedicoId

  // Paso 1: el mensaje pedido, ACOTADO AL TENANT.
  // `maybeSingle` y no `single`: "no hay fila" es un caso esperado (id ajeno, id
  // inexistente, RLS que filtra) y no un error que haya que distinguir.
  const { data: pedido } = await supabase
    .from('mensajes_internos')
    .select('*, lecturas:mensajes_lecturas(user_id, leido_at)')
    .eq('id', parentId)
    .eq('medico_id', medicoId)
    .maybeSingle()

  if (!pedido) return { mensajes: [], error: NO_ENCONTRADO }

  // Normalización a la raíz: si nos pasaron una respuesta, el hilo es el de su padre.
  // Sin esto la action devolvía esa respuesta COMO SI fuera raíz, con cero hijos.
  let raiz = pedido
  if (pedido.parent_id) {
    const { data: verdadera } = await supabase
      .from('mensajes_internos')
      .select('*, lecturas:mensajes_lecturas(user_id, leido_at)')
      .eq('id', pedido.parent_id)
      .eq('medico_id', medicoId)
      .maybeSingle()

    // ⚠ La raíz puede faltar legítimamente: `parent_id` es `ON DELETE SET NULL`, pero
    // una respuesta cuyo padre se borró queda con `parent_id` NULL, así que llegar acá
    // con un padre inhallable significa que no lo puedo ver. Se devuelve la respuesta
    // sola —es un mensaje que SÍ tengo permitido leer— en vez de negar el acceso.
    if (verdadera) raiz = verdadera
  }

  const { data: respuestas, error: respError } = await supabase
    .from('mensajes_internos')
    .select('*, lecturas:mensajes_lecturas(user_id, leido_at)')
    .eq('parent_id', raiz.id)
    .eq('medico_id', medicoId)
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
 *
 * ⚠ EXCLUSIVO DEL MÉDICO TITULAR. La UI ya mostraba el botón solo a él, pero eso es
 * UX: esta action es invocable por cualquier cliente autenticado, y la RLS
 * `mensajes_borrar` (`remitente_id = auth.uid() OR medico_id = auth.uid()`) dejaba
 * pasar a un asistente borrando SUS PROPIOS mensajes, incluso sin `acceso_mensajeria`.
 */
export async function eliminarMensaje(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  if (!uuidSchema.safeParse(id).success) return { error: NO_ENCONTRADO }

  const acceso = await resolverAcceso(supabase, user.id, 'acceso_mensajeria')
  if (!acceso.ok) return { error: mensajeDeAcceso(acceso.motivo) }

  if (acceso.role !== 'medico') {
    return { error: 'Solo el médico puede eliminar mensajes' }
  }
  const medicoId = acceso.tenantMedicoId

  // ⚠ EL ORDEN NO SE PUEDE INVERTIR, y no es una preferencia: `parent_id` declara
  // `ON DELETE SET NULL`. Si se borrara la raíz primero, Postgres pondría en NULL el
  // `parent_id` de todas sus respuestas ANTES de que el segundo DELETE corriera, y el
  // `.eq('parent_id', id)` no matchearía ninguna: las respuestas quedarían huérfanas
  // y —peor— visibles en la bandeja como hilos nuevos, porque la bandeja lista
  // exactamente las filas con `parent_id IS NULL`.
  //
  // Tampoco se antepone un SELECT de verificación: `mensajes_ver` y `mensajes_borrar`
  // son políticas DISTINTAS, y la primera es más estrecha (el médico no ve un
  // individual entre dos asistentes, pero sí puede borrarlo). Un pre-chequeo por
  // SELECT le sacaría ese alcance sin que nadie lo haya pedido.

  // 1. Respuestas del hilo (0 filas si `id` es una respuesta suelta: no es un error).
  const { error: errorRespuestas } = await supabase
    .from('mensajes_internos')
    .delete()
    .eq('parent_id', id)
    .eq('medico_id', medicoId)

  if (errorRespuestas) return { error: errorRespuestas.message }

  // 2. El mensaje en sí, con GUARDA DE "0 FILAS" (la lección de la migración 033).
  // La RLS filtra EN SILENCIO: sin el `.select()` y este chequeo, un borrado que la
  // base rechaza devolvía `{}` —o sea, éxito— y la UI mostraba "Mensaje eliminado".
  const { data: borrados, error } = await supabase
    .from('mensajes_internos')
    .delete()
    .eq('id', id)
    .eq('medico_id', medicoId)
    .select('id')

  if (error) return { error: error.message }

  if (!borrados || borrados.length === 0) return { error: NO_ENCONTRADO }

  // Revalidar las páginas
  revalidatePath('/mensajes')
  revalidatePath('/notificaciones')
  // ⚠ El contador de los dos badges se calcula en `(app)/layout.tsx`, y los grupos de
  // rutas NO agregan segmento a la URL: ese layout solo se alcanza invalidando por la
  // raíz. Sin esto, borrar un mensaje no leído dejaba el badge alto hasta el próximo
  // refresh completo. Mismo criterio que `marcarMensajeLeido`.
  revalidatePath('/', 'layout')

  return {}
}

