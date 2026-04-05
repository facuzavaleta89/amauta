// ============================================================
// paciente.ts
// Tipos de pacientes y obras sociales
// ============================================================

export type { UserRole } from './roles'

export interface ObraSocial {
  id: number
  nombre: string
}

export interface Paciente {
  id: string
  dni: string
  nombre_completo: string
  fecha_nacimiento: string   // ISO date string (YYYY-MM-DD)
  sexo: 'masculino' | 'femenino' | 'otro'
  telefono: string | null
  email: string | null
  provincia: string | null
  ciudad: string | null
  obra_social_id: number | null
  obra_social_otro: string | null
  numero_afiliado: string | null
  creado_por: string         // uuid del médico dueño del registro
  created_at: string
  updated_at: string
}

export interface PacienteWithObraSocial extends Paciente {
  obras_sociales: ObraSocial | null
}

export interface PacienteInsert {
  dni: string
  nombre_completo: string
  fecha_nacimiento: string
  sexo: 'masculino' | 'femenino' | 'otro'
  telefono?: string
  email?: string
  provincia?: string
  ciudad?: string
  obra_social_id?: number
  obra_social_otro?: string
  numero_afiliado?: string
  creado_por: string         // debe ser get_medico_id() del usuario actual
}

export interface PacienteUpdate extends Partial<Omit<PacienteInsert, 'creado_por'>> {
  id: string
}
