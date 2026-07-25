// ============================================================================
// filename.ts — Nombre de archivo de los documentos descargables (cliente + servidor).
// ----------------------------------------------------------------------------
// Módulo NEUTRO (sin 'server-only' ni deps de servidor): lo importan tanto los
// Route Handlers como los Client Components, para que el nombre del PDF sea EXACTAMENTE
// el mismo se descargue desde el botón (a.download) o abriendo la URL del endpoint
// (Content-Disposition). Evita la divergencia que existía antes (el cliente omitía la
// fecha y no sanitizaba).
// ============================================================================

import { sanitizePdfFilename } from '@/lib/utils'

/** Documentos con nombre de archivo unificado. NO incluye el "tipo de certificado". */
export type DocumentoDescargable = 'certificado' | 'pedido'

/**
 * Construye el nombre de archivo de un documento descargable: `<tipo>_<paciente>_<fecha>.pdf`.
 *
 * - NO interpola el "tipo de certificado" (era nullable → producía `certificado_null_…`).
 * - Todo el string pasa por `sanitizePdfFilename` (tildes, caracteres inseguros, espacios).
 * - Si `fecha` falta (null/undefined/vacía), se omite ese segmento en vez de escribir
 *   "null"/"undefined".
 */
export function buildDocumentoFilename(
  tipo: DocumentoDescargable,
  pacienteNombre: string,
  fecha?: string | null,
): string {
  const segmentos = [tipo, pacienteNombre, fecha].filter(
    (s): s is string => typeof s === 'string' && s.trim().length > 0,
  )
  return sanitizePdfFilename(`${segmentos.join('_')}.pdf`)
}
