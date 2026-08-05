// ============================================================
// index.ts — Barrel file de tipos
// Re-exporta todos los tipos del dominio para importarlos desde '@/types'.
//
//   import type { Paciente, Consulta, Turno } from '@/types'
//
// Nota: cada archivo agrupa una o varias entidades por dominio
// (ej. pedido.ts contiene Pedido, Certificado, Receta, Evolucion,
//  HistoriaClinica y Estudio). Ver schema.sql para el mapeo tabla ↔ tipo.
// ============================================================

export * from './roles'      // UserRole, Profile, PermisosAsistente, Matricula, SolicitudAsistente, helpers…
export * from './paciente'   // ObraSocial, Paciente, PacienteWithObraSocial, PacienteBusqueda, inserts/updates
export * from './consulta'   // ConsultaEstado, Consulta, ConsultaConRelaciones, inserts/updates
export * from './pedido'     // Pedido, Certificado, Receta, Evolucion, HistoriaClinica, Estudio
export * from './turno'      // TurnoEstado, Turno, TurnoConPaciente, BloqueoAgenda, TurnoAuditLog, inserts/updates
export * from './difusion'   // DifusionEstado, DifusionCanal, DifusionPost, DifusionEnvio
export * from './mensaje'    // MensajeInterno, MensajeInsertar, MensajeFormValues
export * from './nota'       // Nota, NotaInsert, NotaUpdate
export * from './notificacion' // Notificacion, NotificacionTipo, ItemPendiente, ITEM_TYPE_SOLICITUD
