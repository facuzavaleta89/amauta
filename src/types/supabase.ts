// ============================================================
// supabase.ts
// Re-exporta todos los tipos del schema y helpers de contexto
// ============================================================

// Roles y profiles
export type {
  UserRole,
  Profile,
  ProfileInsert,
  ProfileUpdate,
  SolicitudEstado,
  SolicitudAsistente,
  SolicitudAsistenteInsert,
  SolicitudAsistenteUpdate,
} from './roles'
export { esMedico, esAsistenteVinculado, getMedicoId } from './roles'

// Pacientes
export type {
  ObraSocial,
  Paciente,
  PacienteWithObraSocial,
  PacienteInsert,
  PacienteUpdate,
} from './paciente'

// Documentos clínicos
export type {
  Pedido,
  PedidoInsert,
  PedidoUpdate,
  CertificadoTipo,
  Certificado,
  CertificadoInsert,
  CertificadoUpdate,
  Receta,
  RecetaInsert,
  RecetaUpdate,
  Evolucion,
  EvolucionInsert,
  EvolucionUpdate,
  HistoriaClinica,
  HistoriaClinicaInsert,
  HistoriaClinicaUpdate,
  Estudio,
  EstudioInsert,
} from './pedido'

// Turnero
export type {
  TurnoEstado,
  Turno,
  TurnoInsert,
  TurnoUpdate,
  BloqueoAgenda,
  BloqueoAgendaInsert,
  TurnoAuditLog,
} from './turno'

// Difusión
export type {
  DifusionEstado,
  DifusionCanal,
  DifusionPost,
  DifusionPostInsert,
  DifusionPostUpdate,
  DifusionEnvio,
  DifusionEnvioInsert,
} from './difusion'
