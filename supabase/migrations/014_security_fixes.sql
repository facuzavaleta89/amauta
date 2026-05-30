-- ============================================================
-- 014_security_fixes.sql
-- Corrección de recursión RLS en profiles y endurecimiento de seguridad
-- ============================================================

-- 1. Crear funciones helper seguras en SECURITY DEFINER para evitar recursión RLS en perfiles
CREATE OR REPLACE FUNCTION public.get_user_role(user_id uuid)
RETURNS text AS $$
  SELECT role FROM public.profiles WHERE id = user_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_user_medico_id(user_id uuid)
RETURNS uuid AS $$
  SELECT medico_id FROM public.profiles WHERE id = user_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- 2. Corregir política RLS recursiva en public.profiles
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id
    OR public.get_user_role(auth.uid()) = 'medico'
    OR medico_id = auth.uid()
  );

-- 3. Actualizar políticas en consultas para usar el helper seguro y evitar cualquier otra recursión
DROP POLICY IF EXISTS "consultas_update" ON public.consultas;
CREATE POLICY "consultas_update" ON public.consultas
  FOR UPDATE USING (
    public.get_user_role(auth.uid()) = 'medico'
    AND medico_id = auth.uid()
  );

DROP POLICY IF EXISTS "consultas_delete" ON public.consultas;
CREATE POLICY "consultas_delete" ON public.consultas
  FOR DELETE USING (
    public.get_user_role(auth.uid()) = 'medico'
    AND medico_id = auth.uid()
  );

-- 4. Endurecer política de inserción de log de auditoría
-- El trigger `log_turno_cambio` tiene SECURITY DEFINER y puede insertar sin RLS.
-- Deshabilitamos inserciones manuales de clientes para evitar contaminación.
DROP POLICY IF EXISTS "audit_insert" ON public.turnos_audit_log;

-- 5. Sanitizar y proteger el trigger handle_new_user de registros arbitrarios
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    LEFT(COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''), NEW.email, 'Usuario'), 100),
    CASE 
      WHEN NEW.raw_user_meta_data->>'role' IN ('medico', 'asistente') THEN NEW.raw_user_meta_data->>'role'
      ELSE 'asistente'
    END
  );
  RETURN NEW;
END;
$$;
