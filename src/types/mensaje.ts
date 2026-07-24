// ============================================================
// mensaje.ts
// Tipos de mensajería interna asíncrona
// ============================================================

import type { UserRole } from './roles'

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
  // Joins opcionales
  remitente?: { full_name: string; role: UserRole } | null
  destinatario?: { full_name: string; role: UserRole } | null
  /** Para mensajes grupales: registros de lectura por usuario */
  lecturas?: MensajeLectura[]
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
