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

-- ── VERIFICACIÓN (correr por separado después del COMMIT) ────────────────────
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='bloqueos_agenda' AND column_name='updated_at';
-- Esperado: 1 fila — timestamp with time zone, NO, now().
--
-- SELECT tgname, tgenabled FROM pg_trigger
-- WHERE tgrelid = 'public.bloqueos_agenda'::regclass AND NOT tgisinternal;
-- Esperado: 1 fila — bloqueos_updated_at, habilitado ('O').
--
-- SELECT count(*) AS nunca_editados FROM public.bloqueos_agenda WHERE updated_at = created_at;
-- Esperado: TODAS las filas (ninguna se editó todavía).

-- ── REVERSIBLE ──────────────────────────────────────────────────────────────
-- BEGIN;
--   DROP TRIGGER IF EXISTS bloqueos_updated_at ON public.bloqueos_agenda;
--   ALTER TABLE public.bloqueos_agenda DROP COLUMN IF EXISTS updated_at;
-- COMMIT;
-- (⚠ Revertir PIERDE los updated_at acumulados. No afecta a `set_updated_at()`, que
--  siguen usando las otras tablas.)
