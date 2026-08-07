-- Copia ejecutable de supabase/migrations/037_bloqueos_rls.sql
-- — pegar en el SQL Editor de Supabase y correr UNA sola vez.
--
-- ⚠ ES LA SEGUNDA DE DOS. Correr DESPUÉS de MIGRACION-12-bloqueos-updated-at.sql.
--
-- ORDEN DE TRABAJO:
--   PASO 1 → correr el bloque BEGIN…COMMIT de más abajo.
--   PASO 2 → correr las verificaciones V1–V2 de acá arriba.
--   PASO 3 → verificación funcional con DOS sesiones (ver abajo). ⚠ Ésta importa:
--            es un cambio de permisos, y compilar no prueba nada.
--
-- ⚠ Las verificaciones están arriba para tenerlas a mano, pero se corren DESPUÉS del
--   COMMIT. Están comentadas: si pegás el archivo entero, no se ejecutan.
--
-- ============================================================================
-- VERIFICACIONES — correr DESPUÉS de aplicar
-- ============================================================================
--
-- ── V1. Las 4 políticas: rol y expresión ────────────────────────────────────
-- Esperado: 4 filas, TODAS con roles = {authenticated} (antes eran {public}).
-- Y el `qual` de bloqueos_select tiene que incluir el OR de los dos permisos:
--   ((medico_id = get_medico_id()) AND (check_permiso(auth.uid(), 'ver_turnos'::text)
--    OR check_permiso(auth.uid(), 'gestionar_turnos'::text)))
--
-- SELECT policyname, cmd, roles, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'bloqueos_agenda'
-- ORDER BY cmd, policyname;
--
--
-- ── V2. Contraste con turnos: ¿quedó todo el bloque de agenda coherente? ────
-- Informativo. `turnos` ya estaba en authenticated o no según la 029/033 — sirve para
-- ver las dos tablas de la agenda lado a lado y detectar si queda algo desparejo.
--
-- SELECT tablename, policyname, cmd, roles
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename IN ('bloqueos_agenda', 'turnos')
-- ORDER BY tablename, cmd, policyname;
--
--
-- ============================================================================
-- VERIFICACIÓN FUNCIONAL — DOS SESIONES. ⚠ Es la que importa.
-- ============================================================================
-- Este cambio endurece una política de LECTURA. Lo que hay que probar es que NO se
-- rompió nada para quien sí tiene permiso, en las tres combinaciones que existen:
--
--   CASO A — médico (siempre pasa: check_permiso() devuelve TRUE para rol médico):
--     Abrir el turnero → ✅ los bloqueos se ven, se crean, se editan y se borran.
--
--   CASO B — asistente con `ver_turnos` (con o sin gestionar_turnos):
--     Abrir el turnero → ✅ los bloqueos se ven en el calendario.
--
--   CASO C — ⚠ EL CASO CRÍTICO: asistente con `gestionar_turnos` y SIN `ver_turnos`.
--     Es la combinación que el `OR` de la política existe para proteger. Configurarla
--     desde /perfil (el médico tilda gestionar_turnos y destilda ver_turnos) y probar:
--       1. Editar un bloqueo existente  → ✅ tiene que guardar (NO un 404 "Bloqueo no
--          encontrado" ni un 403 "la base de datos rechazó la modificación").
--       2. Borrar un bloqueo            → ✅ tiene que borrar.
--       3. Crear un bloqueo             → ✅ y el chequeo de solapamiento contra otros
--          bloqueos tiene que seguir detectando los solapes (si deja crear uno encima
--          de otro, la política de SELECT lo está filtrando y hay que revisar).
--     ❌ Si alguno de los tres falla, es la política: revertir con el bloque del final.
--
--   CASO D — asistente SIN ningún permiso de agenda (el hueco que esto cierra):
--     Ya no debería poder leer bloqueos ni por PostgREST directo. Es lo que se está
--     cerrando; no hay camino en la UI para comprobarlo (la app ya no le mostraba nada).
--
-- ============================================================================


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
