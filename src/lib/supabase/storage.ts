// ============================================================================
// Helper central de Storage para el bucket privado `estudios`.
// ============================================================================
// Convenciones fijadas por la migración 026:
//   · Bucket privado `estudios`, límite 10 MB, MIME: pdf/jpeg/png/webp.
//   · Ruta de los objetos: {medico_id}/{paciente_id}/{uuid}.{ext}
//     El medico_id es el PRIMER segmento porque las políticas RLS de storage.objects
//     comparan esa carpeta contra get_medico_id() para aislar por tenant. Cambiar
//     esta estructura haría que las políticas rechacen la operación.
//
// Decisión cliente de sesión vs admin (se aplica en los Route Handlers, no acá):
//   · Para subir/listar/descargar/borrar objetos usamos el CLIENTE DE SESIÓN (server.ts):
//     la RLS de storage.objects y de la tabla `estudios` es defensa real (aísla por
//     tenant y valida ver_historia_clinica / rol médico). No hay motivo para saltearla.
//     La descarga se sirve por PROXY (GET /api/estudios/[id]): el servidor baja el objeto
//     con `.download()` y transmite los bytes; nunca se expone la URL de Storage.
//   · El admin client (bypass RLS) se reserva SOLO para leer `pacientes.archivado_at` y
//     la pertenencia al tenant en el POST: quien tiene ver_historia_clinica puede no
//     tener ver_pacientes, y un SELECT por RLS sobre pacientes daría un 404 falso.
// ============================================================================

/** Nombre del bucket privado de estudios (debe coincidir con la migración 026). */
export const ESTUDIOS_BUCKET = 'estudios'

/** Límite de tamaño por archivo: 10 MB (igual que file_size_limit del bucket). */
export const ESTUDIOS_MAX_FILE_SIZE = 10 * 1024 * 1024 // 10485760 bytes

/** MIME permitidos (debe coincidir con allowed_mime_types del bucket). */
export const ESTUDIOS_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export type EstudioMimeType = (typeof ESTUDIOS_ALLOWED_MIME_TYPES)[number]

/** Extensión canónica por MIME (para derivarla cuando el nombre no la trae). */
const EXT_BY_MIME: Record<EstudioMimeType, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** Extensiones reconocidas en el nombre original del archivo. */
const KNOWN_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp'])

/**
 * Extrae la extensión del nombre original (en minúsculas). Si no hay una extensión
 * reconocida, la deriva del MIME. `jpeg` se normaliza a `jpg`.
 */
export function resolveExtension(originalName: string, mimeType: string): string {
  const dot = originalName.lastIndexOf('.')
  if (dot !== -1 && dot < originalName.length - 1) {
    const raw = originalName.slice(dot + 1).toLowerCase()
    if (KNOWN_EXTENSIONS.has(raw)) {
      return raw === 'jpeg' ? 'jpg' : raw
    }
  }
  return EXT_BY_MIME[mimeType as EstudioMimeType] ?? 'bin'
}

/**
 * Construye la ruta del objeto en el bucket: {medico_id}/{paciente_id}/{uuid}.{ext}.
 * El UUID evita colisiones y no filtra el nombre original (ese va en `file_name`).
 */
export function buildEstudioPath(
  medicoId: string,
  pacienteId: string,
  originalName: string,
  mimeType: string,
): string {
  const ext = resolveExtension(originalName, mimeType)
  return `${medicoId}/${pacienteId}/${crypto.randomUUID()}.${ext}`
}

// ============================================================================
// Bucket privado `documentos` — PDFs congelados de pedidos y certificados.
// ----------------------------------------------------------------------------
// Convenciones fijadas por la migración 027:
//   · Bucket privado `documentos`, límite 5 MB, MIME: solo application/pdf.
//   · Ruta de los objetos: {medico_id}/{tipo}/{documento_id}.pdf
//     El medico_id es el PRIMER segmento porque las políticas RLS de storage.objects
//     lo comparan contra get_medico_id() para aislar por tenant (igual que `estudios`).
//
// El PDF se congela UNA sola vez, al emitir el documento (POST). En la descarga,
// si `pdf_path` existe se sirve ese objeto; si es NULL se regenera al vuelo SIN
// persistir (no hay backfill: los documentos viejos siguen mutando a propósito).
// ============================================================================

/** Nombre del bucket privado de documentos (debe coincidir con la migración 027). */
export const DOCUMENTOS_BUCKET = 'documentos'

/** Límite de tamaño por archivo: 5 MB (igual que file_size_limit del bucket). */
export const DOCUMENTOS_MAX_FILE_SIZE = 5 * 1024 * 1024 // 5242880 bytes

/**
 * Tipos de documento que pueden congelarse en el bucket `documentos`.
 * `receta` queda previsto para no reescribir esto el día que se habilite (ANMAT),
 * pero HOY está fuera de alcance: no hay plantilla ni emisión de recetas.
 */
export type DocumentoTipo = 'pedido' | 'certificado' | 'receta'

/**
 * Construye la ruta del objeto: {medico_id}/{tipo}/{documento_id}.pdf.
 *
 * A diferencia de `buildEstudioPath`, el path es DETERMINÍSTICO (sin UUID aleatorio):
 * el `documento_id` ya es único, y usarlo como nombre hace que regenerar el PDF del
 * mismo documento pise el MISMO objeto vía `upsert: true` en vez de dejar huérfanos.
 * Esto es lo que vuelve idempotente un reintento de emisión.
 */
export function buildDocumentoPath(
  medicoId: string,
  tipo: DocumentoTipo,
  documentoId: string,
): string {
  return `${medicoId}/${tipo}/${documentoId}.pdf`
}
