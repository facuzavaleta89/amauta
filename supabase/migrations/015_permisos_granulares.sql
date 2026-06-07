-- ============================================================
-- 015_permisos_granulares.sql
-- Bloque 3: Sistema de permisos granulares para asistentes
--
-- ROLLBACK:
--   ALTER TABLE public.profiles
--     DROP COLUMN IF EXISTS ver_pacientes,
--     DROP COLUMN IF EXISTS editar_pacientes,
--     DROP COLUMN IF EXISTS ver_historia_clinica,
--     DROP COLUMN IF EXISTS crear_consultas,
--     DROP COLUMN IF EXISTS finalizar_consultas,
--     DROP COLUMN IF EXISTS ver_turnos,
--     DROP COLUMN IF EXISTS gestionar_turnos,
--     DROP COLUMN IF EXISTS ver_pedidos,
--     DROP COLUMN IF EXISTS crear_pedidos,
--     DROP COLUMN IF EXISTS ver_certificados,
--     DROP COLUMN IF EXISTS crear_certificados,
--     DROP COLUMN IF EXISTS acceso_mensajeria;
--   DROP FUNCTION IF EXISTS public.check_permiso(uuid, text);
--   (Restaurar funciones helper y políticas de la migración 013)
-- ============================================================


-- ── PASO 1: Agregar los 12 permisos granulares a profiles ────
-- Todos con DEFAULT FALSE (principio de mínimo privilegio)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ver_pacientes         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS editar_pacientes      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ver_historia_clinica  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS crear_consultas       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS finalizar_consultas   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ver_turnos            BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gestionar_turnos      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ver_pedidos           BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS crear_pedidos         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ver_certificados      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS crear_certificados    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS acceso_mensajeria     BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.ver_pacientes        IS 'Asistente: puede ver el listado de pacientes';
COMMENT ON COLUMN public.profiles.editar_pacientes     IS 'Asistente: puede crear y modificar pacientes';
COMMENT ON COLUMN public.profiles.ver_historia_clinica IS 'Asistente: puede ver la historia clínica y consultas';
COMMENT ON COLUMN public.profiles.crear_consultas      IS 'Asistente: puede crear nuevas consultas en borrador';
COMMENT ON COLUMN public.profiles.finalizar_consultas  IS 'Asistente: puede finalizar consultas (borrador → finalizada)';
COMMENT ON COLUMN public.profiles.ver_turnos           IS 'Asistente: puede ver la agenda de turnos';
COMMENT ON COLUMN public.profiles.gestionar_turnos     IS 'Asistente: puede crear, editar y cancelar turnos';
COMMENT ON COLUMN public.profiles.ver_pedidos          IS 'Asistente: puede ver pedidos de estudios';
COMMENT ON COLUMN public.profiles.crear_pedidos        IS 'Asistente: puede crear pedidos de estudios';
COMMENT ON COLUMN public.profiles.ver_certificados     IS 'Asistente: puede ver certificados médicos';
COMMENT ON COLUMN public.profiles.crear_certificados   IS 'Asistente: puede crear certificados médicos';
COMMENT ON COLUMN public.profiles.acceso_mensajeria    IS 'Asistente: acceso al módulo de mensajería (preparado para uso futuro)';


-- ── PASO 2: Función helper genérica ──────────────────────────
-- Reemplaza las funciones individuales check_asistente_ver_hc
-- y check_asistente_editar_agenda con una sola función genérica.
--
-- Uso en RLS: public.check_permiso(auth.uid(), 'ver_pacientes')
-- Retorna TRUE si:
--   a) el usuario es 'medico' (acceso total), o
--   b) el usuario es 'asistente' y tiene ese permiso = TRUE
--
-- NOTA: usa CASE + columna dinámica vía función plpgsql para
-- evitar SQL injection y mantener SECURITY DEFINER seguro.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_permiso(
  user_id uuid,
  permiso text
)
RETURNS boolean AS $$
DECLARE
  v_role text;
  v_result boolean;
