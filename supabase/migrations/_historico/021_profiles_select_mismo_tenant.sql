-- ============================================================
-- 021_profiles_select_mismo_tenant.sql
-- Fix: permite a los asistentes ver los perfiles de otros
-- asistentes vinculados al mismo médico (mismo tenant).
-- ============================================================

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    -- El usuario siempre puede ver su propio perfil
    auth.uid() = id

    -- El médico puede ver todos los perfiles de su tenant
    OR public.get_user_role(auth.uid()) = 'medico'

    -- El médico puede ver los perfiles de sus asistentes
    OR medico_id = auth.uid()

    -- El asistente puede ver el perfil de su médico vinculado
    OR id = public.get_user_medico_id(auth.uid())

    -- El asistente puede ver los perfiles de otros asistentes del mismo médico
    OR medico_id = public.get_user_medico_id(auth.uid())
  );
