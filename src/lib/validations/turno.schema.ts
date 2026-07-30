import * as z from 'zod'
import { isValidDateStr, colorHexSchema } from './shared'

// ── Constantes ────────────────────────────────────────────────────────────────
const MIN_DURATION_MS = 10 * 60 * 1000 // 10 minutos mínimo

// ── Turno base ────────────────────────────────────────────────────────────────
export const turnoBaseSchema = z.object({
  paciente_id: z.string().uuid().optional().nullable(),
  paciente_nombre_libre: z
    .string()
    .max(150, 'El nombre es demasiado largo')
    .optional()
    .nullable(),
  fecha_inicio: z
    .string()
    .min(1, 'La fecha de inicio es obligatoria')
    .refine(isValidDateStr, 'Fecha de inicio inválida'),
  fecha_fin: z
    .string()
    .min(1, 'La fecha de fin es obligatoria')
    .refine(isValidDateStr, 'Fecha de fin inválida'),
  motivo: z.string().max(500, 'Máximo 500 caracteres').optional().nullable(),
  notas: z.string().max(1000, 'Máximo 1000 caracteres').optional().nullable(),
  estado: z
    .enum(['pendiente', 'confirmado', 'presente', 'ausente', 'cancelado', 'reprogramado', 'pendiente_confirmar'])
    .default('pendiente'),
  categoria: z
    .enum(['turno_medico', 'curso', 'personal', 'administrativo', 'recordatorio'])
    .default('turno_medico'),
  origen: z
    .enum(['manual', 'desde_hc'])
    .default('manual'),
  consulta_id: z.string().uuid().optional().nullable(),
  // Valida que sea un color hex válido (#RGB o #RRGGBB) o vacío/null
  color: colorHexSchema,
})

// ── turnoSchema (creación — campos requeridos + cross-field) ──────────────────
export const turnoSchema = turnoBaseSchema
  .superRefine((data, ctx) => {
    // 1. Si es turno_medico, se requiere paciente_id obligatoriamente
    if (data.categoria === 'turno_medico') {
      if (!data.paciente_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Debe seleccionar un paciente para un turno médico',
          path: ['paciente_id'],
        })
      }
      // Validar nombre si se ingresó manualmente (sin seleccionar de la lista)
      if (data.paciente_nombre_libre && data.paciente_nombre_libre.trim().length > 0 && data.paciente_nombre_libre.trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'El nombre debe tener al menos 2 caracteres',
          path: ['paciente_nombre_libre'],
        })
      }
    } else {
      // 2. Si no es turno_medico, motivo (Título / descripción) es requerido
      if (!data.motivo || data.motivo.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'El título / descripción es obligatorio',
          path: ['motivo'],
        })
      }
    }

    if (!isValidDateStr(data.fecha_inicio) || !isValidDateStr(data.fecha_fin)) return

    const inicio = new Date(data.fecha_inicio)
    const fin    = new Date(data.fecha_fin)

    if (fin <= inicio) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'La hora de fin debe ser posterior a la de inicio', path: ['fecha_fin'] })
    }
    
    // Si no es un turno sin horario establecido, se valida duración mínima
    if (data.estado !== 'pendiente_confirmar') {
      if (fin.getTime() - inicio.getTime() < MIN_DURATION_MS) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El turno debe durar al menos 10 minutos', path: ['fecha_fin'] })
      }
    }
  })

// ── turnoUpdateSchema (actualización parcial — solo campos presentes) ─────────
// Versión base para updates sin cross-field (solo un campo cambia)
export const turnoUpdateSchema = turnoBaseSchema.partial()

// Versión con cross-field: schema PROPIO sin defaults para PATCH de drag/resize.
// No extiende turnoBaseSchema para evitar que los .default() inyecten valores
// que sobreescriben los datos existentes en la DB (ej: categoria: 'turno_medico').
export const turnoUpdateWithDatesSchema = z
  .object({
    fecha_inicio: z
      .string()
      .refine(isValidDateStr, 'Fecha de inicio inválida')
      .optional(),
    fecha_fin: z
      .string()
      .refine(isValidDateStr, 'Fecha de fin inválida')
      .optional(),
    estado: z
      .enum(['pendiente', 'confirmado', 'presente', 'ausente', 'cancelado', 'reprogramado', 'pendiente_confirmar'])
      .optional(),
    motivo: z.string().max(500).optional().nullable(),
    notas: z.string().max(1000).optional().nullable(),
    color: colorHexSchema,
  })
  .superRefine((data, ctx) => {
    // Solo aplicar si se envían ambas fechas en el mismo request
    if (!data.fecha_inicio || !data.fecha_fin) return
    if (!isValidDateStr(data.fecha_inicio) || !isValidDateStr(data.fecha_fin)) return

    const inicio = new Date(data.fecha_inicio)
    const fin    = new Date(data.fecha_fin)

    if (fin <= inicio) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'La hora de fin debe ser posterior a la de inicio', path: ['fecha_fin'] })
    }
    
    if (data.estado !== 'pendiente_confirmar') {
      if (fin.getTime() - inicio.getTime() < MIN_DURATION_MS) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El turno debe durar al menos 10 minutos', path: ['fecha_fin'] })
      }
    }
  })

export type TurnoFormData = z.input<typeof turnoSchema>

// ── Bloqueo de agenda ─────────────────────────────────────────────────────────

// Objeto base sin refinements (necesario para poder llamar .partial() en Zod v4)
const bloqueoAgendaBaseObject = z.object({
  fecha_inicio: z
    .string()
    .min(1, 'La fecha de inicio es obligatoria')
    .refine(isValidDateStr, 'Fecha de inicio inválida'),
  fecha_fin: z
    .string()
    .min(1, 'La fecha de fin es obligatoria')
    .refine(isValidDateStr, 'Fecha de fin inválida'),
  motivo: z.string().max(500, 'Máximo 500 caracteres').optional().nullable(),
  es_recurrente: z.boolean().default(false),
  recurrencia_fin: z
    .string()
    .refine(
      (v) => !v || isValidDateStr(v),
      'Fecha de fin de recurrencia inválida'
    )
    .refine(
      (v) => !v || new Date(v) > new Date(),
      'La fecha de fin de recurrencia debe ser futura'
    )
    .optional()
    .nullable(),
  dias_semana: z.array(z.number().int().min(0).max(6)).optional().nullable(),
})

export const bloqueoAgendaSchema = bloqueoAgendaBaseObject
  .superRefine((data, ctx) => {
    if (!isValidDateStr(data.fecha_inicio) || !isValidDateStr(data.fecha_fin)) return

    const inicio = new Date(data.fecha_inicio)
    const fin    = new Date(data.fecha_fin)

    if (fin <= inicio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La hora de fin debe ser posterior a la de inicio',
        path: ['fecha_fin'],
      })
    }

    if (fin.getTime() - inicio.getTime() < MIN_DURATION_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El bloqueo debe durar al menos 10 minutos',
        path: ['fecha_fin'],
      })
    }
  })

// Schema de actualización parcial — sin superRefine para permitir .partial() en Zod v4
export const bloqueoAgendaUpdateSchema = bloqueoAgendaBaseObject.partial()
export type BloqueoFormData = z.input<typeof bloqueoAgendaSchema>
