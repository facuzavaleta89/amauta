-- ============================================================================
-- Migration 029 — Corrección de DRIFT de seguridad en RLS + limpieza de duplicados
-- ============================================================================
-- ⚠ Esta migración CORRIGE UN DRIFT, no introduce un cambio nuevo. En algún momento
--   las políticas RLS de la base fueron modificadas A MANO en el dashboard hacia
--   versiones MÁS PERMISIVAS que las que crearon las migraciones fuente (004, 009) y
--   que documenta schema.sql. Como Supabase expone las tablas por PostgREST, un
--   asistente con su sesión puede escribir directo contra estas tablas SALTEANDO la
--   aplicación. Esta migración devuelve las políticas al estado correcto: exigir rol
--   médico para escribir/borrar datos clínicos sensibles.
--
-- Contenido:
--   1. Corrige el drift de RLS: recetas (insert/update/delete), evoluciones
--      (update/delete) e historia_clinica (delete) vuelven a exigir rol médico.
--   2. Migra el trigger consultas_updated_at a set_updated_at() y dropea la función
--      duplicada update_updated_at_column().
--   3. Dropea la versión SIN argumentos de get_user_role() (huérfana).
--   4. Dropea la política duplicada de notificaciones.
--   5. Corrige el DEFAULT de profiles.role ('secretario' → 'asistente').
--
-- Idempotente: DROP ... IF EXISTS antes de cada CREATE; DROP FUNCTION/POLICY IF EXISTS.
--
-- NOTA de alcance: NO recrea consultas/notificaciones ni las columnas huérfanas de
--   turnos/profiles (eso es la migración 030). Asume que esos objetos YA existen en la
--   base actual (que es el objetivo de esta corrección). Ver RESPUESTA.md → RIESGOS.
--
-- DECISIÓN de producto (NO tocar acá): difusion_update/delete también quedaron
--   permisivas, pero el código de la app (src/app/api/difusion/[id]/route.ts) coincide
--   y los posts de difusión son comunicación, no datos clínicos. Se deja permisivo a
--   propósito; NO se incluye en esta migración.
-- ============================================================================


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 1. Corregir el DRIFT de seguridad en las políticas RLS                     │
-- └──────────────────────────────────────────────────────────────────────────┘
-- Predicado correcto = el tenant que ya tienen (creado_por = get_medico_id()) MÁS el
-- chequeo de rol médico (get_user_role(auth.uid()) = 'medico'). Para un médico,
-- get_medico_id() devuelve su propio id, así que el predicado de tenant es equivalente
-- a auth.uid() pero se mantiene get_medico_id() por consistencia con el resto del RLS.
-- Se normaliza el rol de la política a TO authenticated.
--
-- ⚠ Solo se recrean insert/update/delete donde faltaba el rol médico. Las políticas
--   de SELECT (y evoluciones_insert / historia_insert/update) NO se tocan: están bien.

-- ── recetas: crear/modificar/eliminar es exclusivo del médico (regla de negocio 7) ──
DROP POLICY IF EXISTS "recetas_insert" ON public.recetas;
CREATE POLICY "recetas_insert" ON public.recetas
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_role(auth.uid()) = 'medico'
    AND EXISTS (
      SELECT 1 FROM public.pacientes
      WHERE id = recetas.paciente_id AND creado_por = public.get_medico_id()
    )
  );

DROP POLICY IF EXISTS "recetas_update" ON public.recetas;
CREATE POLICY "recetas_update" ON public.recetas
  FOR UPDATE TO authenticated
  USING (
    public.get_user_role(auth.uid()) = 'medico'
    AND EXISTS (
      SELECT 1 FROM public.pacientes
      WHERE id = recetas.paciente_id AND creado_por = public.get_medico_id()
    )
  )
  WITH CHECK (
    public.get_user_role(auth.uid()) = 'medico'
    AND EXISTS (
      SELECT 1 FROM public.pacientes
      WHERE id = recetas.paciente_id AND creado_por = public.get_medico_id()
    )
  );

DROP POLICY IF EXISTS "recetas_delete" ON public.recetas;
CREATE POLICY "recetas_delete" ON public.recetas
  FOR DELETE TO authenticated
  USING (
    public.get_user_role(auth.uid()) = 'medico'
    AND EXISTS (
      SELECT 1 FROM public.pacientes
      WHERE id = recetas.paciente_id AND creado_por = public.get_medico_id()
    )
  );

