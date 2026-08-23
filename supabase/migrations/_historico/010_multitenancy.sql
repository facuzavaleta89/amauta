-- ============================================================
-- 010_multitenancy.sql
-- Sistema de roles Médico / Asistente
--
-- Esta migración aplica sobre las tablas ya existentes y agrega:
--   1. medico_id en profiles, bloqueos_agenda, turnos, difusion_posts
--   2. Función helper get_medico_id()
--   3. Tabla solicitudes_asistente (workflow de vinculación)
--   4. Recrea todas las políticas RLS con el nuevo modelo
--
-- ROLES:
--   'medico'    → dueño del tenant. Tiene acceso total a sus datos.
--                 Crea pacientes (creado_por = su id).
--                 Es responsable de recetas, diagnósticos, eliminaciones.
--
--   'asistente' → trabaja para un médico. profiles.medico_id apunta al médico.
--                 Puede: ver la agenda, agendar/modificar turnos,
--                        registrar pacientes (creado_por = medico_id del médico),
--                        subir estudios, generar pedidos y certificados.
--                 No puede: eliminar datos, emitir recetas, modificar evoluciones.
--
-- TENANT KEY:
--   - pacientes.creado_por = id del médico
--   - turnos.medico_id, bloqueos_agenda.medico_id, difusion_posts.medico_id
--   - get_medico_id() resuelve según el rol del usuario actual
-- ============================================================

-- ── PASO 1: Agregar medico_id a profiles ─────────────────────
-- Ya ejecutado en Supabase. Incluido aquí para trazabilidad.
-- ALTER TABLE profiles ADD COLUMN medico_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
-- UPDATE profiles SET role = 'asistente' WHERE role = 'secretario';
-- CREATE INDEX idx_profiles_medico ON profiles(medico_id);

-- ── PASO 2: Agregar medico_id a tablas de agenda ─────────────
-- Ya ejecutado en Supabase. Incluido aquí para trazabilidad.
-- ALTER TABLE bloqueos_agenda ADD COLUMN medico_id uuid REFERENCES profiles(id) NOT NULL;
-- ALTER TABLE turnos          ADD COLUMN medico_id uuid REFERENCES profiles(id) NOT NULL;
-- ALTER TABLE difusion_posts  ADD COLUMN medico_id uuid REFERENCES profiles(id) NOT NULL;
-- (Pobladas con creado_por/agendado_por antes de hacer NOT NULL)

-- ── PASO 3: Función helper get_medico_id() ───────────────────
-- Retorna: si soy médico   → mi propio id
--          si soy asistente → el id del médico al que pertenezco
-- Todas las políticas RLS multi-tenant usan esta función.
CREATE OR REPLACE FUNCTION public.get_medico_id()
RETURNS uuid AS $$
  SELECT CASE
    WHEN role = 'medico'    THEN id
    WHEN role = 'asistente' THEN medico_id
    ELSE NULL
  END
  FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── PASO 4: Tabla solicitudes_asistente ──────────────────────
-- Workflow de vinculación asistente ↔ médico.
-- El asistente envía una solicitud. El médico la aprueba o rechaza.
-- Al aprobar (app-side): profiles.medico_id del asistente = medico_id.
-- Constraint UNIQUE garantiza una sola solicitud activa por par.
CREATE TABLE public.solicitudes_asistente (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  solicitante_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  medico_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  estado          TEXT NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  mensaje         TEXT,                          -- Mensaje opcional del asistente
  respondido_at   TIMESTAMPTZ,                   -- Cuándo el médico respondió
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(solicitante_id, medico_id)
);

CREATE INDEX idx_solicitudes_medico      ON public.solicitudes_asistente(medico_id);
CREATE INDEX idx_solicitudes_solicitante ON public.solicitudes_asistente(solicitante_id);
CREATE INDEX idx_solicitudes_estado      ON public.solicitudes_asistente(estado);

ALTER TABLE public.solicitudes_asistente ENABLE ROW LEVEL SECURITY;

-- El asistente ve sus propias solicitudes; el médico ve las que le envían
CREATE POLICY "solicitudes_select" ON public.solicitudes_asistente
  FOR SELECT USING (solicitante_id = auth.uid() OR medico_id = auth.uid());

-- Solo el solicitante puede crear la solicitud
CREATE POLICY "solicitudes_insert" ON public.solicitudes_asistente
  FOR INSERT WITH CHECK (solicitante_id = auth.uid());

-- Solo el médico puede aprobar o rechazar
CREATE POLICY "solicitudes_update" ON public.solicitudes_asistente
  FOR UPDATE USING (medico_id = auth.uid());

CREATE TRIGGER solicitudes_updated_at
  BEFORE UPDATE ON public.solicitudes_asistente
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ── RESUMEN DE PERMISOS POR ROL ──────────────────────────────
-- ┌─────────────────────────┬──────────┬───────────┐
-- │ Operación               │ Médico   │ Asistente │
-- ├─────────────────────────┼──────────┼───────────┤
-- │ Ver pacientes           │ ✓        │ ✓         │
-- │ Crear pacientes         │ ✓        │ ✓         │
-- │ Modificar pacientes     │ ✓        │ ✓         │
-- │ Eliminar pacientes      │ ✓        │ ✗         │
-- ├─────────────────────────┼──────────┼───────────┤
-- │ Ver/crear turnos        │ ✓        │ ✓         │
-- │ Modificar turnos        │ ✓        │ ✓         │
-- │ Eliminar turnos         │ ✓        │ ✗         │
-- │ Gestionar bloqueos      │ ✓        │ ver+crear │
-- ├─────────────────────────┼──────────┼───────────┤
-- │ Ver historia clínica    │ ✓        │ ✓         │
-- │ Editar historia clínica │ ✓        │ ✓         │
-- │ Eliminar historia       │ ✓        │ ✗         │
-- ├─────────────────────────┼──────────┼───────────┤
-- │ Ver/subir estudios      │ ✓        │ ✓         │
-- │ Eliminar estudios       │ ✓        │ ✗         │
-- ├─────────────────────────┼──────────┼───────────┤
-- │ Ver/registrar evol.     │ ✓        │ ver+crear │
-- │ Modificar/elim. evol.   │ ✓        │ ✗         │
-- ├─────────────────────────┼──────────┼───────────┤
-- │ Ver/crear pedidos       │ ✓        │ ✓         │
-- │ Modificar pedidos       │ ✓        │ ✓         │
-- │ Eliminar pedidos        │ ✓        │ ✗         │
-- ├─────────────────────────┼──────────┼───────────┤
-- │ Ver/crear certificados  │ ✓        │ ✓         │
-- │ Modificar certificados  │ ✓        │ ✓         │
-- │ Eliminar certificados   │ ✓        │ ✗         │
-- ├─────────────────────────┼──────────┼───────────┤
-- │ Ver/crear recetas       │ ✓        │ solo ver  │
-- │ Modificar/elim. recetas │ ✓        │ ✗         │
-- ├─────────────────────────┼──────────┼───────────┤
-- │ Ver difusion posts      │ ✓        │ ✓         │
-- │ Crear difusion posts    │ ✓        │ ✓ (borrador)│
-- │ Publicar/editar posts   │ ✓        │ ✗         │
-- │ Eliminar posts          │ ✓        │ ✗         │
-- │ Ver/registrar envíos    │ ✓        │ ✓         │
-- └─────────────────────────┴──────────┴───────────┘
