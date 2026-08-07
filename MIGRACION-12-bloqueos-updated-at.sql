-- Copia ejecutable de supabase/migrations/036_bloqueos_updated_at.sql
-- — pegar en el SQL Editor de Supabase y correr UNA sola vez.
--
-- ⚠ ES LA PRIMERA DE DOS. Correr ESTA antes que MIGRACION-13-bloqueos-rls.sql.
--   (No hay dependencia técnica entre ambas, pero este orden deja la tabla completa
--    antes de tocarle los permisos, y es el orden en que están escritas y verificadas.)
--
-- ORDEN DE TRABAJO:
--   PASO 1 → correr el bloque BEGIN…COMMIT de más abajo.
--   PASO 2 → correr las verificaciones V1–V3 de acá arriba.
--   PASO 3 → seguir con MIGRACION-13-bloqueos-rls.sql.
--
-- ⚠ Las verificaciones están arriba para tenerlas a mano, pero se corren DESPUÉS del
--   COMMIT. Están comentadas: si pegás el archivo entero, no se ejecutan.
--
-- ============================================================================
-- VERIFICACIONES — correr DESPUÉS de aplicar
-- ============================================================================
--
-- ── V1. La columna existe, con el tipo y el default correctos ───────────────
-- Esperado: 1 fila → timestamp with time zone | NO | now()
--
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name   = 'bloqueos_agenda'
--   AND column_name  = 'updated_at';
--
--
-- ── V2. El trigger existe y está habilitado ─────────────────────────────────
-- Esperado: 1 fila → bloqueos_updated_at | O   ('O' = habilitado, origin)
-- ⚠ Antes de esta migración esta consulta devolvía 0 filas: la tabla no tenía
--   ningún trigger propio.
--
-- SELECT tgname, tgenabled
-- FROM pg_trigger
-- WHERE tgrelid = 'public.bloqueos_agenda'::regclass
--   AND NOT tgisinternal;
--
--
-- ── V3. El sembrado dice la verdad: ningún bloqueo figura como editado ──────
-- Esperado: las dos columnas iguales (todos los bloqueos existentes tienen
-- updated_at = created_at, o sea "creado entonces, nunca modificado").
--
-- SELECT count(*) AS total,
--        count(*) FILTER (WHERE updated_at = created_at) AS nunca_editados
-- FROM public.bloqueos_agenda;
--
--
-- ── VERIFICACIÓN FUNCIONAL (opcional, en la app) ────────────────────────────
--   Editar un bloqueo desde el turnero y volver a correr:
--     SELECT id, motivo, created_at, updated_at FROM public.bloqueos_agenda
--     ORDER BY updated_at DESC LIMIT 3;
--   ✅ ESPERADO: el bloqueo editado ahora tiene updated_at > created_at.
--   (Es la prueba de que el trigger dispara — V2 solo confirma que existe.)
--
-- ============================================================================


-- ============================================================================
-- Migration 036 — bloqueos_agenda: columna updated_at + trigger
-- ============================================================================
-- PROBLEMA QUE RESUELVE:
--   `bloqueos_agenda` nació en la 005 con **solo `created_at`**, mientras que su tabla
--   hermana `turnos` tiene `created_at` + `updated_at` + el trigger `turnos_updated_at`.
--   La asimetría no molestaba mientras los bloqueos, en la práctica, no se editaban.
--
--   ⚠ ESO CAMBIÓ CON LA MIGRACIÓN 033. Hasta entonces `bloqueos_agenda` NO TENÍA POLÍTICA
--   DE UPDATE, así que editar un bloqueo afectaba 0 filas en silencio: no había ediciones
--   que registrar. La 033 creó `bloqueos_update`, y desde ese momento **los bloqueos son
--   editables de verdad** —por el médico y por el asistente con `gestionar_turnos`— y
--   **no queda registro de CUÁNDO se editó ninguno**.
--
-- QUÉ HACE (tres pasos, en una transacción):
--   1. Agrega `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
--   2. **Siembra las filas existentes con su `created_at`.** Sin este paso, el DEFAULT
--      dejaría a todos los bloqueos históricos con `updated_at = now()`, o sea afirmando
--      que se editaron en el instante de la migración — una edición que NUNCA OCURRIÓ.
--      Igualarlo a `created_at` dice la verdad: "creado entonces, nunca modificado".
--   3. Cuelga el trigger `bloqueos_updated_at`, espejo exacto de `turnos_updated_at`.
--
-- ⚠ NO SE RECREA `set_updated_at()`:
--   La función ya existe desde la 001 (`001_pacientes.sql:154-160`), es genérica
--   (`NEW.updated_at = now(); RETURN NEW;`) y la comparten 5+ tablas (`pacientes`,
--   `profiles`, `turnos`, `consultas`, `solicitudes_asistente`…). Acá solo se le cuelga un
--   trigger nuevo. Tocarla afectaría a todas esas tablas.
--
-- ALCANCE — lo que esto NO es:
--   Esto registra **cuándo** se editó un bloqueo, no **quién** ni **qué**. No hay un
--   equivalente de `turnos_audit_log` para bloqueos (verificado: la única tabla de
--   auditoría del proyecto es esa, y su FK apunta a `turnos(id)`). Una auditoría completa
--   de bloqueos es trabajo aparte, no previsto en esta tanda.
--
-- CAMBIO DE TIPOS QUE VA JUNTO:
--   `BloqueoAgenda` en `src/types/turno.ts` suma `updated_at: string` en el mismo commit.
--   `BloqueoAgendaInsert` NO lo lleva: lo pone el DEFAULT.
--
-- Envuelto en transacción: los tres pasos son un solo cambio. Si el trigger fallara, no
--   queremos la columna a medio sembrar.
-- Reversible: ver el bloque comentado al final.
-- ============================================================================

BEGIN;

-- 1. La columna
ALTER TABLE public.bloqueos_agenda
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 2. Las filas existentes nunca se editaron: updated_at = created_at, no now()
UPDATE public.bloqueos_agenda
   SET updated_at = created_at;

-- 3. El trigger — espeja turnos_updated_at (005_turnos.sql:77-79)
CREATE TRIGGER bloqueos_updated_at
  BEFORE UPDATE ON public.bloqueos_agenda
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

COMMIT;

-- ── REVERSIBLE ──────────────────────────────────────────────────────────────
-- BEGIN;
--   DROP TRIGGER IF EXISTS bloqueos_updated_at ON public.bloqueos_agenda;
--   ALTER TABLE public.bloqueos_agenda DROP COLUMN IF EXISTS updated_at;
-- COMMIT;
-- (⚠ Revertir PIERDE los updated_at acumulados. No afecta a `set_updated_at()`, que
--  siguen usando las otras tablas.)
