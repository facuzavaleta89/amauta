-- Copia ejecutable de supabase/migrations/038_consultas_autor_y_turno_unico.sql
-- — pegar en el SQL Editor de Supabase y correr UNA sola vez.
--
-- ⚠⚠ ESTA MIGRACIÓN VA **ANTES** DE PROBAR EL CÓDIGO DE LA TANDA, no después.
--    El código nuevo escribe `creado_por` al crear una consulta y lo lee al descartar
--    un borrador. Si la columna no existe todavía, PostgREST rechaza el INSERT y
--    **crear consultas deja de funcionar**. Orden correcto: SQL → recién ahí levantar
--    la app.
--
-- ORDEN DE TRABAJO:
--   PASO 1 → correr el bloque BEGIN…COMMIT de más abajo.
--   PASO 2 → correr las verificaciones V1–V4 de acá arriba.
--   PASO 3 → verificación funcional con DOS sesiones (ver abajo). ⚠ Ésta importa:
--            son permisos + un cambio de cuándo se crea un turno; compilar no prueba nada.
--
-- ⚠ Las verificaciones están arriba para tenerlas a mano, pero se corren DESPUÉS del
--   COMMIT. Están comentadas: si pegás el archivo entero, no se ejecutan.
--
-- ============================================================================
-- VERIFICACIONES — correr DESPUÉS de aplicar
-- ============================================================================
--
-- ── V1. La columna `creado_por` existe y es NULLABLE ─────────────────────────
-- Esperado: 1 fila → creado_por | uuid | YES
--
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'consultas' AND column_name = 'creado_por';
--
--
-- ── V2. La política de DELETE quedó con las tres condiciones ────────────────
-- Esperado: 1 fila, cmd = DELETE, roles = {authenticated} (antes {public}), y el `qual`
-- con el tenant, el `estado = 'borrador'` y el OR de rol médico / autor:
--   ((medico_id = get_medico_id()) AND (estado = 'borrador'::text)
--    AND ((get_user_role(auth.uid()) = 'medico'::text) OR (creado_por = auth.uid())))
--
-- SELECT policyname, cmd, roles, qual
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'consultas'
-- ORDER BY cmd, policyname;
--
--
-- ── V3. El índice único parcial de turnos ───────────────────────────────────
-- Esperado: 1 fila, con `UNIQUE INDEX` y el `WHERE (consulta_id IS NOT NULL)`.
--
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public' AND tablename = 'turnos' AND indexname = 'turnos_consulta_id_unico';
--
--
-- ── V4. El índice hace lo que promete (prueba directa, y se revierte sola) ──
-- Opcional pero barata. Tiene que FALLAR con "duplicate key value violates unique
-- constraint turnos_consulta_id_unico". El ROLLBACK deja todo como estaba.
--
-- BEGIN;
--   -- tomá cualquier turno que ya tenga consulta_id y tratá de duplicar el vínculo:
--   -- UPDATE public.turnos SET consulta_id = (SELECT consulta_id FROM public.turnos
--   --   WHERE consulta_id IS NOT NULL LIMIT 1)
--   -- WHERE id = (SELECT id FROM public.turnos WHERE consulta_id IS NULL LIMIT 1);
-- ROLLBACK;
--
--
-- ============================================================================
-- VERIFICACIÓN FUNCIONAL — DOS SESIONES. ⚠ Es la que importa.
-- ============================================================================
--
--   CASO A — médico, descarte de borrador:
--     1. Crear una consulta y guardarla como BORRADOR.
--     2. En la HC del paciente, el botón "Descartar" tiene que aparecer.
--     3. Descartar → ✅ desaparece de la lista y el panel queda vacío. Al refrescar (F5)
--        NO vuelve.
--     4. Abrir una consulta FINALIZADA → ✅ el botón "Descartar" NO aparece.
--
--   CASO B — ⚠ EL CASO CRÍTICO: el turno se crea SOLO al finalizar.
--     1. Crear una consulta, poner fecha de próximo control y **Guardar borrador**.
--     2. Ir al turnero → ✅ NO tiene que haber ningún turno nuevo. (Éste es el bug que
--        la tanda cierra: antes aparecía acá.)
--     3. Volver a la consulta y **Finalizar**.
--     4. Turnero → ✅ ahora SÍ está el turno, en la fecha y hora elegidas, verde
--        (categoría turno_medico) y con el nombre del paciente.
--
--   CASO C — asistente autor (con `crear_consultas`):
--     1. Con el asistente: crear un borrador → ✅ el botón "Descartar" aparece.
--     2. Descartar → ✅ funciona (antes de esta migración habría dado un falso éxito:
--        la política vieja era solo-médico y el DELETE afectaba 0 filas).
--     3. Con el asistente, abrir un borrador creado por el MÉDICO → ✅ el botón NO
--        aparece. Y si se fuerza el DELETE por API, tiene que responder 403.
--
--   CASO D — borrador VIEJO sin autor (`creado_por IS NULL`, los previos a esta migración):
--     Hoy hay exactamente 1 en la base. Con el asistente → ✅ el botón NO aparece.
--     Con el médico → ✅ sí aparece y descarta.
--
--   CASO E — asistente SIN `gestionar_turnos` finaliza una consulta con próximo control:
--     Es el caso de "avisar y seguir". Esperado: ✅ la consulta SE FINALIZA (toast verde)
--     y aparece ADEMÁS un toast de advertencia avisando que el turno no se pudo agendar.
--     ❌ Si la finalización falla entera, el manejo del error del insert está mal.
--
-- ============================================================================


