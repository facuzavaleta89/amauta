-- ============================================================================
-- Migration 033 — RLS de la agenda: UPDATE faltante en bloqueos + DELETE del asistente
-- ============================================================================
-- CIERRA TRES COSAS:
--
-- 1. bloqueos_update: la política de UPDATE que nunca existió. bloqueos_agenda
--    nació en la 005 con SELECT/INSERT/DELETE y sin UPDATE; ni la 013 ni la 015
--    la agregaron. Con RLS activa y sin política, el UPDATE afecta 0 filas en
--    silencio y la UI muestra falso éxito. Espeja turnos_update.
--
-- 2. bloqueos_delete: se reemplaza la política solo-médico por una que abre el
--    borrado al asistente con gestionar_turnos (Opción A, decidida con el equipo).
--    Criterio: la agenda es una unidad de permiso — el asistente con gestionar_turnos
--    ya crea y (tras el punto 1) edita bloqueos, así que también borra. Alinea la
--    base con lo que el endpoint DELETE ya permitía.
--
-- 3. turnos_delete: mismo cambio, misma razón. El endpoint DELETE de turnos ya
--    dejaba pasar al asistente con gestionar_turnos, pero la política era solo-médico
--    → mismo falso positivo. Se alinea.
--
-- WITH CHECK OMITIDO A PROPÓSITO en las tres: como en turnos_update/insert. En
-- Postgres, si una política de UPDATE/DELETE no declara WITH CHECK, el USING oficia
-- de check → nadie puede mover una fila a otro tenant. Agregarlo sería redundante.
--
-- NOTA DE DRIFT: en la base real, bloqueos_delete estaba escrita con un subquery
-- inline a profiles (SELECT role FROM profiles WHERE id = auth.uid()) en vez de
-- get_user_role(). Es equivalente (solo-médico) pero se normaliza al reemplazarla.
--
-- Envuelto en transacción: los DROP+CREATE de políticas existentes dejan un instante
-- sin política; BEGIN/COMMIT lo hace atómico.
-- Reversible: ver el bloque comentado al final.
-- ============================================================================

BEGIN;

-- 1. bloqueos_update (nueva) — espeja turnos_update
DROP POLICY IF EXISTS "bloqueos_update" ON public.bloqueos_agenda;
CREATE POLICY "bloqueos_update" ON public.bloqueos_agenda
  FOR UPDATE USING (
    medico_id = get_medico_id()
    AND public.check_permiso(auth.uid(), 'gestionar_turnos')
  );

-- 2. bloqueos_delete (reemplazo) — abre al asistente con gestionar_turnos
DROP POLICY IF EXISTS "bloqueos_delete" ON public.bloqueos_agenda;
CREATE POLICY "bloqueos_delete" ON public.bloqueos_agenda
  FOR DELETE USING (
    medico_id = get_medico_id()
    AND public.check_permiso(auth.uid(), 'gestionar_turnos')
  );

-- 3. turnos_delete (reemplazo) — mismo criterio, tabla hermana
DROP POLICY IF EXISTS "turnos_delete" ON public.turnos;
CREATE POLICY "turnos_delete" ON public.turnos
  FOR DELETE USING (
    medico_id = get_medico_id()
    AND public.check_permiso(auth.uid(), 'gestionar_turnos')
  );

COMMIT;

-- ── VERIFICACIÓN (correr por separado después del COMMIT) ────────────────────
-- SELECT policyname, cmd, qual, with_check FROM pg_policies
-- WHERE schemaname='public' AND tablename='bloqueos_agenda' ORDER BY cmd;
-- Esperado: 4 filas (DELETE, INSERT, SELECT, UPDATE).
--
-- SELECT policyname, cmd, qual FROM pg_policies
-- WHERE schemaname='public' AND tablename='turnos' AND cmd='DELETE';
-- Esperado: turnos_delete con qual = ((medico_id = get_medico_id()) AND check_permiso(auth.uid(), 'gestionar_turnos'::text))

-- ── REVERSIBLE ──────────────────────────────────────────────────────────────
-- Para volver atrás (restaura el estado solo-médico previo de los DELETE):
-- BEGIN;
--   DROP POLICY IF EXISTS "bloqueos_update" ON public.bloqueos_agenda;
--   DROP POLICY IF EXISTS "bloqueos_delete" ON public.bloqueos_agenda;
--   CREATE POLICY "bloqueos_delete" ON public.bloqueos_agenda
--     FOR DELETE USING (medico_id = auth.uid() AND get_user_role(auth.uid()) = 'medico');
--   DROP POLICY IF EXISTS "turnos_delete" ON public.turnos;
--   CREATE POLICY "turnos_delete" ON public.turnos
--     FOR DELETE USING (medico_id = auth.uid() AND get_user_role(auth.uid()) = 'medico');
-- COMMIT;
