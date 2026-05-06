-- ============================================================
-- 011_profiles_matricula.sql
-- Agrega el campo matricula al perfil del médico
-- Se usa en la firma de pedidos, certificados y recetas (PDF)
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS matricula TEXT;

COMMENT ON COLUMN public.profiles.matricula IS 'Matrícula médica provincial o nacional (ej: MN 123456)';
