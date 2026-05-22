import { z } from 'zod'

export const pedidoSchema = z.object({
  paciente_id: z
    .string()
    .uuid('Seleccioná un paciente válido')
    .min(1, 'El paciente es obligatorio'),

  tipo_estudio: z
    .string()
    .min(3, 'Describí el tipo de estudio (mín. 3 caracteres)')
    .max(200, 'Máximo 200 caracteres'),

  indicaciones: z
    .string()
    .max(2000, 'Máximo 2000 caracteres')
    .optional()
    .or(z.literal('')),

  urgente: z.boolean().default(false),

  fecha_pedido: z
    .string()
    .optional()
    .or(z.literal('')),
})

export type PedidoFormValues = z.infer<typeof pedidoSchema>
