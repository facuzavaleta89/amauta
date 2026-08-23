-- ============================================================
-- 019_profiles_select_medico_vinculado.sql
-- Fix: el asistente necesita ver el perfil de su médico vinculado
-- para que la mensajería (y cualquier otra función que muestre
-- datos del médico) funcione correctamente.
--
-- La política anterior solo permitía:
--   1. Ver el propio perfil (id = auth.uid())
--   2. El médico ve todo (role = 'medico')
--   3. El médico ve sus asistentes (medico_id = auth.uid())
--
-- Usamos public.get_user_medico_id(auth.uid()) que es una
-- función SECURITY DEFINER para evitar recursión RLS infinita.
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
  );
