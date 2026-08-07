-- ============================================================================
-- Migration 035 — Catálogo: agregar IOSEP a obras_sociales
-- ============================================================================
-- QUÉ CARGA:
--   Una fila en `public.obras_sociales`: **IOSEP** (Instituto de Obra Social del
--   Empleado Provincial). Es una obra social COMÚN EN LA ZONA del consultorio y no
--   estaba en el seed original de la 001, que trae 13 filas de alcance nacional
--   (OSDE, Swiss Medical, Galeno, Medifé, IOMA, PAMI, …).
--
-- POR QUÉ:
--   Al no estar en el catálogo, los pacientes con IOSEP se venían cargando por la vía
--   de escape de texto libre (`pacientes.obra_social_otro`), que existe justamente para
--   eso. Funciona, pero deja el dato fuera del catálogo: no se puede filtrar ni agrupar
--   por obra social, y cada carga depende de cómo la escriba quien da el alta.
--
-- ⚠ ESTO NO ARREGLA, POR SÍ SOLO, A LOS PACIENTES YA CARGADOS.
--   Los que hoy tienen `obra_social_otro = 'IOSEP'` la SIGUEN teniendo como texto libre;
--   esta migración solo hace que en adelante se pueda elegir de la lista. Que esos
--   pacientes muestren bien su obra social lo resuelve el fix de código que acompaña a
--   esta tanda (el fallback `obras_sociales?.nombre ?? obra_social_otro` en el endpoint
--   de búsqueda, los formularios de pedidos/certificados y el dashboard).
--   Reasignarlos de `obra_social_otro` a `obra_social_id` sería una migración de DATOS
--   aparte y OPCIONAL — no hace falta para que se vean bien.
--
-- NO SE TOCA `001_pacientes.sql`:
--   Esa migración ya está aplicada, así que editar su INSERT no cambiaría nada en la base
--   real; y como la secuencia de migraciones no corre desde cero (ver PENDIENTES.md →
--   nota 6, consolidación de baseline pendiente), tampoco se re-ejecutaría en un entorno
--   nuevo. Sería un cambio cosmético que daría la falsa impresión de que IOSEP está cargada.
--
-- IDEMPOTENTE:
--   `obras_sociales.nombre` es `TEXT NOT NULL UNIQUE` (001_pacientes.sql:77), así que el
--   `ON CONFLICT (nombre) DO NOTHING` deja correr esto dos veces sin error y sin duplicar.
--
-- NO TOCA: ni el esquema, ni RLS, ni ninguna otra fila. Es una carga de datos de catálogo.
--   `id` es SERIAL: no se especifica, lo asigna la secuencia.
-- ============================================================================

INSERT INTO public.obras_sociales (nombre) VALUES
  ('IOSEP')
ON CONFLICT (nombre) DO NOTHING;


-- ── VERIFICACIÓN (correr después de aplicar) ────────────────────────────────
-- SELECT id, nombre FROM public.obras_sociales WHERE nombre = 'IOSEP';
-- Esperado: 1 fila, con el id que le haya asignado la secuencia.
--
-- La comprobación funcional es en la app: al dar de alta o editar un paciente, IOSEP
-- tiene que aparecer en el selector "Cobertura médica" (abajo del separador, entre las
-- del catálogo, ordenadas por nombre). No requiere ningún cambio de código: los tres
-- consumidores leen el catálogo completo con `.select('*').order('nombre')`.

-- ── REVERSIBLE ──────────────────────────────────────────────────────────────
-- ⚠ Solo mientras NINGÚN paciente la tenga asignada — un DELETE con pacientes
--    referenciando la fila falla por la FK `pacientes.obra_social_id`. Chequear antes:
--      SELECT count(*) FROM public.pacientes p
--      JOIN public.obras_sociales o ON o.id = p.obra_social_id
--      WHERE o.nombre = 'IOSEP';
-- DELETE FROM public.obras_sociales WHERE nombre = 'IOSEP';
