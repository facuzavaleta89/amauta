// ============================================================
// roles.ts
// Tipos de roles y profiles del sistema multi-tenant
// ============================================================

// ── PERMISOS GRANULARES ────────────────────────────────────

/**
 * Conjunto completo de permisos booleanos para asistentes.
 * Todos default = false (principio de mínimo privilegio).
 * Si el usuario es médico, tienePermiso() siempre retorna true.
 */
export interface PermisosAsistente {
  // Pacientes
  ver_pacientes: boolean
  editar_pacientes: boolean
  // Historia clínica
  ver_historia_clinica: boolean
  crear_consultas: boolean
  finalizar_consultas: boolean
  // Turnero
  ver_turnos: boolean
  gestionar_turnos: boolean
  // Pedidos
  ver_pedidos: boolean
  crear_pedidos: boolean
  // Certificados
  ver_certificados: boolean
  crear_certificados: boolean
  // Mensajería (preparado para uso futuro)
  acceso_mensajeria: boolean
}

/** Nombres válidos de permisos (para type-safe checks) */
export type PermisoKey = keyof PermisosAsistente

/** Todos los permisos en false — base para nuevos asistentes */
export const PERMISOS_DEFAULT: PermisosAsistente = {
  ver_pacientes: false,
  editar_pacientes: false,
  ver_historia_clinica: false,
  crear_consultas: false,
  finalizar_consultas: false,
  ver_turnos: false,
  gestionar_turnos: false,
  ver_pedidos: false,
  crear_pedidos: false,
  ver_certificados: false,
  crear_certificados: false,
  acceso_mensajeria: false,
}

/** Labels legibles para cada permiso */
export const PERMISO_LABELS: Record<PermisoKey, string> = {
  ver_pacientes: 'Ver pacientes',
  editar_pacientes: 'Crear y editar pacientes',
  ver_historia_clinica: 'Ver historia clínica',
  crear_consultas: 'Crear consultas (borrador)',
  finalizar_consultas: 'Finalizar consultas',
  ver_turnos: 'Ver agenda de turnos',
  gestionar_turnos: 'Gestionar turnos',
  ver_pedidos: 'Ver pedidos de estudios',
  crear_pedidos: 'Crear pedidos de estudios',
  ver_certificados: 'Ver certificados',
  crear_certificados: 'Crear certificados',
  acceso_mensajeria: 'Acceso a mensajería',
}

/** Agrupación de permisos para el panel de configuración */
export const PERMISOS_GRUPOS: { titulo: string; permisos: PermisoKey[] }[] = [
  {
    titulo: 'Pacientes',
    permisos: ['ver_pacientes', 'editar_pacientes'],
  },
  {
    titulo: 'Historia Clínica',
    permisos: ['ver_historia_clinica', 'crear_consultas', 'finalizar_consultas'],
  },
  {
    titulo: 'Turnero',
    permisos: ['ver_turnos', 'gestionar_turnos'],
  },
  {
    titulo: 'Pedidos de Estudios',
    permisos: ['ver_pedidos', 'crear_pedidos'],
  },
  {
    titulo: 'Certificados',
    permisos: ['ver_certificados', 'crear_certificados'],
  },
  {
    titulo: 'Mensajería',
    permisos: ['acceso_mensajeria'],
  },
]

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
export interface Profile extends PermisosAsistente {
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

// ── ASISTENTES VINCULADOS (proyección de /perfil) ──────────

/**
 * Asistente vinculado tal como lo consume el panel de `/perfil`.
 *
 * ⚠ NO es una fila de `profiles`: es la proyección que arma
 * `obtenerAsistentes()` (`app/(app)/perfil/actions.ts`) — los 3 campos del
 * `select` sobre `profiles` (`id`, `full_name`, `created_at`), los 12 permisos
 * normalizados contra `PERMISOS_DEFAULT`, y el `email`, que NO está en
 * `profiles`: lo enriquece `admin.auth.admin.getUserById()` desde `auth.users`
 * (por eso su fallback es la cadena 'Sin email', no `null`).
 */
export interface Asistente {
  id: string
  full_name: string
  email: string
  permisos: PermisosAsistente
  created_at: string
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
