-- ============================================================
-- 001_pacientes.sql
-- Tabla de pacientes + profiles (roles)
-- ============================================================

-- ── EXTENSIONES ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── PROFILES (extiende auth.users con rol) ───────────────────
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'secretario' CHECK (role IN ('medico', 'secretario')),
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Cada usuario solo ve su propio perfil, el médico ve todos
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'medico'
    )
  );

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Trigger: crear profile automático al registrar usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'secretario')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

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

  -- Auditoría
  creado_por       UUID NOT NULL REFERENCES public.profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pacientes_dni ON public.pacientes(dni);
CREATE INDEX idx_pacientes_nombre ON public.pacientes(nombre_completo);
CREATE INDEX idx_pacientes_obra_social ON public.pacientes(obra_social_id);

ALTER TABLE public.pacientes ENABLE ROW LEVEL SECURITY;

-- Autenticados pueden ver todos los pacientes
CREATE POLICY "pacientes_select" ON public.pacientes
  FOR SELECT USING (auth.role() = 'authenticated');

-- Cualquier autenticado puede crear pacientes
CREATE POLICY "pacientes_insert" ON public.pacientes
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Cualquier autenticado puede actualizar
CREATE POLICY "pacientes_update" ON public.pacientes
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Solo el médico puede eliminar pacientes
CREATE POLICY "pacientes_delete" ON public.pacientes
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'medico'
    )
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
