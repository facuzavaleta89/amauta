import * as z from 'zod'

export const turnoBaseSchema = z.object({
  paciente_id: z.string().uuid().optional().nullable(),
  paciente_nombre_libre: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').optional().nullable(),
  fecha_inicio: z.string(),
  fecha_fin: z.string(),
  motivo: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
  estado: z.enum(['pendiente', 'confirmado', 'presente', 'ausente', 'cancelado', 'reprogramado']).default('pendiente'),
  color: z.string().optional().nullable()
})

export const turnoSchema = turnoBaseSchema.refine(data => {
  return data.paciente_id || data.paciente_nombre_libre
}, {
  message: "Debe proveer un paciente registrado o un nombre libre",
  path: ["paciente_nombre_libre"]
})

export const turnoUpdateSchema = turnoBaseSchema.partial()

export type TurnoFormData = z.input<typeof turnoSchema>

export const bloqueoAgendaSchema = z.object({
  fecha_inicio: z.string(),
  fecha_fin: z.string(),
  motivo: z.string().optional().nullable(),
  es_recurrente: z.boolean().default(false),
  recurrencia_fin: z.string().optional().nullable(),
  dias_semana: z.array(z.number().min(0).max(6)).optional().nullable()
})

export type BloqueoFormData = z.input<typeof bloqueoAgendaSchema>