-- ============================================================================
-- Migration 038 — consultas.creado_por + RLS de descarte por autor + turno único
-- ============================================================================
-- Habilita la tanda de "descartar un borrador de consulta" y cierra de paso el bug
-- de raíz que le es hermano: que un borrador provisorio metiera un turno real en la
-- agenda. Tres cambios, los tres sobre el mismo circuito consulta ↔ turno.
--
-- ── 1. `consultas.creado_por` — la columna que no existía ────────────────────
--   `consultas` es la ÚNICA de su familia sin columna de autor: `turnos` tiene
--   `agendado_por`, `pacientes` tiene `creado_por`, `historia_clinica` tiene
--   `creado_por`/`updated_by`. La consulta solo guardaba `medico_id`, que es el
--   TENANT KEY (el dueño del consultorio), no quién la escribió.
--
--   Sin esa columna, la decisión de producto —"descarta el médico, o el asistente
--   QUE LO CREÓ"— es directamente inexpresable: no hay dato contra el cual comparar.
--
--   ⚠ NULLABLE A PROPÓSITO, y sin backfill. Los borradores anteriores a esta
--   migración no tienen autor y **no se les puede inventar uno**: `medico_id` no
--   sirve como sustituto (diría "lo creó el médico" incluso si lo escribió un
--   asistente). Un borrador sin autor solo lo descarta el médico — es lo que la
--   política de abajo hace, al pedir `creado_por = auth.uid()` para el asistente:
--   con `creado_por IS NULL` esa comparación da NULL, o sea NO pasa. La regla
--   "sin autor → solo el médico" NO necesita una cláusula propia: cae sola de la
--   lógica ternaria de SQL. (Verificado contra la base: hoy hay 1 borrador.)
--
-- ── 2. `consultas_delete` — de solo-médico a "médico o autor" ────────────────
--   La política vigente es `USING (get_user_role(auth.uid()) = 'medico' AND
--   medico_id = auth.uid())`: el asistente que creó un borrador **no puede
--   borrarlo**. Si el endpoint lo dejara pasar sin cambiar esto, el DELETE
--   afectaría 0 filas y devolvería éxito —el falso positivo silencioso que la 033
--   documentó para bloqueos—. Se reescribe con tres condiciones:
--
--     a. `medico_id = get_medico_id()` — tenant. Reemplaza al `medico_id =
--        auth.uid()` anterior, que era correcto solo para el médico; para un
--        asistente `auth.uid()` NUNCA es el `medico_id` de la fila, y por eso el
--        predicado viejo lo excluía por construcción.
--     b. `estado = 'borrador'` — DEFENSA EN PROFUNDIDAD de la regla de negocio 1
--        (HC inmutable). El endpoint ya rechaza las finalizadas con 403, pero la
--        Ley 26.529 obliga a conservar la HC y esto no puede depender de que
--        ningún camino futuro (otro endpoint, PostgREST directo, un script) se
--        acuerde de chequearlo. Con esta línea, **una consulta finalizada es
--        imborrable desde la base**, para todos los roles.
--     c. `rol = 'medico' OR creado_por = auth.uid()` — la regla de producto.
--
--   Se normaliza además a `TO authenticated` (la anterior no declaraba `TO`, o sea
--   `TO PUBLIC`), siguiendo el criterio de las migraciones 029 y 037.
--
-- ── 3. `turnos_consulta_id_unico` — un turno por consulta, garantizado ───────
--   `turnos.consulta_id` es una FK SIN unicidad. Lo único que evitaba el duplicado
--   era un `SELECT` previo en el código de los endpoints de consultas... que pasa
--   por `turnos_select`, la cual exige `ver_turnos`. Un asistente sin ese permiso
--   recibe `null` aunque el turno exista → inserta un duplicado. La guarda dependía
--   de un permiso que quien finaliza una consulta puede perfectamente no tener.
--
--   El índice lo cierra en la base, sin depender de ningún permiso. Es PARCIAL
--   (`WHERE consulta_id IS NOT NULL`) porque los turnos manuales —la mayoría— lo
--   tienen NULL, y en Postgres una UNIQUE común permitiría múltiples NULL igual,
--   pero el índice parcial además no los indexa: más chico y más claro en intención.
--
--   ⚠ Precondición VERIFICADA contra la base antes de escribir esto: 0 consultas
--   con más de un turno. El CREATE UNIQUE INDEX no puede fallar por datos.
--
-- ── LO QUE ESTA MIGRACIÓN NO HACE ───────────────────────────────────────────
--   No hace backfill de `creado_por` (ver punto 1). No toca `turnos` fuera del
--   índice. No borra ningún dato: se verificó que hay 0 turnos huérfanos de
--   borradores, así que no hay limpieza que acompañar.
--
-- Envuelto en transacción: el DROP+CREATE de la política deja un instante sin
--   política, y la política nueva referencia una columna que crea esta misma
--   migración. BEGIN/COMMIT lo hace atómico.
-- Reversible: ver el bloque comentado al final.
-- ============================================================================

