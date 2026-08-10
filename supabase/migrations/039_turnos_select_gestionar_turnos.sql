-- ============================================================================
-- Migration 039 — turnos_select: ver_turnos OR gestionar_turnos
-- ============================================================================
-- Cierra el ÚLTIMO hueco de la familia "la política no coincide con lo que el
-- endpoint permite", y es la pareja exacta de la 037: lo que aquélla hizo con
-- `bloqueos_select`, ésta lo hace con `turnos_select`. Las dos tablas de la agenda
-- quedan por fin con el MISMO criterio de lectura.
--
-- ── EL PROBLEMA ─────────────────────────────────────────────────────────────
--   `turnos_select` exige **solo `ver_turnos`** desde la 015. Pero los 12 permisos
--   son booleanos INDEPENDIENTES (todos `false` por defecto) y nada obliga a que
--   `gestionar_turnos` implique `ver_turnos`: un asistente con `gestionar_turnos`
--   y SIN `ver_turnos` es una combinación **configurable hoy** desde /perfil.
--
--   Ese asistente **escribe turnos que no puede leer**. Consecuencias medidas:
--
--   1. **Falsos negativos de solapamiento — el motivo por el que esta migración
--      existe ahora.** El helper `src/lib/agenda/solapamiento.ts` (tanda anterior)
--      consulta `turnos` con el cliente de SESIÓN, así que pasa por esta política.
--      A ese asistente le devuelve `[]` aunque los turnos existan, y el helper
--      concluye que la franja está **libre**: lo deja crear un turno **encima de
--      otro**. ⚠ Unificar el criterio en un helper NO cerró esto —sólo concentró
--      el bug en un lugar en vez de seis—; se cierra acá, en la base.
--   2. **404 falsos** en los endpoints que hacen fetch previo o `.select()` de
--      verificación sobre esta misma tabla (`api/turnero/[id]`, y desde la tanda
--      del helper también su chequeo de rango).
--   3. El índice `turnos_consulta_id_unico` (038) ya cubre el duplicado de turno
--      por consulta sin depender de permisos, pero **no** cubre el solapamiento:
--      son dos garantías distintas.
--
-- ── LA DECISIÓN: `ver_turnos` OR `gestionar_turnos` ─────────────────────────
--   Es la **Opción (a)** de las dos que PENDIENTES.md dejó planteadas, y sigue el
--   criterio que la 033 asentó y la 037 aplicó — **"la agenda es una unidad de
--   permiso"**: quien puede gestionarla puede leerla.
--
--   ⚠ La alternativa (b) —que la UI de /perfil no permita esa combinación— arregla
--   la causa pero **deja la base sin defensa** ante PostgREST directo o un script
--   futuro. No son excluyentes: ésta no impide hacer también aquélla.
--
--   El `USING` resultante es **textualmente el mismo** que la 037 le puso a
--   `bloqueos_select`. Ése es el punto: que las dos tablas dejen de tener criterios
--   distintos.
--
-- ── POR QUÉ `ALTER POLICY` Y NO DROP + CREATE ───────────────────────────────
--   La 037 usó DROP+CREATE (envuelto en BEGIN/COMMIT) porque además del `USING`
--   tenía que cambiarle el ROL a las 4 políticas, y porque eran cuatro. Acá cambia
--   **una sola expresión de una sola política**: `ALTER POLICY` la modifica EN EL
--   LUGAR, sin el instante intermedio en que la política no existe. Por eso tampoco
--   lleva BEGIN/COMMIT: es una única sentencia, ya atómica de por sí.
--
-- ── AMPLIACIÓN DE ACCESO, NO RESTRICCIÓN ────────────────────────────────────
--   Se pasa de `A` a `A OR B`. **Nadie que hoy lee turnos deja de leerlos**: el
--   médico sigue entrando por `check_permiso()` (que devuelve TRUE para rol médico)
--   y el asistente con `ver_turnos` entra por la primera rama, igual que antes. Lo
--   único que cambia es que ADEMÁS entra el asistente con `gestionar_turnos`.
--   Por lo mismo, es **imposible que los datos existentes violen** la regla nueva.
--
-- ── LO QUE ESTA MIGRACIÓN NO TOCA ───────────────────────────────────────────
--   · `turnos_insert`, `turnos_update`, `turnos_delete`: intactas.
--   · **NINGÚN código de aplicación.** El helper de solapamiento y los 6 endpoints
--     ya están escritos para esto; no hay que tocar ni desplegar nada.
--   · ⚠ **El ROL de la política.** `turnos_select` nació en la 005 y se rehízo en la
--     015 **sin cláusula `TO`**, y en Postgres eso equivale a `TO PUBLIC`: hoy se
--     evalúa para todos los roles, `anon` incluido. La 029 normalizó otras tablas y
--     la 037 normalizó las 4 de `bloqueos_agenda`, pero **`turnos` quedó afuera**.
--     `ALTER POLICY` sin `TO` **preserva el rol tal como esté**, así que esta
--     migración lo deja como lo encontró — a propósito, para no mezclar dos cambios.
--     Sin impacto explotable (la política cuelga de `get_medico_id()`, que para
--     `anon` no resuelve), pero la normalización de `turnos` a `TO authenticated`
--     queda como trabajo pendiente aparte. Ver la V2 de la copia suelta.
--
-- Reversible: ver el bloque comentado al final.
-- ============================================================================

ALTER POLICY "turnos_select" ON public.turnos
  USING (
    medico_id = get_medico_id()
    AND (
      public.check_permiso(auth.uid(), 'ver_turnos')
      OR public.check_permiso(auth.uid(), 'gestionar_turnos')
    )
  );

-- ── VERIFICACIÓN (correr por separado después de aplicar) ────────────────────
-- SELECT tablename, policyname, cmd, roles, qual FROM pg_policies
-- WHERE schemaname='public' AND tablename IN ('turnos','bloqueos_agenda')
--   AND cmd='SELECT' ORDER BY tablename;
-- Esperado: 2 filas cuyo `qual` sea equivalente entre sí — las dos con el OR de
-- los dos permisos de agenda. Era exactamente la diferencia que esto cierra.
--
-- La prueba REAL es funcional y necesita un asistente con `gestionar_turnos` y SIN
-- `ver_turnos`: tiene que ver la agenda y, sobre todo, el chequeo de solapamiento
-- tiene que volver a detectar los solapes. Ver la copia suelta MIGRACION-15-* para
-- los pasos.

-- ── REVERSIBLE ──────────────────────────────────────────────────────────────
-- Restaura el USING previo (solo `ver_turnos`). ⚠ Revertir REABRE el falso negativo
-- de solapamiento descrito arriba:
-- ALTER POLICY "turnos_select" ON public.turnos
--   USING (
--     medico_id = get_medico_id()
--     AND public.check_permiso(auth.uid(), 'ver_turnos')
--   );
