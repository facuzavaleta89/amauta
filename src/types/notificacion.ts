// ============================================================
// notificacion.ts
// Avisos del sistema para el médico (tabla `notificaciones`) + la forma
// normalizada que comparten la campanita y la página /notificaciones.
// ============================================================

/**
 * Tipos de aviso que HOY emite el código.
 *   · 'turno_creado'        → src/app/api/turnero/route.ts (un asistente agendó un turno)
 *   · 'recordatorio_enviado'→ src/app/api/cron/recordatorios/route.ts
 * En la base `tipo` es TEXT sin CHECK ni ENUM (ver schema.sql → notificaciones),
 * así que agregar un tipo nuevo no requiere migración.
 */
export type NotificacionTipo = 'turno_creado' | 'recordatorio_enviado'

/**
 * Valor real de la columna `tipo`: el union documenta y autocompleta los que
 * circulan hoy, y el `(string & {})` deja pasar cualquier otro sin romper el
 * tipado — coherente con que la base no restringa el valor.
 */
export type NotificacionTipoValor = NotificacionTipo | (string & {})

/**
 * Fila de `public.notificaciones`. Tenant: `medico_id`.
 * Nota: en la base `leida` y `created_at` son NULLABLE con DEFAULT (false / now()),
 * pero ningún insert del repo escribe NULL en ellas, así que se tipan como no nulas.
 */
export interface Notificacion {
  id: string
  medico_id: string                        // tenant key — dueño del aviso
  titulo: string
  mensaje: string
  tipo: NotificacionTipoValor
  leida: boolean
  payload: Record<string, unknown> | null  // jsonb, p. ej. { turno_id, fecha }
  created_at: string                       // ISO timestamptz
}

// ── FORMA NORMALIZADA COMPARTIDA ──────────────────────────────

/**
 * `type` de un item normalizado cuando la fuente es una solicitud de vinculación
 * (tabla `solicitudes_asistente`). Para los avisos del sistema, `type` es el
 * `tipo` de la fila. Se usa para distinguir la fuente sin repetir el literal.
 */
export const ITEM_TYPE_SOLICITUD = 'solicitud'

/**
 * Item normalizado de "algo que le llegó al usuario", común a las tres fuentes
 * (solicitudes de vinculación, mensajes internos y avisos del sistema).
 *
 * Es la forma que ya usaba inline la página /notificaciones; se elevó a tipo
 * compartido para que la campanita y la página deriven del MISMO shape y un
 * tipo nuevo de notificación no vuelva a contarse en un lado y en el otro no.
 * Las funciones que lo producen viven en `app/(app)/notificaciones/actions.ts`.
 */
export interface ItemPendiente {
  id: string
  /** ITEM_TYPE_SOLICITUD, o el `tipo` del aviso ('turno_creado', …) */
  type: NotificacionTipoValor
  title: string
  message: string
  /** ISO timestamptz — se ordena por acá, descendente */
  date: string
  /** false = sin leer. Las solicitudes pendientes son siempre `false`. */
  read: boolean
  payload: unknown
}
