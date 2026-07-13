// ============================================================
// index.ts — Barrel file de tipos
// Re-exporta todos los tipos del dominio para importarlos desde '@/types'.
//
//   import type { Paciente, Consulta, Turno } from '@/types'
//
// Nota: cada archivo agrupa una o varias entidades por dominio
// (ej. pedido.ts contiene Pedido, Certificado, Receta, Evolucion,
//  HistoriaClinica y Estudio). Ver schema.sql para el mapeo tabla ↔ tipo.
//
// `supabase.ts` es un barrel parcial anterior (re-exporta roles, paciente,
// pedido, turno y difusion) que se mantiene por compatibilidad; este index
// es la puerta de entrada preferida y cubre además consulta, mensaje y nota.
// ============================================================

export * from './roles'      // UserRole, Profile, PermisosAsistente, Matricula, SolicitudAsistente, helpers…
export * from './paciente'   // ObraSocial, Paciente, PacienteWithObraSocial, inserts/updates
export * from './consulta'   // ConsultaEstado, Consulta, ConsultaConRelaciones, inserts/updates
export * from './pedido'     // Pedido, Certificado, Receta, Evolucion, HistoriaClinica, Estudio
export * from './turno'      // TurnoEstado, Turno, BloqueoAgenda, TurnoAuditLog, inserts/updates
export * from './difusion'   // DifusionEstado, DifusionCanal, DifusionPost, DifusionEnvio
export * from './mensaje'    // MensajeInterno, MensajeInsertar, MensajeFormValues
export * from './nota'       // Nota, NotaInsert, NotaUpdate
