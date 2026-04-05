-- ============================================================
-- 001_pacientes.sql
-- Tabla de pacientes + profiles (roles)
-- ============================================================

-- ── EXTENSIONES ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── PROFILES (extiende auth.users con rol) ───────────────────
-- Roles:
--   'medico'    → dueño del tenant, acceso total a sus datos
--   'asistente' → trabaja para un médico (medico_id apunta al médico)
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'asistente' CHECK (role IN ('medico', 'asistente')),
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Multi-tenancy: si es asistente, apunta al médico al que pertenece
  medico_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX idx_profiles_medico ON public.profiles(medico_id);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Cada usuario ve su propio perfil.
-- El médico ve todos los perfiles (para gestionar asistentes).
-- Un asistente ve los perfiles de su médico y compañeros (medico_id = auth.uid()).
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'medico'
    OR medico_id = auth.uid()
  );

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- ── Trigger: crear profile automático al registrar usuario ───
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'asistente')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ── FUNCIÓN HELPER: get_medico_id() ──────────────────────────
-- Retorna: si soy médico   → mi propio id
--          si soy asistente → el id del médico al que pertenezco
-- Usado por todas las políticas RLS multi-tenant.
CREATE OR REPLACE FUNCTION public.get_medico_id()
RETURNS uuid AS $$
  SELECT CASE
    WHEN role = 'medico'    THEN id
    WHEN role = 'asistente' THEN medico_id
    ELSE NULL
  END
  FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── OBRAS SOCIALES ────────────────────────────────────────────
CREATE TABLE public.obras_sociales (
  id     SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
);

INSERT INTO public.obras_sociales (nombre) VALUES
  ('OSDE'),
  ('Swiss Medical'),
  ('Galeno'),
  ('Medifé'),
  ('IOMA'),
  ('PAMI'),
  ('Sancor Salud'),
  ('Provincia Salud'),
  ('Luis Pasteur'),
  ('Accord Salud'),
  ('Federada Salud'),
  ('UPCN'),
  ('Particular / Sin obra social');

ALTER TABLE public.obras_sociales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "obras_sociales_select_all" ON public.obras_sociales
  FOR SELECT USING (auth.role() = 'authenticated');

-- ── PACIENTES ────────────────────────────────────────────────
-- creado_por = médico dueño del paciente (tenant key)
-- Los asistentes acceden via get_medico_id() que resuelve al médico.
CREATE TABLE public.pacientes (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Identificación
  dni              TEXT NOT NULL UNIQUE,
  nombre_completo  TEXT NOT NULL,
  fecha_nacimiento DATE NOT NULL,
  sexo             TEXT NOT NULL CHECK (sexo IN ('masculino', 'femenino', 'otro')),

  -- Contacto
  telefono         TEXT,
  email            TEXT,
  provincia        TEXT,
  ciudad           TEXT,

  -- Obra social
  obra_social_id   INTEGER REFERENCES public.obras_sociales(id),
  obra_social_otro TEXT,           -- Si no está en la lista
  numero_afiliado  TEXT,

  -- Auditoría / tenant key
  creado_por       UUID NOT NULL REFERENCES public.profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pacientes_dni ON public.pacientes(dni);
CREATE INDEX idx_pacientes_nombre ON public.pacientes(nombre_completo);
CREATE INDEX idx_pacientes_obra_social ON public.pacientes(obra_social_id);

ALTER TABLE public.pacientes ENABLE ROW LEVEL SECURITY;

-- Médico y asistentes ven los pacientes del mismo tenant
CREATE POLICY "pacientes_select" ON public.pacientes
  FOR SELECT USING (creado_por = get_medico_id());

-- Médico y asistentes pueden crear pacientes (se setea creado_por = médico)
CREATE POLICY "pacientes_insert" ON public.pacientes
  FOR INSERT WITH CHECK (creado_por = get_medico_id());

-- Médico y asistentes pueden actualizar pacientes del tenant
CREATE POLICY "pacientes_update" ON public.pacientes
  FOR UPDATE USING (creado_por = get_medico_id());

-- Solo el médico puede eliminar pacientes permanentemente
CREATE POLICY "pacientes_delete" ON public.pacientes
  FOR DELETE USING (
    creado_por = auth.uid()
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'medico'
  );

-- ── TRIGGER updated_at genérico ──────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER pacientes_updated_at
  BEFORE UPDATE ON public.pacientes
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