-- ── evoluciones: modificar/eliminar es exclusivo del médico (datos clínicos) ──
DROP POLICY IF EXISTS "evoluciones_update" ON public.evoluciones;
CREATE POLICY "evoluciones_update" ON public.evoluciones
  FOR UPDATE TO authenticated
  USING (
    public.get_user_role(auth.uid()) = 'medico'
    AND EXISTS (
      SELECT 1 FROM public.pacientes
      WHERE id = evoluciones.paciente_id AND creado_por = public.get_medico_id()
    )
  )
  WITH CHECK (
    public.get_user_role(auth.uid()) = 'medico'
    AND EXISTS (
      SELECT 1 FROM public.pacientes
      WHERE id = evoluciones.paciente_id AND creado_por = public.get_medico_id()
    )
  );

DROP POLICY IF EXISTS "evoluciones_delete" ON public.evoluciones;
CREATE POLICY "evoluciones_delete" ON public.evoluciones
  FOR DELETE TO authenticated
  USING (
    public.get_user_role(auth.uid()) = 'medico'
    AND EXISTS (
      SELECT 1 FROM public.pacientes
      WHERE id = evoluciones.paciente_id AND creado_por = public.get_medico_id()
    )
  );

-- ── historia_clinica: borrar es exclusivo del médico ──
-- El más grave del drift: la Ley 26.529 obliga a CONSERVAR la HC. Un asistente NO
-- debe poder borrarla. (En la app la HC no se borra nunca; la RLS es la defensa real.)
DROP POLICY IF EXISTS "historia_delete" ON public.historia_clinica;
CREATE POLICY "historia_delete" ON public.historia_clinica
  FOR DELETE TO authenticated
  USING (
    public.get_user_role(auth.uid()) = 'medico'
    AND EXISTS (
      SELECT 1 FROM public.pacientes
      WHERE id = historia_clinica.paciente_id AND creado_por = public.get_medico_id()
    )
  );


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 2. Migrar el trigger de consultas y dropear la función duplicada           │
-- └──────────────────────────────────────────────────────────────────────────┘
-- La base tiene DOS funciones de updated_at: set_updated_at() (la canónica, usada por
-- todos los triggers) y update_updated_at_column() (duplicada, SECURITY INVOKER y SIN
-- search_path fijo — menos segura). El único trigger que usa la duplicada es
-- consultas_updated_at. Lo migramos a la canónica y recién ahí dropeamos la duplicada.
--
-- ⚠ EL ORDEN IMPORTA: hay que repuntar el trigger a set_updated_at() ANTES de dropear
--   update_updated_at_column(). Si se dropeara la función primero, el trigger quedaría
--   apuntando a una función inexistente y cualquier UPDATE sobre consultas fallaría
--   (o el DROP FUNCTION fallaría por dependencia). Por eso: 1) drop trigger, 2) recrear
--   con set_updated_at(), 3) drop función duplicada.
DROP TRIGGER IF EXISTS consultas_updated_at ON public.consultas;

CREATE TRIGGER consultas_updated_at
  BEFORE UPDATE ON public.consultas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP FUNCTION IF EXISTS public.update_updated_at_column();


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 3. Dropear get_user_role() SIN argumentos (huérfana)                       │
-- └──────────────────────────────────────────────────────────────────────────┘
-- Existen dos: get_user_role() [plpgsql] y get_user_role(user_id uuid) [sql]. Todo el
-- proyecto usa la de UN argumento; la de cero no la referencia ninguna política
-- (verificado sobre pg_policies). Se especifica la firma vacía EXPLÍCITAMENTE para no
-- tocar por accidente la de un argumento, que sí se usa en todo el RLS.
DROP FUNCTION IF EXISTS public.get_user_role();


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 4. Dropear la política duplicada de notificaciones                         │
-- └──────────────────────────────────────────────────────────────────────────┘
-- "Medicos ven sus propias notificaciones" (SELECT USING auth.uid() = medico_id) es
-- idéntica en efecto a notificaciones_select (medico_id = auth.uid()). Redundante; se
-- dropea sin cambiar el comportamiento. El nombre lleva espacios y mayúsculas → comillas
-- dobles literales.
DROP POLICY IF EXISTS "Medicos ven sus propias notificaciones" ON public.notificaciones;


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 5. Corregir el DEFAULT de profiles.role                                    │
-- └──────────────────────────────────────────────────────────────────────────┘
-- La base tiene DEFAULT 'secretario'::text, pero el CHECK es role IN ('medico',
-- 'asistente') → el default viola su propio constraint. Hoy no explota porque
-- handle_new_user() siempre pasa el rol explícito, pero cualquier INSERT que omita
-- role fallaría. La migración 001 y schema.sql ya dicen 'asistente'; solo la base está
-- desalineada. Lo alineamos.
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'asistente';
