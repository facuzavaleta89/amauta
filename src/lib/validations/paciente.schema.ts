import { z } from 'zod'

export const pacienteSchema = z.object({
  dni: z
    .string()
    .min(7, 'El DNI debe tener al menos 7 dígitos')
    .max(8, 'El DNI no puede tener más de 8 dígitos')
    .regex(/^\d+$/, 'El DNI solo debe contener números'),

  nombre_completo: z
    .string()
    .min(3, 'El nombre debe tener al menos 3 caracteres')
    .max(100, 'El nombre es demasiado largo')
    .trim(),

  fecha_nacimiento: z
    .string()
    .min(1, 'La fecha de nacimiento es obligatoria'),

  sexo: z.enum(['masculino', 'femenino', 'otro']),

  telefono: z.string().max(20).optional().or(z.literal('')),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  provincia: z.string().max(50).optional().or(z.literal('')),
  ciudad: z.string().max(50).optional().or(z.literal('')),

  obra_social_id: z.number().optional(),
  obra_social_otro: z.string().max(100).optional().or(z.literal('')),
  numero_afiliado: z.string().max(50).optional().or(z.literal('')),
})

export type PacienteFormValues = z.infer<typeof pacienteSchema>