BEGIN
  -- Obtener el rol del usuario (evita recursión RLS al ser SECURITY DEFINER)
  SELECT role INTO v_role FROM public.profiles WHERE id = user_id;

  -- Médico siempre tiene acceso total
  IF v_role = 'medico' THEN
    RETURN TRUE;
  END IF;

  -- Para asistentes: verificar el permiso específico
  -- Usamos IF/ELSIF explícito para evitar SQL dinámico (seguridad)
  IF permiso = 'ver_pacientes' THEN
    SELECT ver_pacientes        INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'editar_pacientes' THEN
    SELECT editar_pacientes     INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'ver_historia_clinica' THEN
    SELECT ver_historia_clinica INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'crear_consultas' THEN
    SELECT crear_consultas      INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'finalizar_consultas' THEN
    SELECT finalizar_consultas  INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'ver_turnos' THEN
    SELECT ver_turnos           INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'gestionar_turnos' THEN
    SELECT gestionar_turnos     INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'ver_pedidos' THEN
    SELECT ver_pedidos          INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'crear_pedidos' THEN
    SELECT crear_pedidos        INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'ver_certificados' THEN
    SELECT ver_certificados     INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'crear_certificados' THEN
    SELECT crear_certificados   INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'acceso_mensajeria' THEN
    SELECT acceso_mensajeria    INTO v_result FROM public.profiles WHERE id = user_id;
  ELSE
    RETURN FALSE;
  END IF;

  RETURN COALESCE(v_result, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;


-- ── PASO 3: Actualizar funciones helper existentes ────────────
-- check_asistente_ver_hc → ahora lee ver_historia_clinica
-- check_asistente_editar_agenda → ahora lee ver_turnos
-- Se mantienen para compatibilidad con código existente que las llame.

CREATE OR REPLACE FUNCTION public.check_asistente_ver_hc(user_id uuid)
RETURNS boolean AS $$
  SELECT public.check_permiso(user_id, 'ver_historia_clinica');
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.check_asistente_editar_agenda(user_id uuid)
RETURNS boolean AS $$
  SELECT public.check_permiso(user_id, 'ver_turnos');
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;


-- ── PASO 4: RLS — PACIENTES ───────────────────────────────────

DROP POLICY IF EXISTS "pacientes_select" ON public.pacientes;
CREATE POLICY "pacientes_select" ON public.pacientes
  FOR SELECT USING (
    creado_por = get_medico_id()
    AND public.check_permiso(auth.uid(), 'ver_pacientes')
  );

DROP POLICY IF EXISTS "pacientes_insert" ON public.pacientes;
CREATE POLICY "pacientes_insert" ON public.pacientes
  FOR INSERT WITH CHECK (
    creado_por = get_medico_id()
    AND public.check_permiso(auth.uid(), 'editar_pacientes')
  );

DROP POLICY IF EXISTS "pacientes_update" ON public.pacientes;
CREATE POLICY "pacientes_update" ON public.pacientes
  FOR UPDATE USING (
    creado_por = get_medico_id()
    AND public.check_permiso(auth.uid(), 'editar_pacientes')
  );

-- DELETE: solo el médico (sin cambios)
DROP POLICY IF EXISTS "pacientes_delete" ON public.pacientes;
CREATE POLICY "pacientes_delete" ON public.pacientes
  FOR DELETE USING (
    creado_por = auth.uid()
    AND public.get_user_role(auth.uid()) = 'medico'
  );


-- ── PASO 5: RLS — HISTORIA CLÍNICA ───────────────────────────
-- check_asistente_ver_hc ya fue actualizada al nuevo campo.
-- Las políticas de historia_clinica ya la usan → no requieren cambio.
-- Solo se recrean por claridad.

DROP POLICY IF EXISTS "historia_select" ON public.historia_clinica;
CREATE POLICY "historia_select" ON public.historia_clinica
  FOR SELECT USING (
    public.check_permiso(auth.uid(), 'ver_historia_clinica')
    AND EXISTS (
      SELECT 1 FROM public.pacientes
      WHERE id = historia_clinica.paciente_id AND creado_por = get_medico_id()
    )
  );

DROP POLICY IF EXISTS "historia_insert" ON public.historia_clinica;
CREATE POLICY "historia_insert" ON public.historia_clinica
  FOR INSERT WITH CHECK (
    public.check_permiso(auth.uid(), 'ver_historia_clinica')
    AND EXISTS (
      SELECT 1 FROM public.pacientes
      WHERE id = historia_clinica.paciente_id AND creado_por = get_medico_id()
    )
  );

DROP POLICY IF EXISTS "historia_update" ON public.historia_clinica;
CREATE POLICY "historia_update" ON public.historia_clinica
  FOR UPDATE USING (
    public.check_permiso(auth.uid(), 'ver_historia_clinica')
    AND EXISTS (
      SELECT 1 FROM public.pacientes
      WHERE id = historia_clinica.paciente_id AND creado_por = get_medico_id()
    )
  );


-- ── PASO 6: RLS — CONSULTAS ───────────────────────────────────

DROP POLICY IF EXISTS "consultas_select" ON public.consultas;
CREATE POLICY "consultas_select" ON public.consultas
  FOR SELECT USING (
    public.check_permiso(auth.uid(), 'ver_historia_clinica')
    AND medico_id = get_medico_id()
  );

-- Crear consulta (borrador): requiere crear_consultas
DROP POLICY IF EXISTS "consultas_insert" ON public.consultas;
CREATE POLICY "consultas_insert" ON public.consultas
  FOR INSERT WITH CHECK (
    public.check_permiso(auth.uid(), 'crear_consultas')
    AND medico_id = get_medico_id()
  );

-- Update de consulta:
--   Médico → puede actualizar cualquier consulta propia
--   Asistente con crear_consultas → puede editar borradores
--   Asistente con finalizar_consultas → puede cambiar estado a finalizada
DROP POLICY IF EXISTS "consultas_update" ON public.consultas;
CREATE POLICY "consultas_update" ON public.consultas
  FOR UPDATE USING (
    medico_id = get_medico_id()
    AND (
      public.get_user_role(auth.uid()) = 'medico'
      OR public.check_permiso(auth.uid(), 'crear_consultas')
      OR public.check_permiso(auth.uid(), 'finalizar_consultas')
    )
  );

-- DELETE: solo el médico (sin cambios)
DROP POLICY IF EXISTS "consultas_delete" ON public.consultas;
CREATE POLICY "consultas_delete" ON public.consultas
  FOR DELETE USING (
    public.get_user_role(auth.uid()) = 'medico'
    AND medico_id = auth.uid()
  );


-- ── PASO 7: RLS — TURNOS ─────────────────────────────────────

-- SELECT: ver turnos
DROP POLICY IF EXISTS "turnos_select" ON public.turnos;
CREATE POLICY "turnos_select" ON public.turnos
  FOR SELECT USING (
    medico_id = get_medico_id()
    AND public.check_permiso(auth.uid(), 'ver_turnos')
  );

-- INSERT / UPDATE: gestionar turnos
DROP POLICY IF EXISTS "turnos_insert" ON public.turnos;
CREATE POLICY "turnos_insert" ON public.turnos
  FOR INSERT WITH CHECK (
    medico_id = get_medico_id()
    AND public.check_permiso(auth.uid(), 'gestionar_turnos')
  );

DROP POLICY IF EXISTS "turnos_update" ON public.turnos;
CREATE POLICY "turnos_update" ON public.turnos
  FOR UPDATE USING (
    medico_id = get_medico_id()
    AND public.check_permiso(auth.uid(), 'gestionar_turnos')
  );

-- DELETE: solo el médico
DROP POLICY IF EXISTS "turnos_delete" ON public.turnos;
CREATE POLICY "turnos_delete" ON public.turnos
  FOR DELETE USING (
    medico_id = auth.uid()
    AND public.get_user_role(auth.uid()) = 'medico'
  );


-- ── PASO 8: RLS — BLOQUEOS AGENDA ────────────────────────────

DROP POLICY IF EXISTS "bloqueos_insert" ON public.bloqueos_agenda;
CREATE POLICY "bloqueos_insert" ON public.bloqueos_agenda
  FOR INSERT WITH CHECK (
    medico_id = get_medico_id()
    AND public.check_permiso(auth.uid(), 'gestionar_turnos')
  );


-- ── PASO 9: RLS — PEDIDOS ────────────────────────────────────

DROP POLICY IF EXISTS "pedidos_select" ON public.pedidos;
CREATE POLICY "pedidos_select" ON public.pedidos
  FOR SELECT USING (
    public.check_permiso(auth.uid(), 'ver_pedidos')
    AND EXISTS (
      SELECT 1 FROM public.pacientes
      WHERE id = pedidos.paciente_id AND creado_por = get_medico_id()
    )
  );

DROP POLICY IF EXISTS "pedidos_insert" ON public.pedidos;
CREATE POLICY "pedidos_insert" ON public.pedidos
  FOR INSERT WITH CHECK (
    public.check_permiso(auth.uid(), 'crear_pedidos')
    AND EXISTS (
      SELECT 1 FROM public.pacientes
      WHERE id = pedidos.paciente_id AND creado_por = get_medico_id()
    )
  );

-- UPDATE (para guardar pdf_path): requiere crear_pedidos
DROP POLICY IF EXISTS "pedidos_update" ON public.pedidos;
CREATE POLICY "pedidos_update" ON public.pedidos
  FOR UPDATE USING (
    public.check_permiso(auth.uid(), 'crear_pedidos')
    AND EXISTS (
      SELECT 1 FROM public.pacientes
      WHERE id = pedidos.paciente_id AND creado_por = get_medico_id()
    )
  );

-- DELETE: solo el médico
DROP POLICY IF EXISTS "pedidos_delete" ON public.pedidos;
CREATE POLICY "pedidos_delete" ON public.pedidos
  FOR DELETE USING (
    public.get_user_role(auth.uid()) = 'medico'
    AND EXISTS (
      SELECT 1 FROM public.pacientes
      WHERE id = pedidos.paciente_id AND creado_por = auth.uid()
    )
  );


-- ── PASO 10: RLS — CERTIFICADOS ──────────────────────────────

DROP POLICY IF EXISTS "certificados_select" ON public.certificados;
CREATE POLICY "certificados_select" ON public.certificados
  FOR SELECT USING (
    public.check_permiso(auth.uid(), 'ver_certificados')
    AND EXISTS (
      SELECT 1 FROM public.pacientes
      WHERE id = certificados.paciente_id AND creado_por = get_medico_id()
    )
  );

DROP POLICY IF EXISTS "certificados_insert" ON public.certificados;
CREATE POLICY "certificados_insert" ON public.certificados
  FOR INSERT WITH CHECK (
    public.check_permiso(auth.uid(), 'crear_certificados')
    AND EXISTS (
      SELECT 1 FROM public.pacientes
      WHERE id = certificados.paciente_id AND creado_por = get_medico_id()
    )
  );

-- UPDATE (para guardar pdf_path): requiere crear_certificados
DROP POLICY IF EXISTS "certificados_update" ON public.certificados;
CREATE POLICY "certificados_update" ON public.certificados
  FOR UPDATE USING (
    public.check_permiso(auth.uid(), 'crear_certificados')
    AND EXISTS (
      SELECT 1 FROM public.pacientes
      WHERE id = certificados.paciente_id AND creado_por = get_medico_id()
    )
  );

-- DELETE: solo el médico
DROP POLICY IF EXISTS "certificados_delete" ON public.certificados;
CREATE POLICY "certificados_delete" ON public.certificados
  FOR DELETE USING (
    public.get_user_role(auth.uid()) = 'medico'
    AND EXISTS (
      SELECT 1 FROM public.pacientes
      WHERE id = certificados.paciente_id AND creado_por = auth.uid()
    )
  );
