import * as z from 'zod'

export const DIFUSION_ESTADOS = ['borrador', 'listo', 'enviado', 'archivado'] as const
export type DifusionEstado = typeof DIFUSION_ESTADOS[number]

export const DIFUSION_CANALES = ['email', 'whatsapp', 'ambos'] as const
export type DifusionCanal = typeof DIFUSION_CANALES[number]

export const DIFUSION_ESTADO_LABELS: Record<DifusionEstado, string> = {
  borrador: 'Borrador',
  listo: 'Listo para enviar',
  enviado: 'Enviado',
  archivado: 'Archivado',
}

export const DIFUSION_CANAL_LABELS: Record<DifusionCanal, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  ambos: 'Email y WhatsApp',
}

export const difusionBaseSchema = z.object({
  titulo: z
    .string()
    .min(3, 'El título debe tener al menos 3 caracteres')
    .max(200, 'El título no puede superar los 200 caracteres')
    .trim(),
  contenido: z
    .string()
    .min(10, 'El contenido debe ser un poco más largo (mín. 10 caracteres)')
    .max(10000, 'El contenido no puede superar los 10.000 caracteres')
    .trim(),
  estado: z.enum(DIFUSION_ESTADOS).default('borrador'),
  canal: z.enum(DIFUSION_CANALES).default('email'),
  asunto_email: z
    .string()
    .max(200, 'El asunto de email no puede superar los 200 caracteres')
    .optional()
    .nullable()
    .transform((val) => val?.trim() || null),
  imagen_path: z
    .string()
    .max(500, 'La ruta de la imagen es demasiado larga')
    .optional()
    .nullable(),
})

export const difusionSchema = difusionBaseSchema.refine((data) => {
  if ((data.canal === 'email' || data.canal === 'ambos') && !data.asunto_email) {
    return false
  }
  return true
}, {
  message: 'El asunto es obligatorio si el canal incluye Email',
  path: ['asunto_email'],
})

export type DifusionFormValues = z.infer<typeof difusionSchema>
export type DifusionFormInput = z.input<typeof difusionSchema>
