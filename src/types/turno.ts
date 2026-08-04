// ============================================================
// turno.ts
// Tipos del turnero: turnos, bloqueos de agenda y auditoría
// ============================================================

import type { Paciente } from './paciente'

export type TurnoEstado =
  | 'pendiente'
  | 'confirmado'
  | 'presente'
  | 'ausente'
  | 'cancelado'
  | 'reprogramado'
  | 'pendiente_confirmar'

// ── TURNOS ────────────────────────────────────────────────────

export interface Turno {
  id: string
  paciente_id: string | null
  paciente_nombre_libre: string | null   // cuando no hay paciente registrado
  fecha_inicio: string                   // ISO timestamptz
  fecha_fin: string                      // ISO timestamptz
  motivo: string | null
  notas: string | null
  estado: TurnoEstado
  color: string | null                   // hex color para el calendario
  recordatorio_enviado: boolean
  medico_id: string                      // tenant key — agenda del médico
  agendado_por: string                   // quien creó el turno (médico o asistente)
  categoria: 'turno_medico' | 'curso' | 'personal' | 'administrativo' | 'recordatorio'
  origen: 'manual' | 'desde_hc'
  consulta_id: string | null
  created_at: string
  updated_at: string
}

/**
 * Turno tal como lo devuelve `GET /api/turnero`, que proyecta el join
 * `paciente:paciente_id (id, nombre_completo)` sobre la fila completa (`*`).
 *
 * ⚠ El embebido trae SOLO esos dos campos: no es un `Paciente` completo.
 * El shape lo fija la proyección del endpoint, así que otras rutas que embeban
 * paciente con otros campos (p. ej. el cron de recordatorios) necesitan su propio tipo.
 */
export interface TurnoConPaciente extends Turno {
  /** Join de GET /api/turnero: `paciente:paciente_id (id, nombre_completo)`.
   *  NULL en categorías sin paciente (curso, personal, administrativo, recordatorio). */
  paciente: Pick<Paciente, 'id' | 'nombre_completo'> | null
}

export interface TurnoInsert {
  paciente_id?: string | null
  paciente_nombre_libre?: string | null
  fecha_inicio: string
  fecha_fin: string
  motivo?: string | null
  notas?: string | null
  estado?: TurnoEstado
  color?: string | null
  categoria?: 'turno_medico' | 'curso' | 'personal' | 'administrativo' | 'recordatorio'
  origen?: 'manual' | 'desde_hc'
  consulta_id?: string | null
  medico_id: string                      // debe ser get_medico_id() del usuario actual
  agendado_por: string
}

export interface TurnoUpdate extends Partial<Omit<TurnoInsert, 'medico_id' | 'agendado_por'>> {
  id: string
}

// ── BLOQUEOS DE AGENDA ────────────────────────────────────────

export interface BloqueoAgenda {
  id: string
  fecha_inicio: string
  fecha_fin: string
  motivo: string
  es_recurrente: boolean
  recurrencia_fin: string | null         // ISO date
  dias_semana: number[] | null           // 0=Dom..6=Sáb
  medico_id: string                      // tenant key — agenda del médico
  creado_por: string
  created_at: string
}

export interface BloqueoAgendaInsert {
  fecha_inicio: string
  fecha_fin: string
  motivo?: string
  es_recurrente?: boolean
  recurrencia_fin?: string
  dias_semana?: number[]
  medico_id: string                      // debe ser get_medico_id()
  creado_por: string
}

// ── LOG DE AUDITORÍA ──────────────────────────────────────────

export interface TurnoAuditLog {
  id: string
  turno_id: string
  usuario_id: string
  accion: 'creado' | 'modificado' | 'cancelado' | 'reprogramado'
  detalle: Record<string, unknown> | null  // jsonb {antes, despues}
  created_at: string
}
