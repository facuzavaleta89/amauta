import { z } from 'zod'

// ── Fecha ─────────────────────────────────────────────────────────────────────
/** Verifica que un string sea parseable como fecha válida */
export function isValidDateStr(v: string): boolean {
  if (!v) return false
  const d = new Date(v)
  return !isNaN(d.getTime())
}

/** Schema reutilizable para campos de fecha opcionales (ISO string) */
export const optionalDateSchema = z
  .string()
  .refine((v) => !v || isValidDateStr(v), 'Fecha inválida')
  .optional()
  .nullable()

/** Schema para fecha obligatoria */
export const requiredDateSchema = z
  .string()
  .min(1, 'La fecha es obligatoria')
  .refine(isValidDateStr, 'Fecha inválida')

// ── UUID ──────────────────────────────────────────────────────────────────────
/** Schema reutilizable para IDs UUID (usado en path params y foreign keys) */
export const uuidSchema = z.string().uuid('ID inválido')

// ── Color hex ─────────────────────────────────────────────────────────────────
/** Acepta colores hex como #fff o #1a2b3c, o cadena vacía / null */
export const colorHexSchema = z
  .string()
  .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, 'Color inválido (usa formato #RGB o #RRGGBB)')
  .optional()
  .nullable()

// ── Texto libre con límite ────────────────────────────────────────────────────
/** Texto corto (nombre, título) */
export const shortTextSchema = (max = 200) =>
  z.string().max(max, `Máximo ${max} caracteres`).optional().nullable()

/** Texto largo (notas clínicas, contenido) */
export const longTextSchema = (max = 5000) =>
  z.string().max(max, `Máximo ${max} caracteres`).optional().nullable()

// ── Query string de búsqueda ──────────────────────────────────────────────────
/** Limita y sanitiza el parámetro ?q de las búsquedas GET */
export function sanitizeSearchQuery(raw: string | null, maxLen = 100): string {
  if (!raw) return ''
  return raw.trim().slice(0, maxLen)
}
