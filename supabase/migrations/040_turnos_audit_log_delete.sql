-- ============================================================================
-- Migration 040 — turnos_audit_log registra también los DELETE
-- ============================================================================
-- Cierra el ítem que PENDIENTES.md arrastraba desde la 033: el trigger de auditoría
-- solo cubría INSERT y UPDATE, así que **el borrado de un turno no dejaba rastro**.
-- Antes importaba poco —en la práctica solo el médico llegaba a borrar, porque al
-- asistente la política se lo filtraba en silencio—, pero desde la 033 el asistente
-- con `gestionar_turnos` borra turnos de verdad y no quedaba registro de quién.
--
-- ── POR QUÉ NO ALCANZA CON SUMAR `OR DELETE` AL TRIGGER ─────────────────────
--   El trigger es **AFTER** (verificado contra la base viva; ver la nota de más
--   abajo sobre la discrepancia histórica). En un AFTER DELETE la fila del turno
--   YA NO EXISTE cuando corre la función, y eso choca con dos objetos:
--
--   1. **La FK `turnos_audit_log_turno_id_fkey` con `ON DELETE CASCADE`.** Al
--      borrarse el turno, Postgres borra **todo su historial de auditoría**.
--      Auditar el DELETE sin tocar esto sería escribir una fila que se
--      autodestruye en el mismo statement.
--   2. **La política `audit_select`**, que resuelve el tenant con
--      `EXISTS (SELECT 1 FROM turnos WHERE id = turnos_audit_log.turno_id …)`:
--      sin el turno, la fila queda **invisible para todos**.
--
--   Por eso esta migración **desnormaliza el tenant** en la tabla de auditoría y
--   suelta la FK. Es la "salida natural" que PENDIENTES.md ya había identificado.
--
-- ── ⚠ EL DETALLE QUE DECIDE LA FORMA DE LA RAMA DELETE ──────────────────────
--   La fila de auditoría del DELETE se inserta con **`turno_id = NULL`**, no con
--   `OLD.id`. NO es una simplificación: es la única forma que funciona.
--
--   `ON DELETE SET NULL` gobierna qué le pasa a las filas hijas que **ya existen**
--   cuando se borra el padre. **No habilita insertar una hija NUEVA apuntando a un
--   padre que ya no está.** En un AFTER DELETE, un `INSERT … VALUES (OLD.id, …)`
--   dispara la verificación de integridad referencial, que busca el turno, no lo
--   encuentra y aborta con:
--     ERROR: insert or update on table "turnos_audit_log" violates foreign key
--            constraint "turnos_audit_log_turno_id_fkey"
--   Y como es un trigger AFTER, esa excepción **aborta el DELETE entero**: borrar
--   un turno pasaría a ser imposible. Verificado a nivel de diseño antes de escribir
--   esta migración; el `turno_id NULL` es lo que el plan de verificación funcional
--   espera ver, y es coherente con él.
--
--   **No se pierde información:** `detalle` guarda `to_jsonb(OLD)`, que incluye el
--   `id` del turno junto con el resto de la fila. El vínculo sigue disponible, solo
--   que como dato del snapshot y no como FK — que es exactamente lo que corresponde
--   cuando el referido dejó de existir.
--
--   Las filas de auditoría **previas** de ese turno (sus 'creado'/'modificado'/…)
--   sí pasan por el `SET NULL` de la FK: conservan su historia con `turno_id` en
--   NULL en vez de desaparecer por CASCADE. Ése es el punto de todo el cambio.
--
-- ── ORDEN DE LAS OPERACIONES (importa) ──────────────────────────────────────
--   El backfill de `medico_id` va **mientras la FK sigue viva** y **antes** del
--   `SET NOT NULL`: se alimenta del JOIN contra `turnos`, así que necesita que el
--   vínculo todavía esté íntegro. Una vez que existan filas con `turno_id` NULL, el
--   `medico_id` de esas filas **ya no se puede recuperar de ningún lado**.
--
-- ── LO QUE ESTA MIGRACIÓN NO TOCA ───────────────────────────────────────────
--   · **Ningún código de aplicación en runtime.** `turnos_audit_log` no se escribe
--     ni se lee desde `src/`: la única vía de escritura es este trigger (la política
--     de INSERT para clientes se revocó en la 014) y no hay ninguna pantalla que la
--     consulte. El tipo TS `TurnoAuditLog` (`src/types/turno.ts`) se actualiza en la
--     misma tanda para no quedar mintiendo, pero **no tiene consumidores**.
--   · Las ramas INSERT y UPDATE de la función conservan su semántica EXACTA (mismo
--     actor, mismo `CASE` de acción, mismo `detalle`). Lo único que se les agrega es
--     la columna `medico_id`, que ahora es NOT NULL y sin ella el trigger fallaría.
--   · `bloqueos_agenda` sigue **sin auditoría**. Es trabajo aparte.
--
-- ── NOTA: la discrepancia BEFORE/AFTER queda CERRADA ────────────────────────
--   `schema.sql` declaraba el trigger como BEFORE y la migración fuente
--   `005_turnos.sql:176` como AFTER. Verificado contra la base viva: es **AFTER**.
--   Como acá se hace DROP + CREATE del trigger, esta migración **fija la dirección
--   de forma explícita** y la ambigüedad de tres años se termina acá.
--
-- Envuelto en transacción: son múltiples DDL/DML dependientes entre sí (la columna,
--   su backfill, el NOT NULL, la FK, la función y la política). O entra todo o nada.
-- Reversible: ver el bloque comentado al final.
-- ============================================================================

