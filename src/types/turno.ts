// ============================================================
// turno.ts
// Tipos del turnero: turnos, bloqueos de agenda y auditoría
// ============================================================

export type TurnoEstado =
  | 'pendiente'
  | 'confirmado'
  | 'presente'
  | 'ausente'
  | 'cancelado'
  | 'reprogramado'

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
  created_at: string
  updated_at: string
}

export interface TurnoInsert {
  paciente_id?: string
  paciente_nombre_libre?: string
  fecha_inicio: string
  fecha_fin: string
  motivo?: string
  notas?: string
  estado?: TurnoEstado
  color?: string
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
  accion: 'creado' | 'modificado' | 'cancelado' | 'reprogramado' | string
  detalle: Record<string, unknown> | null  // jsonb {antes, despues}
  created_at: string
}
