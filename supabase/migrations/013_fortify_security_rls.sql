-- ============================================================
-- 013_fortify_security_rls.sql
-- Fortificación de políticas RLS para asistentes y multitenancy
-- ============================================================

-- 1. Cambiar los valores por defecto de permisos en la tabla profiles
ALTER TABLE public.profiles ALTER COLUMN puede_ver_historias SET DEFAULT FALSE;
ALTER TABLE public.profiles ALTER COLUMN puede_editar_agenda SET DEFAULT FALSE;

-- 2. Revocar los permisos de asistentes existentes para cumplir con la regla de por defecto FALSE
UPDATE public.profiles 
SET puede_ver_historias = FALSE, puede_editar_agenda = FALSE 
WHERE role = 'asistente';

-- 3. Crear funciones helper seguras para verificar permisos sin recursión RLS
CREATE OR REPLACE FUNCTION public.check_asistente_ver_hc(user_id uuid)
RETURNS boolean AS $$
  SELECT CASE
    WHEN role = 'medico' THEN true
    WHEN role = 'asistente' THEN puede_ver_historias
    ELSE false
  END
  FROM public.profiles WHERE id = user_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.check_asistente_editar_agenda(user_id uuid)
RETURNS boolean AS $$
  SELECT CASE
    WHEN role = 'medico' THEN true
    WHEN role = 'asistente' THEN puede_editar_agenda
    ELSE false
  END
  FROM public.profiles WHERE id = user_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 4. Actualizar políticas RLS de HISTORIA CLÍNICA
DROP POLICY IF EXISTS "historia_select" ON public.historia_clinica;
CREATE POLICY "historia_select" ON public.historia_clinica
  FOR SELECT USING (
    public.check_asistente_ver_hc(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.pacientes
      WHERE id = historia_clinica.paciente_id AND creado_por = get_medico_id()
    )
  );

DROP POLICY IF EXISTS "historia_insert" ON public.historia_clinica;
CREATE POLICY "historia_insert" ON public.historia_clinica
  FOR INSERT WITH CHECK (
    public.check_asistente_ver_hc(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.pacientes
      WHERE id = historia_clinica.paciente_id AND creado_por = get_medico_id()
    )
  );

DROP POLICY IF EXISTS "historia_update" ON public.historia_clinica;
CREATE POLICY "historia_update" ON public.historia_clinica
  FOR UPDATE USING (
    public.check_asistente_ver_hc(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.pacientes
      WHERE id = historia_clinica.paciente_id AND creado_por = get_medico_id()
    )
  );

-- 5. Habilitar RLS y crear políticas RLS para CONSULTAS (Historia clínica cronológica)
ALTER TABLE public.consultas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "consultas_select" ON public.consultas;
CREATE POLICY "consultas_select" ON public.consultas
  FOR SELECT USING (
    public.check_asistente_ver_hc(auth.uid())
    AND medico_id = get_medico_id()
  );

DROP POLICY IF EXISTS "consultas_insert" ON public.consultas;
CREATE POLICY "consultas_insert" ON public.consultas
  FOR INSERT WITH CHECK (
    public.check_asistente_ver_hc(auth.uid())
    AND medico_id = get_medico_id()
  );

DROP POLICY IF EXISTS "consultas_update" ON public.consultas;
CREATE POLICY "consultas_update" ON public.consultas
  FOR UPDATE USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'medico'
    AND medico_id = auth.uid()
  );

DROP POLICY IF EXISTS "consultas_delete" ON public.consultas;
CREATE POLICY "consultas_delete" ON public.consultas
  FOR DELETE USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'medico'
    AND medico_id = auth.uid()
  );

-- 6. Actualizar políticas RLS de TURNOS (Agenda)
DROP POLICY IF EXISTS "turnos_insert" ON public.turnos;
CREATE POLICY "turnos_insert" ON public.turnos
  FOR INSERT WITH CHECK (
    public.check_asistente_editar_agenda(auth.uid())
    AND medico_id = get_medico_id()
  );

DROP POLICY IF EXISTS "turnos_update" ON public.turnos;
CREATE POLICY "turnos_update" ON public.turnos
  FOR UPDATE USING (
    public.check_asistente_editar_agenda(auth.uid())
    AND medico_id = get_medico_id()
  );

-- 7. Actualizar políticas RLS de BLOQUEOS DE AGENDA
DROP POLICY IF EXISTS "bloqueos_insert" ON public.bloqueos_agenda;
CREATE POLICY "bloqueos_insert" ON public.bloqueos_agenda
  FOR INSERT WITH CHECK (
    public.check_asistente_editar_agenda(auth.uid())
    AND medico_id = get_medico_id()
  );
