import { z } from 'zod'
import { isValidDateStr } from './shared'

export const recetaSchema = z.object({
  paciente_id: z
    .string()
    .uuid('Seleccioná un paciente válido'),

  medicamentos: z
    .string()
    .min(3, 'Describí al menos un medicamento')
    .max(2000, 'Máximo 2000 caracteres')
    .trim(),

  indicaciones: z
    .string()
    .max(2000, 'Máximo 2000 caracteres')
    .optional()
    .or(z.literal(''))
    .transform((val) => val?.trim() || null),

  diagnostico: z
    .string()
    .max(500, 'Máximo 500 caracteres')
    .optional()
    .or(z.literal(''))
    .transform((val) => val?.trim() || null),

  fecha_receta: z
    .string()
    .refine((v) => !v || isValidDateStr(v), 'Fecha de receta inválida')
    .optional()
    .or(z.literal('')),
})

export type RecetaFormValues = z.infer<typeof recetaSchema>
