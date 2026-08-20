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
/**
 * Criterio ÚNICO para meter el `?q=` de una búsqueda GET dentro de un `ilike`.
 *
 * Hace tres cosas, EN ESTE ORDEN, y el orden importa:
 *   1. `trim()`  — los espacios de borde no son parte de lo que el usuario busca.
 *   2. `slice(0, maxLen)` — tope de longitud.
 *   3. Escapa `%`, `_` y `\`, los tres metacaracteres de LIKE/ILIKE en Postgres.
 *
 * ⚠ El escapado va DESPUÉS del `slice`: al revés, el corte podría partir al medio un par
 * `\%` recién insertado y dejar un backslash colgado al final del patrón.
 *
 * ── POR QUÉ ESCAPAR ─────────────────────────────────────────────────────────
 *   Sin esto, un `%` tecleado convierte la búsqueda en un comodín (buscar `%` devuelve
 *   TODAS las filas) y un `_` matchea cualquier carácter. No es una vulnerabilidad —
 *   PostgREST parametriza y la RLS acota el tenant igual—, pero el buscador miente sobre
 *   lo que encontró.
 *
 * ── DÓNDE SE USA ────────────────────────────────────────────────────────────
 *   Los 4 buscadores por nombre/DNI: el listado de `/pacientes`, `GET /api/pacientes`,
 *   `/pedidos` y `/certificados`. Los dos primeros ya lo hacían con la expresión escrita a
 *   mano (idéntica, por suerte); los dos últimos NO escapaban nada. Este helper existe
 *   para que no vuelvan a divergir.
 *
 * ⚠ **El resultado es para el PATRÓN de un `ilike`, no para mostrarle al usuario.** El
 * texto escapado no debe volver a la UI (`defaultValue`, "N resultados para …"): para eso
 * va el `q` crudo. Por eso los llamadores mantienen las dos variables.
 * ⚠ Tampoco sirve para un `eq`, un `in` ni un `fts`: ahí el backslash es un carácter más y
 * este helper haría que la comparación falle.
 */
export function sanitizarTextoBusqueda(raw: string | null | undefined, maxLen = 100): string {
  if (!raw) return ''
  return raw.trim().slice(0, maxLen).replace(/[%_\\]/g, (c) => `\\${c}`)
}
