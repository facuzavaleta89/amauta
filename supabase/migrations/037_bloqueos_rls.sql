-- ============================================================================
-- Migration 037 — bloqueos_agenda: SELECT con permiso + las 4 políticas a authenticated
-- ============================================================================
-- CIERRA DOS COSAS, las dos sobre la misma tabla:
--
-- 1. `bloqueos_select` era TENANT-ONLY — le faltaba el chequeo de permiso.
--    Desde la 005 era `USING (medico_id = get_medico_id())`, sin más. La 015 endureció
--    `bloqueos_insert` con `gestionar_turnos` pero **se salteó el SELECT**, y ni la 029
--    ni la 033 lo retomaron: es una omisión arrastrada, no una decisión registrada.
--    Contraste directo: su hermana `turnos_select` **sí** exige `ver_turnos` (015).
--    Consecuencia: un asistente del tenant SIN NINGÚN permiso de agenda no ve los
--    bloqueos en la app —la UI no se los muestra— pero **puede leerlos por PostgREST
--    directo**, salteando la aplicación. Mismo tipo de hueco que la 026 cerró en
--    `estudios`. Severidad baja (el contenido es `motivo`, texto del consultorio, no
--    dato clínico), pero es una lectura que nadie autorizó.
--
-- 2. Las 4 políticas aplicaban a `{public}`, no a `{authenticated}`.
--    Ninguna declaraba `TO`, y en Postgres eso equivale a `TO PUBLIC`: la política se
--    evalúa para TODOS los roles, `anon` incluido. La 029 normalizó otras tablas a
--    `TO authenticated` y a ésta no la tocó; la 033 tampoco (se limitó al criterio de
--    permisos). Sin impacto explotable hoy —las cuatro cuelgan de `get_medico_id()`, que
--    para `anon` no resuelve—, pero es defensa en profundidad y consistencia de esquema.
--
-- ── LA DECISIÓN DEL PUNTO 1: `ver_turnos` OR `gestionar_turnos` ──────────────
--   `bloqueos_select` NO espeja a `turnos_select` (que pide solo `ver_turnos`): pide
--   **cualquiera de los dos permisos de agenda**. Es deliberado y sigue el criterio que
--   la 033 dejó asentado — **"la agenda es una unidad de permiso"**: quien puede
--   gestionarla puede leer sus bloqueos.
--
--   ⚠ El motivo concreto, y no es teórico: los 12 permisos son booleanos INDEPENDIENTES
--   (todos `false` por defecto) y **nada obliga a que `gestionar_turnos` implique
--   `ver_turnos`** — ni la base, ni los endpoints, ni el panel de `/perfil`. Un asistente
--   con `gestionar_turnos` y SIN `ver_turnos` es una combinación configurable hoy. Con un
--   `USING` que pidiera solo `ver_turnos`, ese asistente perdería la lectura de bloqueos
--   y **se le romperían los endpoints de edición y borrado**, que hacen un fetch previo y
--   un `.select()` de verificación sobre esta misma tabla (ver
--   `src/app/api/turnero/bloqueos/[id]/route.ts`). El `OR` neutraliza ese riesgo por
--   diseño: quien pasa el chequeo del endpoint pasa también el de la política.
--
-- ── LO QUE NO CAMBIA ────────────────────────────────────────────────────────
--   `bloqueos_insert`, `bloqueos_update` y `bloqueos_delete` conservan su
--   `USING`/`WITH CHECK` EXACTO (tenant + `gestionar_turnos`). Se re-emiten **solo** para
--   agregarles `TO authenticated`; las expresiones se copiaron textualmente de la 015
--   (insert) y la 033 (update/delete). **No se reinventó ninguna.**
--
--   `WITH CHECK` sigue OMITIDO en update/delete, igual que en la 033: en Postgres, si una
--   política de UPDATE/DELETE no lo declara, el `USING` oficia de check → nadie puede
--   mover una fila a otro tenant. Agregarlo sería redundante.
--
-- ── LO QUE ESTA MIGRACIÓN NO TOCA ───────────────────────────────────────────
--   Ningún endpoint. El `OR gestionar_turnos` está elegido justamente para que el código
--   actual siga funcionando sin cambios.
--
-- Envuelto en transacción: los DROP+CREATE dejan un instante sin política; BEGIN/COMMIT
--   lo hace atómico.
-- Reversible: ver el bloque comentado al final.
-- ============================================================================

