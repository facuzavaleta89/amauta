-- ============================================================
-- 012_profiles_firma_permisos.sql
-- Agrega firma digital e inicio de permisos detallados para asistentes
-- ============================================================

-- Firma digital (almacenada como URL pública o base64 image data string)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS firma_url TEXT;

COMMENT ON COLUMN public.profiles.firma_url IS 'Firma digitalizada del médico (URL de imagen o base64)';

-- Permisos granulares para asistentes vinculados
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS puede_ver_historias BOOLEAN DEFAULT TRUE;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS puede_editar_agenda BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN public.profiles.puede_ver_historias IS 'Permiso de asistente para visualizar o editar historias clínicas';
COMMENT ON COLUMN public.profiles.puede_editar_agenda IS 'Permiso de asistente para crear, modificar o eliminar turnos de la agenda';
