import * as z from 'zod'
import { isValidDateStr, colorHexSchema } from './shared'

// ── Constantes ────────────────────────────────────────────────────────────────
const MIN_HOUR = 8   // 08:00
const MAX_HOUR = 20  // 20:00
const MIN_DURATION_MS = 15 * 60 * 1000 // 15 minutos mínimo

function getHourDecimal(d: Date) {
  return d.getHours() + d.getMinutes() / 60
}

// ── Turno base ────────────────────────────────────────────────────────────────
export const turnoBaseSchema = z.object({
  paciente_id: z.string().uuid().optional().nullable(),
  paciente_nombre_libre: z
    .string()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
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
    .enum(['pendiente', 'confirmado', 'presente', 'ausente', 'cancelado', 'reprogramado'])
    .default('pendiente'),
  // Valida que sea un color hex válido (#RGB o #RRGGBB) o vacío/null
  color: colorHexSchema,
})

// ── turnoSchema (creación — campos requeridos + cross-field) ──────────────────
export const turnoSchema = turnoBaseSchema
  .refine(
    (data) => data.paciente_id || data.paciente_nombre_libre,
    {
      message: 'Debe seleccionar un paciente o ingresar un nombre',
      path: ['paciente_nombre_libre'],
    }
  )
  .superRefine((data, ctx) => {
    if (!isValidDateStr(data.fecha_inicio) || !isValidDateStr(data.fecha_fin)) return

    const inicio = new Date(data.fecha_inicio)
    const fin    = new Date(data.fecha_fin)

    if (fin <= inicio) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'La hora de fin debe ser posterior a la de inicio', path: ['fecha_fin'] })
    }
    if (fin.getTime() - inicio.getTime() < MIN_DURATION_MS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El turno debe durar al menos 15 minutos', path: ['fecha_fin'] })
    }
    const hInicio = getHourDecimal(inicio)
    if (hInicio < MIN_HOUR || hInicio >= MAX_HOUR) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `El turno debe comenzar entre las ${MIN_HOUR}:00 y las ${MAX_HOUR}:00`, path: ['fecha_inicio'] })
    }
    if (fin.getHours() > MAX_HOUR || (fin.getHours() === MAX_HOUR && fin.getMinutes() > 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `El turno debe finalizar antes de las ${MAX_HOUR}:00`, path: ['fecha_fin'] })
    }
  })

// ── turnoUpdateSchema (actualización parcial — solo campos presentes) ─────────
// Versión base para updates sin cross-field (solo un campo cambia)
export const turnoUpdateSchema = turnoBaseSchema.partial()

// Versión con cross-field: se usa cuando el PATCH incluye AMBAS fechas
export const turnoUpdateWithDatesSchema = turnoBaseSchema
  .partial()
  .superRefine((data, ctx) => {
    // Solo aplicar si se envían ambas fechas en el mismo request
    if (!data.fecha_inicio || !data.fecha_fin) return
    if (!isValidDateStr(data.fecha_inicio) || !isValidDateStr(data.fecha_fin)) return

    const inicio = new Date(data.fecha_inicio)
    const fin    = new Date(data.fecha_fin)

    if (fin <= inicio) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'La hora de fin debe ser posterior a la de inicio', path: ['fecha_fin'] })
    }
    if (fin.getTime() - inicio.getTime() < MIN_DURATION_MS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El turno debe durar al menos 15 minutos', path: ['fecha_fin'] })
    }
    const hInicio = getHourDecimal(inicio)
    if (hInicio < MIN_HOUR || hInicio >= MAX_HOUR) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `El turno debe comenzar entre las ${MIN_HOUR}:00 y las ${MAX_HOUR}:00`, path: ['fecha_inicio'] })
    }
    if (fin.getHours() > MAX_HOUR || (fin.getHours() === MAX_HOUR && fin.getMinutes() > 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `El turno debe finalizar antes de las ${MAX_HOUR}:00`, path: ['fecha_fin'] })
    }
  })

export type TurnoFormData = z.input<typeof turnoSchema>

// ── Bloqueo de agenda ─────────────────────────────────────────────────────────
export const bloqueoAgendaSchema = z
  .object({
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
    // recurrencia_fin debe ser una fecha válida futura si se proporciona
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
        message: 'El bloqueo debe durar al menos 15 minutos',
        path: ['fecha_fin'],
      })
    }
  })

export type BloqueoFormData = z.input<typeof bloqueoAgendaSchema>
