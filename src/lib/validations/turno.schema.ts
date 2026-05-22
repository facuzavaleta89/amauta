import * as z from 'zod'

// ── Helpers ──────────────────────────────────────────────────────────────────
const MIN_HOUR = 8   // 08:00
const MAX_HOUR = 20  // 20:00
const MIN_DURATION_MS = 15 * 60 * 1000 // 15 minutos mínimo

function isValidDateStr(v: string) {
  if (!v) return false
  const d = new Date(v)
  return !isNaN(d.getTime())
}

function getHourDecimal(d: Date) {
  return d.getHours() + d.getMinutes() / 60
}

// ── Turno base ────────────────────────────────────────────────────────────────
export const turnoBaseSchema = z.object({
  paciente_id: z.string().uuid().optional().nullable(),
  paciente_nombre_libre: z
    .string()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
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
  color: z.string().optional().nullable(),
})

// ── Cross-field: fechas coherentes ───────────────────────────────────────────
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
    const fin = new Date(data.fecha_fin)

    // fin debe ser posterior a inicio
    if (fin <= inicio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La hora de fin debe ser posterior a la de inicio',
        path: ['fecha_fin'],
      })
    }

    // duración mínima de 15 minutos
    if (fin.getTime() - inicio.getTime() < MIN_DURATION_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El turno debe durar al menos 15 minutos',
        path: ['fecha_fin'],
      })
    }

    // dentro del horario de atención
    const hInicio = getHourDecimal(inicio)
    const hFin = getHourDecimal(fin)

    if (hInicio < MIN_HOUR || hInicio >= MAX_HOUR) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `El turno debe comenzar entre las ${MIN_HOUR}:00 y las ${MAX_HOUR}:00`,
        path: ['fecha_inicio'],
      })
    }

    if (hFin > MAX_HOUR || (hFin === MAX_HOUR && inicio.getDate() === fin.getDate())) {
      // Permitimos que termine exactamente a las 20:00
      if (fin.getHours() > MAX_HOUR || (fin.getHours() === MAX_HOUR && fin.getMinutes() > 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `El turno debe finalizar antes de las ${MAX_HOUR}:00`,
          path: ['fecha_fin'],
        })
      }
    }
  })

export const turnoUpdateSchema = turnoBaseSchema.partial()

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
    recurrencia_fin: z.string().optional().nullable(),
    dias_semana: z.array(z.number().min(0).max(6)).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (!isValidDateStr(data.fecha_inicio) || !isValidDateStr(data.fecha_fin)) return

    const inicio = new Date(data.fecha_inicio)
    const fin = new Date(data.fecha_fin)

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