BEGIN;

-- ── 1. La columna nueva: tenant desnormalizado ──────────────────────────────
-- Nullable POR AHORA: las 192 filas existentes todavía no la tienen. Pasa a NOT NULL
-- en el paso 3, una vez backfilleada.
ALTER TABLE public.turnos_audit_log ADD COLUMN medico_id UUID;

-- ── 2. Backfill desde el turno ──────────────────────────────────────────────
-- Corre con la FK TODAVÍA VIVA y con las 192 filas apuntando a su turno (verificado:
-- 0 huérfanas hoy), así que el JOIN las resuelve todas.
UPDATE public.turnos_audit_log a
SET    medico_id = t.medico_id
FROM   public.turnos t
WHERE  t.id = a.turno_id
  AND  a.medico_id IS NULL;

-- ── 3. NOT NULL ─────────────────────────────────────────────────────────────
-- ⚠ SI ESTE ALTER FALLA, no lo fuerces: significa que quedaron filas con
--   `medico_id IS NULL`, o sea filas de auditoría HUÉRFANAS (su `turno_id` no
--   resuelve contra ningún turno) que el backfill del paso 2 no pudo alcanzar.
--   Hoy son 0, así que es seguro. Si aparecieran, hay que resolverlas ANTES —
--   identificarlas y decidir si se les asigna tenant o se descartan:
--     SELECT a.id, a.turno_id, a.accion, a.created_at
--     FROM public.turnos_audit_log a
--     WHERE a.medico_id IS NULL;
--   No se agrega lógica condicional acá a propósito: que falle ruidosamente es
--   preferible a dejar filas sin tenant, que serían invisibles para la RLS nueva.
ALTER TABLE public.turnos_audit_log ALTER COLUMN medico_id SET NOT NULL;

-- ── 4. Índice del tenant ────────────────────────────────────────────────────
-- Mismo patrón que el resto del proyecto (idx_turnos_medico, idx_bloqueos_medico…):
-- la RLS nueva filtra por esta columna en cada SELECT.
CREATE INDEX IF NOT EXISTS idx_turnos_audit_medico ON public.turnos_audit_log(medico_id);

-- ── 5. La FK: de CASCADE a SET NULL, y turno_id pasa a nullable ─────────────
-- El orden es DROP NOT NULL → DROP CONSTRAINT → ADD CONSTRAINT. La columna tiene que
-- admitir NULL antes de que la FK pueda ponérselo.
ALTER TABLE public.turnos_audit_log ALTER COLUMN turno_id DROP NOT NULL;

ALTER TABLE public.turnos_audit_log
  DROP CONSTRAINT IF EXISTS turnos_audit_log_turno_id_fkey;

ALTER TABLE public.turnos_audit_log
  ADD CONSTRAINT turnos_audit_log_turno_id_fkey
  FOREIGN KEY (turno_id) REFERENCES public.turnos(id) ON DELETE SET NULL;

-- ── 6. La función: se suma la rama DELETE ───────────────────────────────────
-- Las ramas INSERT y UPDATE conservan su semántica EXACTA (actor, CASE de acción y
-- forma del `detalle` idénticos a los vigentes). El único cambio en ellas es sumar
-- `medico_id` al INSERT: la columna ahora es NOT NULL y sin eso el trigger fallaría
-- en la primera alta o edición de un turno.
CREATE OR REPLACE FUNCTION public.log_turno_cambio()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.turnos_audit_log (turno_id, medico_id, usuario_id, accion, detalle)
    VALUES (NEW.id, NEW.medico_id, NEW.agendado_por, 'creado', to_jsonb(NEW));
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.turnos_audit_log (turno_id, medico_id, usuario_id, accion, detalle)
    VALUES (
      NEW.id,
      NEW.medico_id,
      COALESCE(auth.uid(), NEW.agendado_por),
      CASE
        WHEN NEW.estado = 'cancelado'             THEN 'cancelado'
        WHEN OLD.fecha_inicio <> NEW.fecha_inicio THEN 'reprogramado'
        ELSE 'modificado'
      END,
      jsonb_build_object('antes', to_jsonb(OLD), 'despues', to_jsonb(NEW))
    );
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    -- ⚠ `turno_id` va NULL, NO `OLD.id`: en un trigger AFTER DELETE el turno ya no
    -- existe, y un INSERT que lo referencie viola la FK y aborta el borrado entero
    -- (ver el encabezado). El id del turno queda igual dentro de `detalle`.
    INSERT INTO public.turnos_audit_log (turno_id, medico_id, usuario_id, accion, detalle)
    VALUES (
      NULL,
      OLD.medico_id,
      -- Red de seguridad: si el borrado lo hace el admin client (service_role, sin
      -- sesión), `auth.uid()` es NULL y `usuario_id` es NOT NULL → el INSERT fallaría
      -- y se llevaría puesto el DELETE. Cae en quien agendó el turno. Mismo patrón que
      -- ya usa la rama UPDATE. ⚠ Atribuye el borrado a quien AGENDÓ, no a quien borró:
      -- la raíz pendiente es que POST /api/pacientes/[id]/historia deje de borrar con
      -- admin client (ver PENDIENTES.md).
      COALESCE(auth.uid(), OLD.agendado_por),
      'eliminado',
      to_jsonb(OLD)
    );
    -- En un trigger AFTER el valor de retorno se ignora, pero por corrección la rama
    -- DELETE devuelve OLD (NEW no existe en un DELETE).
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