BEGIN;

-- 1. Columna de autor. NULLABLE y sin backfill: los borradores viejos quedan sin
--    autor a propósito (ver encabezado). FK a profiles, igual que medico_id.
ALTER TABLE public.consultas
  ADD COLUMN IF NOT EXISTS creado_por UUID REFERENCES public.profiles(id);

COMMENT ON COLUMN public.consultas.creado_por IS
  'Autor de la consulta (quien la creó). NULL en las anteriores a la migración 038: '
  'esas solo las puede descartar el médico. No confundir con medico_id, que es el tenant.';

-- 2. Descarte de borradores: el médico (cualquiera de su tenant) o el asistente autor.
--    `estado = 'borrador'` es defensa en profundidad de la regla de negocio 1.
DROP POLICY IF EXISTS "consultas_delete" ON public.consultas;
CREATE POLICY "consultas_delete" ON public.consultas
  FOR DELETE TO authenticated
  USING (
    medico_id = get_medico_id()
    AND estado = 'borrador'
    AND (
      public.get_user_role(auth.uid()) = 'medico'
      OR creado_por = auth.uid()
    )
  );

-- 3. Una consulta no puede tener más de un turno asociado.
CREATE UNIQUE INDEX IF NOT EXISTS turnos_consulta_id_unico
  ON public.turnos (consulta_id)
  WHERE consulta_id IS NOT NULL;

COMMIT;

-- ── REVERSIBLE ──────────────────────────────────────────────────────────────
-- ⚠ Revertir la columna BORRA el dato de autoría de las consultas creadas mientras
--    estuvo activa. Si solo hace falta volver atrás la regla de descarte, revertir
--    la política y el índice y DEJAR la columna (es inocua).
-- BEGIN;
--   DROP INDEX IF EXISTS public.turnos_consulta_id_unico;
--   DROP POLICY IF EXISTS "consultas_delete" ON public.consultas;
--   CREATE POLICY "consultas_delete" ON public.consultas
--     FOR DELETE USING (public.get_user_role(auth.uid()) = 'medico' AND medico_id = auth.uid());
--   -- ALTER TABLE public.consultas DROP COLUMN creado_por;  -- ⚠ pierde la autoría
-- COMMIT;
