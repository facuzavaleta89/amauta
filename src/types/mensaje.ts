// ============================================================
// mensaje.ts
// Tipos de mensajería interna asíncrona
// ============================================================

import type { UserRole } from './roles'

/**
 * Sentinel del `{ error }` de `marcarMensajeLeido` (rama INDIVIDUAL) cuando el
 * UPDATE **no afectó ninguna fila**: ninguna pasó `id = <id> AND destinatario_id =
 * <yo>` más la RLS `mensajes_marcar_leido`.
 *
 * Es una ANOMALÍA, no un error de uso: el UPDATE no filtra por `leido = false`, así
 * que re-marcar un mensaje ya leído afecta 1 fila igual, y `mensajes_ver` solo
 * muestra individuales donde soy remitente o destinatario. Si aparece, es deriva de
 * RLS o dato inconsistente — algo que el usuario no puede resolver. Por eso el
 * llamador lo manda a `console.error` **sin toast**, a diferencia de un error real.
 *
 * ⚠ Vive acá y no en la action porque `notificaciones/actions.ts` es un módulo
 * `'use server'`: solo puede exportar funciones async. Mismo criterio que
 * `ITEM_TYPE_SOLICITUD` en `notificacion.ts` — un sentinel compartido entre el
 * productor y quien lo reconoce, en UN solo lugar, para que no se dupliquen dos
 * strings que pueden divergir en silencio (la lección de `DIFUSION_LIMITE_DIARIO`).
 * El texto es legible a propósito: si algún llamador futuro lo mostrara, se entiende.
 */
export const MARCADO_SIN_FILAS = 'marcado-sin-filas: el UPDATE no afectó ninguna fila'

/**
 * Registro de lectura de un mensaje grupal (tabla `mensajes_lecturas`).
 * Refleja la PROYECCIÓN que trae el join embebido, no la tabla completa: el select
 * es `lecturas:mensajes_lecturas(user_id, leido_at)` (ver mensajes/actions.ts), así
 * que `mensaje_id` (parte de la PK compuesta) no viaja. Además, el update optimista
 * en `bandeja.tsx` construye estos registros con solo estos dos campos.
 */
export interface MensajeLectura {
  user_id: string
  leido_at: string
}

export interface MensajeInterno {
  id: string
  medico_id: string
  remitente_id: string
  destinatario_id: string | null  // null si es_grupal = true
  es_grupal: boolean
  asunto: string
  cuerpo: string
  /** Para mensajes individuales: si el destinatario lo leyó */
  leido: boolean
  leido_at: string | null
  /** Referencia al mensaje original si es una respuesta */
  parent_id: string | null
  created_at: string
  /**
   * Fecha del último mensaje del HILO — columna real (migración 047), no calculada.
   *
   * ⚠ Solo es significativa en los mensajes RAÍZ (`parent_id === null`), que son los
   * que lista la bandeja: en una respuesta vale su propio `created_at` y no se lee.
   * La mantiene el trigger `mensajes_actividad_trigger`, que la sube al insertar una
   * respuesta. **No se recalcula al borrar**, a propósito (ver la migración).
   *
   * Es la columna por la que la bandeja ORDENA y el valor que alimenta el CURSOR de la
   * paginación por keyset (`obtenerBandeja`).
   */
  ultima_actividad_at: string
  // Joins opcionales
  remitente?: { full_name: string; role: UserRole } | null
  destinatario?: { full_name: string; role: UserRole } | null
  /** Para mensajes grupales: registros de lectura por usuario */
  lecturas?: MensajeLectura[]
  /**
   * ⚠ NO es una columna: lo CALCULA `obtenerBandeja()` (mensajes/actions.ts) para
   * cada hilo raíz — `true` si el hilo tiene al menos una respuesta (`parent_id`
   * no nulo) sin leer por el usuario actual.
   *
   * Existe porque la bandeja pinta HILOS pero su query trae solo RAÍCES: sin esta
   * señal el estado de lectura de las respuestas no llegaba al cliente y el
   * indicador de no-leído no se encendía, aunque el badge global sí las contara.
   *
   * Opcional a propósito: los demás productores del tipo (`obtenerHilo`, el
   * optimista de `bandeja.tsx`, el insert de `enviarMensaje`) no la calculan, y
   * `undefined` se lee como "sin señal" = `false`.
   */
  tiene_respuestas_no_leidas?: boolean
}

/**
 * Proyección MÍNIMA para decidir si una RESPUESTA está no leída para el usuario
 * actual. La produce y consume solo el paso 3 de `obtenerBandeja()`
 * (`src/app/(app)/mensajes/actions.ts`); su `select` es
 * `parent_id, es_grupal, remitente_id, leido, lecturas:mensajes_lecturas(user_id)`.
 *
 * ⚠ No es intercambiable con `MensajeInterno`: no trae `id`, `asunto`, `cuerpo`,
 * `medico_id` ni `created_at`. Si otro endpoint necesita el estado de lectura de
 * las respuestas con más campos, va un tipo propio (ver el ⚠ del mapa de tipos en
 * CLAUDE.md: el shape de un join lo fija cada endpoint, no la tabla).
 */
export interface RespuestaEstadoLectura {
  parent_id: string
  es_grupal: boolean
  remitente_id: string
  leido: boolean
  lecturas: { user_id: string }[]
}

export interface MensajeInsertar {
  medico_id: string
  remitente_id: string
  destinatario_id?: string | null
  es_grupal: boolean
  asunto: string
  cuerpo: string
  parent_id?: string | null
}

/** Formulario de redacción */
export interface MensajeFormValues {
  destinatario_id: string   // 'todos' para mensaje grupal
  asunto: string
  cuerpo: string
  parent_id?: string
}

/** Resumen de un mensaje no leído, para la campanita de notificaciones */
export interface MensajeNoLeido {
  id: string
  /** Raíz del hilo (parent_id ?? id) — para linkear a /mensajes?hilo=… */
  thread_id: string
  asunto: string
  remitente_nombre: string
  es_grupal: boolean
  created_at: string
}