-- ── 7. El trigger: suma DELETE y fija AFTER explícitamente ──────────────────
DROP TRIGGER IF EXISTS turno_audit_trigger ON public.turnos;
CREATE TRIGGER turno_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.turnos
  FOR EACH ROW EXECUTE FUNCTION public.log_turno_cambio();

-- ── 8. La política: tenant directo, y normalizada a authenticated ───────────
-- Antes resolvía el tenant CON UN JOIN al turno, así que una fila cuyo turno ya no
-- existe quedaba invisible para todos — justo las filas que esta migración crea.
-- Ahora lee `medico_id` de la propia fila.
-- El `TO authenticated` sigue lo que la 037 hizo con bloqueos_agenda: la política vieja
-- no declaraba `TO`, y en Postgres eso equivale a `TO PUBLIC` (se evalúa para todos los
-- roles, `anon` incluido). Entra en el alcance porque la política se reescribe igual.
DROP POLICY IF EXISTS "audit_select" ON public.turnos_audit_log;
CREATE POLICY "audit_select" ON public.turnos_audit_log
  FOR SELECT TO authenticated USING (medico_id = get_medico_id());

COMMIT;

-- ── VERIFICACIÓN (correr por separado después del COMMIT) ────────────────────
-- V1. La columna: SELECT column_name, is_nullable FROM information_schema.columns
--     WHERE table_name='turnos_audit_log' AND column_name IN ('medico_id','turno_id');
--     Esperado: medico_id NO · turno_id YES.
-- V2. La FK en SET NULL, V3. el trigger AFTER INSERT OR UPDATE OR DELETE,
-- V4. audit_select por medico_id y TO authenticated, V5. backfill sin huérfanas.
--
-- La prueba REAL es funcional: crear un turno, borrarlo y ver la fila 'eliminado'.
-- Ver la copia suelta MIGRACION-16-* para las consultas completas y los pasos.

-- ── REVERSIBLE ──────────────────────────────────────────────────────────────
-- ⚠ Revertir REINTRODUCE el CASCADE: las filas de auditoría de un turno borrado
-- vuelven a desaparecer. Y las filas 'eliminado' que hayan quedado con turno_id NULL
-- NO se pueden restaurar a un estado válido — hay que borrarlas antes del NOT NULL.
-- BEGIN;
--   DROP TRIGGER IF EXISTS turno_audit_trigger ON public.turnos;
--   CREATE TRIGGER turno_audit_trigger
--     AFTER INSERT OR UPDATE ON public.turnos
--     FOR EACH ROW EXECUTE FUNCTION public.log_turno_cambio();
--   DELETE FROM public.turnos_audit_log WHERE turno_id IS NULL;
--   ALTER TABLE public.turnos_audit_log ALTER COLUMN turno_id SET NOT NULL;
--   ALTER TABLE public.turnos_audit_log
--     DROP CONSTRAINT IF EXISTS turnos_audit_log_turno_id_fkey;
--   ALTER TABLE public.turnos_audit_log
--     ADD CONSTRAINT turnos_audit_log_turno_id_fkey
--     FOREIGN KEY (turno_id) REFERENCES public.turnos(id) ON DELETE CASCADE;
--   DROP INDEX IF EXISTS public.idx_turnos_audit_medico;
--   ALTER TABLE public.turnos_audit_log DROP COLUMN medico_id;
--   DROP POLICY IF EXISTS "audit_select" ON public.turnos_audit_log;
--   CREATE POLICY "audit_select" ON public.turnos_audit_log
--     FOR SELECT USING (EXISTS (SELECT 1 FROM public.turnos
--       WHERE id = turnos_audit_log.turno_id AND medico_id = get_medico_id()));
--   -- y restaurar log_turno_cambio() sin la rama DELETE ni las columnas medico_id.
-- COMMIT;
