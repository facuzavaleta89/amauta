// ============================================================
// roles.ts
// Tipos de roles y profiles del sistema multi-tenant
// ============================================================

/** Roles del sistema */
export type UserRole = 'medico' | 'asistente'

/** Tipos válidos de matrícula médica argentina */
export type MatriculaTipo = 'MP' | 'MN' | 'ME'

/**
 * Matrícula profesional tipada.
 * - MP: Matrícula Provincial
 * - MN: Matrícula Nacional
 * - ME: Matrícula de Especialidad
 */
export interface Matricula {
  tipo: MatriculaTipo
  numero: string
}

/** Títulos / tratamientos disponibles para médicos */
export const TITULOS_DISPONIBLES = ['Dr.', 'Dra.', 'Lic.', 'Sr.', 'Sra.'] as const
export type TituloPreset = typeof TITULOS_DISPONIBLES[number]

/**
 * Perfil de usuario (extiende auth.users).
 * - medico:    id === medico_id (o medico_id NULL). Dueño del tenant.
 * - asistente: medico_id apunta al médico al que pertenece.
 */
export interface Profile {
  id: string
  full_name: string
  role: UserRole
  avatar_url: string | null
  medico_id: string | null   // null si es médico; uuid del médico si es asistente
  /** @deprecated Usar matriculas (jsonb) en su lugar */
  matricula?: string | null
  matriculas: Matricula[]    // columna jsonb nueva
  titulo: string | null      // Dr. / Dra. / Lic. / etc.
  firma_url: string | null
  logo_url: string | null    // sello / logo institucional (base64)
  created_at: string
  updated_at: string
}

/** Insert de profile (normalmente lo maneja el trigger handle_new_user) */
export interface ProfileInsert {
  id: string
  full_name: string
  role?: UserRole
  avatar_url?: string
  medico_id?: string
  matriculas?: Matricula[]
  titulo?: string
  logo_url?: string
}

/** Update de profile propio */
export interface ProfileUpdate {
  full_name?: string
  avatar_url?: string
  medico_id?: string   // solo el médico lo setea al aprobar una solicitud
  matriculas?: Matricula[]
  titulo?: string | null
  logo_url?: string | null
}

// ── SOLICITUDES DE VINCULACIÓN ─────────────────────────────

export type SolicitudEstado = 'pendiente' | 'aprobada' | 'rechazada'

/**
 * Solicitud que envía un asistente para trabajar con un médico.
 * El médico aprueba → se setea profiles.medico_id del asistente.
 */
export interface SolicitudAsistente {
  id: string
  solicitante_id: string       // uuid del asistente que solicita
  medico_id: string            // uuid del médico al que se dirige
  estado: SolicitudEstado
  mensaje: string | null
  respondido_at: string | null
  created_at: string
  updated_at: string
}

export interface SolicitudAsistenteInsert {
  solicitante_id: string
  medico_id: string
  mensaje?: string
}

export interface SolicitudAsistenteUpdate {
  estado: SolicitudEstado
  respondido_at?: string
}

// ── HELPERS ────────────────────────────────────────────────

/** Retorna true si el perfil es médico (dueño de tenant) */
export function esMedico(profile: Profile): boolean {
  return profile.role === 'medico'
}

/** Retorna true si el perfil es asistente y está vinculado a un médico */
export function esAsistenteVinculado(profile: Profile): boolean {
  return profile.role === 'asistente' && profile.medico_id !== null
}

/**
 * Retorna el id del médico del tenant según el perfil.
 * - Médico:    propio id
 * - Asistente: medico_id del médico
 * - Sin rol:   null
 */
export function getMedicoId(profile: Profile): string | null {
  if (profile.role === 'medico') return profile.id
  if (profile.role === 'asistente') return profile.medico_id
  return null
}
