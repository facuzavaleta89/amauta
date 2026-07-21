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
  proximo_turno_sugerido: string | null  // ISO date (YYYY-MM-DD)

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

/** Consulta con datos de paciente y médico (para PDF y listados enriquecidos) */
export interface ConsultaConRelaciones extends Consulta {
  paciente?: {
    nombre_completo: string
    dni: string
    fecha_nacimiento: string
    obras_sociales?: { nombre: string } | null
    obra_social_otro?: string | null
    numero_afiliado?: string | null
  }
}
