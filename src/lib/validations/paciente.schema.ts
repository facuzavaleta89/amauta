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

  // ⚠ Los dos campos de obra social aceptan NULL a propósito, y no es cosmético:
  // SOLTAR la obra social del catálogo (pasar a texto libre o a "particular") exige
  // mandar `obra_social_id: null` EXPLÍCITO. Con `undefined` la clave se pierde en el
  // `JSON.stringify` del formulario, nunca llega al PATCH y la columna conserva el valor
  // viejo — el UPDATE no la incluye. Era un bug real: el cambio no persistía y el toast
  // decía "Paciente actualizado".
  obra_social_id: z.number().nullable().optional(),
  // El `.transform()` normaliza en la ESCRITURA (patrón de `receta.schema.ts` →
  // `indicaciones`/`diagnostico`): recorta los espacios de BORDE y colapsa a `null` lo que
  // quede vacío, así un texto de solo espacios no entra sucio a la base. ⚠ El trim es de
  // bordes: un nombre real con espacios internos ("Obra Social del Personal Rural") se
  // guarda entero.
  obra_social_otro: z
    .string()
    .max(100, 'El nombre no puede superar los 100 caracteres')
    .nullable()
    .optional()
    .or(z.literal(''))
    .transform((val) => val?.trim() || null),
  numero_afiliado: z.string().max(50).optional().or(z.literal('')),
}).refine(
  (data) => {
    // Si no hay obra_social_id y hay texto en obra_social_otro, debe tener al menos 2 chars.
    // Sin `.trim()`: el valor ya llega recortado por el `.transform()` del campo.
    if (!data.obra_social_id && data.obra_social_otro && data.obra_social_otro.length > 0) {
      return data.obra_social_otro.length >= 2
    }
    return true
  },
  {
    message: 'Ingresá el nombre de la obra social (mínimo 2 caracteres)',
    path: ['obra_social_otro'],
  }
)

// ⚠ Dos tipos porque el `.transform()` de `obra_social_otro` hace que ENTRADA y SALIDA
// difieran: el form se tipa con el INPUT y `handleSubmit` entrega el OUTPUT. Ver el
// `useForm` de tres genéricos en `patient-form.tsx` (mismo patrón que `consulta-detail.tsx`).
export type PacienteFormValues = z.infer<typeof pacienteSchema>
export type PacienteFormInput  = z.input<typeof pacienteSchema>
