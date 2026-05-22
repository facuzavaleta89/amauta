import { z } from 'zod'

// ── Helpers ───────────────────────────────────────────────────────────────────
function isValidDate(str: string) {
  if (!str) return false
  const d = new Date(str)
  return !isNaN(d.getTime())
}

function getAge(fechaNac: string): number {
  const birth = new Date(fechaNac)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

// ── Schema ────────────────────────────────────────────────────────────────────
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
    .regex(
      /^[a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s'\-\.]+$/,
      'El nombre solo puede contener letras, espacios y guiones'
    )
    .trim(),

  fecha_nacimiento: z
    .string()
    .min(1, 'La fecha de nacimiento es obligatoria')
    .refine(isValidDate, 'Ingresá una fecha válida')
    .refine(
      (v) => new Date(v) <= new Date(),
      'La fecha de nacimiento no puede ser en el futuro'
    )
    .refine(
      (v) => getAge(v) <= 120,
      'La edad no puede superar los 120 años'
    ),

  sexo: z.enum(['masculino', 'femenino', 'otro'], {
    message: 'Seleccioná un sexo',
  }),

  telefono: z
    .string()
    .regex(
      /^[\d\s\+\-\(\)]{6,20}$/,
      'Formato inválido (ej: +54 11 1234-5678)'
    )
    .optional()
    .or(z.literal('')),

  email: z
    .string()
    .email('Ingresá un email válido')
    .optional()
    .or(z.literal('')),

  provincia: z.string().max(50).optional().or(z.literal('')),
  ciudad: z.string().max(50).optional().or(z.literal('')),

  obra_social_id: z.number().optional(),
  obra_social_otro: z.string().max(100).optional().or(z.literal('')),
  numero_afiliado: z.string().max(50).optional().or(z.literal('')),
})

export type PacienteFormValues = z.infer<typeof pacienteSchema>