BEGIN;

-- 1. SELECT — suma el chequeo de permiso (ver_turnos OR gestionar_turnos) + authenticated
DROP POLICY IF EXISTS "bloqueos_select" ON public.bloqueos_agenda;
CREATE POLICY "bloqueos_select" ON public.bloqueos_agenda
  FOR SELECT TO authenticated USING (
    medico_id = get_medico_id()
    AND (
      public.check_permiso(auth.uid(), 'ver_turnos')
      OR public.check_permiso(auth.uid(), 'gestionar_turnos')
    )
  );

-- 2. INSERT — misma expresión que la 015, solo cambia el rol
DROP POLICY IF EXISTS "bloqueos_insert" ON public.bloqueos_agenda;
CREATE POLICY "bloqueos_insert" ON public.bloqueos_agenda
  FOR INSERT TO authenticated WITH CHECK (
    medico_id = get_medico_id()
    AND public.check_permiso(auth.uid(), 'gestionar_turnos')
  );

-- 3. UPDATE — misma expresión que la 033, solo cambia el rol
DROP POLICY IF EXISTS "bloqueos_update" ON public.bloqueos_agenda;
CREATE POLICY "bloqueos_update" ON public.bloqueos_agenda
  FOR UPDATE TO authenticated USING (
    medico_id = get_medico_id()
    AND public.check_permiso(auth.uid(), 'gestionar_turnos')
  );

-- 4. DELETE — misma expresión que la 033, solo cambia el rol
DROP POLICY IF EXISTS "bloqueos_delete" ON public.bloqueos_agenda;
CREATE POLICY "bloqueos_delete" ON public.bloqueos_agenda
  FOR DELETE TO authenticated USING (
    medico_id = get_medico_id()
    AND public.check_permiso(auth.uid(), 'gestionar_turnos')
  );

COMMIT;

-- ── VERIFICACIÓN (correr por separado después del COMMIT) ────────────────────
-- SELECT tablename, policyname, cmd, roles, qual, with_check FROM pg_policies
-- WHERE schemaname='public' AND tablename='bloqueos_agenda' ORDER BY cmd, policyname;
-- Esperado: 4 filas, TODAS con roles = {authenticated} (antes {public}), y el `qual` de
-- bloqueos_select con el OR de los dos permisos.
--
-- La prueba REAL es funcional y necesita un asistente con `gestionar_turnos` y SIN
-- `ver_turnos`: tiene que poder seguir editando y borrando bloqueos. Ver la copia suelta
-- MIGRACION-13-* para los pasos.

-- ── REVERSIBLE ──────────────────────────────────────────────────────────────
-- Restaura el estado previo (SELECT tenant-only y las 4 sin TO, o sea {public}):
-- BEGIN;
--   DROP POLICY IF EXISTS "bloqueos_select" ON public.bloqueos_agenda;
--   CREATE POLICY "bloqueos_select" ON public.bloqueos_agenda
--     FOR SELECT USING (medico_id = get_medico_id());
--   DROP POLICY IF EXISTS "bloqueos_insert" ON public.bloqueos_agenda;
--   CREATE POLICY "bloqueos_insert" ON public.bloqueos_agenda
--     FOR INSERT WITH CHECK (medico_id = get_medico_id()
--       AND public.check_permiso(auth.uid(), 'gestionar_turnos'));
--   DROP POLICY IF EXISTS "bloqueos_update" ON public.bloqueos_agenda;
--   CREATE POLICY "bloqueos_update" ON public.bloqueos_agenda
--     FOR UPDATE USING (medico_id = get_medico_id()
--       AND public.check_permiso(auth.uid(), 'gestionar_turnos'));
--   DROP POLICY IF EXISTS "bloqueos_delete" ON public.bloqueos_agenda;
--   CREATE POLICY "bloqueos_delete" ON public.bloqueos_agenda
--     FOR DELETE USING (medico_id = get_medico_id()
--       AND public.check_permiso(auth.uid(), 'gestionar_turnos'));
-- COMMIT;
