-- ============================================================================
-- Migration 028 — Snapshot del emisor en pedidos y certificados
-- ============================================================================
-- Congela los datos del médico firmante EN EL MOMENTO DE EMITIR, junto al PDF.
--
-- Contexto: la tanda de persistencia de PDFs (migración 027) congela el PDF al
-- emitir, pero el PREVIEW HTML de la página de detalle (/pedidos/[id],
-- /certificados/[id]) seguía leyendo los datos del médico EN VIVO desde `profiles`.
-- Resultado contradictorio: el médico cambia su firma y el preview muestra la firma
-- nueva mientras el PDF descargado (congelado) muestra la vieja.
--
-- Esta columna resuelve la divergencia: al emitir se guarda una foto de los datos
-- del emisor, y tanto el preview HTML como la regeneración del PDF (fallback) leen
-- de acá en vez de `profiles`. Beneficio adicional: el documento queda RECONSTRUIBLE
-- de forma fiel aunque se pierda el objeto de Storage.
--
-- Esta migración cubre SOLO la capa de base de datos: agrega la columna. El código
-- de la app que la escribe y la lee viene en el prompt siguiente.
--
-- ── Forma esperada del JSON (`emisor_snapshot`) ─────────────────────────────
--   {
--     "full_name":  string,
--     "titulo":     string | null,
--     "matriculas": [ { "tipo": "MP" | "MN" | "ME", "numero": string } ],
--     "firma_url":  string | null,   -- data URL base64 (así se guarda en profiles)
--     "logo_url":   string | null    -- data URL base64
--   }
--   Es exactamente el shape que ya consume la plantilla PDF (prop `medico`), para
--   que el snapshot se pueda pasar tal cual sin transformarlo.
--
-- Nullable a propósito: NO se pone NOT NULL ni DEFAULT.
--   · Un DEFAULT no puede capturar los datos del médico (dependen de la fila que se
--     inserta), así que no tendría sentido.
--   · NOT NULL sin default rompería cualquier inserción que no setee la columna.
--   · La app garantiza escribirla siempre al emitir; los documentos de prueba
--     preexistentes se ELIMINAN por separado (script LIMPIEZA-documentos-prueba.sql,
--     fuera de este historial de migraciones), así que tras la limpieza todas las
--     filas tendrán snapshot y no hará falta código de fallback para "sin snapshot".
--
-- Idempotente: ADD COLUMN IF NOT EXISTS.
--
-- ⚠ Esta migración NO contiene ningún DELETE. El borrado de los documentos de prueba
--   vive en el script suelto LIMPIEZA-documentos-prueba.sql (de un solo uso, manual).
-- ============================================================================


-- ── pedidos ──────────────────────────────────────────────────────────────────
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS emisor_snapshot JSONB;

COMMENT ON COLUMN public.pedidos.emisor_snapshot IS
  'Foto de los datos del médico firmante al emitir (full_name, titulo, matriculas, '
  'firma_url, logo_url). El preview y la regeneración del PDF leen de acá, no de '
  'profiles, para que el documento sea fiel e inmutable. Nullable; la app la escribe '
  'siempre al emitir.';


-- ── certificados ─────────────────────────────────────────────────────────────
ALTER TABLE public.certificados
  ADD COLUMN IF NOT EXISTS emisor_snapshot JSONB;

COMMENT ON COLUMN public.certificados.emisor_snapshot IS
  'Foto de los datos del médico firmante al emitir (full_name, titulo, matriculas, '
  'firma_url, logo_url). El preview y la regeneración del PDF leen de acá, no de '
  'profiles, para que el documento sea fiel e inmutable. Nullable; la app la escribe '
  'siempre al emitir.';


-- ── recetas ──────────────────────────────────────────────────────────────────
-- NO se agrega `emisor_snapshot` a `recetas`: la emisión de recetas está bloqueada
-- hasta cumplir la certificación ANMAT (regla de negocio 7), así que no hay nada que
-- snapshotear todavía. Cuando se habiliten recetas habrá que sumar esta misma columna
-- a `public.recetas` con el mismo shape y criterio.
