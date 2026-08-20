// ============================================================
// consulta.ts
// Tipos del módulo de consultas (Historia Clínica dinámica)
// ============================================================

export type ConsultaEstado = 'borrador' | 'finalizada'

/** Sección a la que pertenece un campo extra ad-hoc de una consulta */
export type CampoExtraSeccion = 'examen_fisico' | 'parametros_metabolicos'

/** Campo extra ad-hoc cargado por consulta (no pertenece al formulario fijo) */
export interface CampoExtra {
  seccion: CampoExtraSeccion
  nombre: string
  valor: string
}

export interface Consulta {
  id: string
  paciente_id: string
  medico_id: string
  /**
   * Autor de la consulta (quien la creó). NO es el tenant: eso es `medico_id`.
   * NULL en las consultas anteriores a la migración 038 (sin backfill a propósito):
   * esas solo las puede descartar el médico. Ver regla de descarte en `consultas_delete`.
   */
  creado_por: string | null
  fecha_hora: string               // ISO timestamptz

  // Motivo y anamnesis
  motivo_consulta: string | null
  anamnesis: string | null

  // Examen físico
  peso_kg: number | null
  talla_cm: number | null
  ta_sistolica: number | null
  ta_diastolica: number | null
  frecuencia_cardiaca: number | null
  temperatura: number | null

  // Parámetros metabólicos
  glucemia_ayunas: number | null
  glucemia_postprandial: number | null
  hba1c: number | null
  trigliceridos: number | null
  colesterol_ldl: number | null
  colesterol_hdl: number | null

  // Diagnóstico y plan
  diagnostico: string | null
  plan_terapeutico: string | null
  medicacion_actual: string | null
  observaciones: string | null

  // Seguimiento
  /**
   * Próximo control sugerido. **ISO 8601 con offset** (`2026-08-20T17:00:00+00:00`):
   * la columna es TIMESTAMPTZ desde la migración 041 y por lo tanto LLEVA HORA.
   *
   * ⚠ Antes era DATE y este comentario decía `YYYY-MM-DD`. No volver a partir el
   * string por `'T'` para sacarle fecha y hora: eso da los componentes en UTC, no en
   * hora argentina. Se proyecta con `formatFechaAR` y se compone con
   * `parseFechaHoraAR` (`lib/utils/format-date.ts`). Ver nota técnica 18.
   */
  proximo_turno_sugerido: string | null

  // Campos extra ad-hoc (examen físico / parámetros metabólicos), por consulta
  campos_extra: CampoExtra[]

  // Estado
  estado: ConsultaEstado

  created_at: string
  updated_at: string
}

export interface ConsultaInsert {
  paciente_id: string
  medico_id: string
  /** Lo setea el SERVIDOR con el usuario autenticado; el cliente nunca lo manda. */
  creado_por?: string
  fecha_hora?: string
  motivo_consulta?: string | null
  anamnesis?: string | null
  peso_kg?: number | null
  talla_cm?: number | null
  ta_sistolica?: number | null
  ta_diastolica?: number | null
  frecuencia_cardiaca?: number | null
  temperatura?: number | null
  glucemia_ayunas?: number | null
  glucemia_postprandial?: number | null
  hba1c?: number | null
  trigliceridos?: number | null
  colesterol_ldl?: number | null
  colesterol_hdl?: number | null
  diagnostico?: string | null
  plan_terapeutico?: string | null
  medicacion_actual?: string | null
  observaciones?: string | null
  proximo_turno_sugerido?: string | null
  campos_extra?: CampoExtra[]
  estado?: ConsultaEstado
}

export interface ConsultaUpdate extends Partial<Omit<ConsultaInsert, 'paciente_id' | 'medico_id'>> {
  id: string
}

