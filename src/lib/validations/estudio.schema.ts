import * as z from 'zod'
import { ESTUDIOS_ALLOWED_MIME_TYPES, ESTUDIOS_MAX_FILE_SIZE } from '@/lib/supabase/storage'

// ============================================================================
// Validación de estudios complementarios.
// Se separa la metadata (Zod) de la validación del archivo (helper reutilizable
// entre cliente y servidor). El servidor valida SIEMPRE, no confía en el cliente.
// ============================================================================

/** Metadatos del estudio (los que llegan como campos del FormData). */
export const estudioMetadataSchema = z.object({
  paciente_id: z.string().uuid(),
  nombre: z
    .string()
    .trim()
    .min(1, 'El nombre del estudio es requerido')
    .max(200, 'Máximo 200 caracteres'),
  tipo: z.string().trim().max(100, 'Máximo 100 caracteres').optional().nullable(),
  fecha_estudio: z
    .string()
    .optional()
    .nullable()
    .refine((v) => !v || v.trim() === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), {
      message: 'La fecha del estudio no tiene un formato válido (YYYY-MM-DD).',
    }),
  descripcion: z.string().trim().max(2000, 'Máximo 2000 caracteres').optional().nullable(),
})

export type EstudioMetadataInput = z.input<typeof estudioMetadataSchema>
export type EstudioMetadata = z.infer<typeof estudioMetadataSchema>

/**
 * Valida un archivo por tamaño y MIME. Reutilizable en cliente (antes de enviar) y en
 * servidor (sobre el File real del FormData). Devuelve un mensaje de error o null.
 */
export function validateEstudioFile(file: { size: number; type: string }): string | null {
  if (!file || file.size === 0) return 'Seleccioná un archivo.'
  if (file.size > ESTUDIOS_MAX_FILE_SIZE) {
    return 'El archivo supera el límite de 10 MB.'
  }
  if (!(ESTUDIOS_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'Formato no permitido. Solo PDF, JPG, PNG o WebP.'
  }
  return null
}
