import { z } from 'zod'

export const recetaSchema = z.object({
  paciente_id: z
    .string()
    .uuid('Seleccioná un paciente válido')
    .min(1, 'El paciente es obligatorio'),

  medicamentos: z
    .string()
    .min(3, 'Describí al menos un medicamento')
    .max(2000, 'Máximo 2000 caracteres'),

  indicaciones: z
    .string()
    .max(2000, 'Máximo 2000 caracteres')
    .optional()
    .or(z.literal('')),

  diagnostico: z
    .string()
    .max(500, 'Máximo 500 caracteres')
    .optional()
    .or(z.literal('')),

  fecha_receta: z
    .string()
    .optional()
    .or(z.literal('')),
})

export type RecetaFormValues = z.infer<typeof recetaSchema>
