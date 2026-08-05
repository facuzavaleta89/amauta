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
  archivado_at: string | null // ISO timestamp; NULL = activo, con valor = archivado (Ley 26.529)
  created_at: string
  updated_at: string
}

export interface PacienteWithObraSocial extends Paciente {
  obras_sociales: ObraSocial | null
}

/**
 * Paciente tal como lo devuelve el autocompletado `GET /api/pacientes?q=`, que proyecta
 * `id, nombre_completo, dni, fecha_nacimiento, obra_social_id, numero_afiliado, telefono,
 * email, obras_sociales ( nombre )` sobre pacientes activos del tenant.
 *
 * ⚠ Es una proyección PARCIAL: no trae `sexo`, `provincia`, `ciudad`, `obra_social_otro`,
 * `creado_por`, `archivado_at` ni los timestamps. Y del join solo viene `nombre` (no el `id`
 * de la obra social), así que NO es un `PacienteWithObraSocial`.
 *
 * Consumidores: el buscador de `turnero/turno-form.tsx` y el de `pedidos/pedido-form.tsx`.
 * `GET /api/pacientes/[id]` proyecta `*, obras_sociales ( nombre )` — un superset de esta
 * forma —, así que también es asignable acá.
 */
export interface PacienteBusqueda extends Pick<Paciente,
  'id' | 'nombre_completo' | 'dni' | 'fecha_nacimiento' |
  'obra_social_id' | 'numero_afiliado' | 'telefono' | 'email'
> {
  /** Join de `obras_sociales ( nombre )`. NULL si el paciente no tiene obra social. */
  obras_sociales: Pick<ObraSocial, 'nombre'> | null
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
