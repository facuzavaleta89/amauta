-- ============================================================
-- 005_turnos.sql
-- Turnero: turnos, bloqueos de agenda y log de auditoría
-- Multi-tenant: medico_id en turnos y bloqueos_agenda
-- ============================================================

-- ── TIPOS ────────────────────────────────────────────────────
CREATE TYPE turno_estado AS ENUM (
  'pendiente',    -- Agendado, sin confirmar
  'confirmado',   -- Confirmado con el paciente
  'presente',     -- El paciente llegó al consultorio
  'ausente',      -- No se presentó (no-show)
  'cancelado',    -- Cancelado por cualquier parte
  'reprogramado'  -- Fue movido a otro horario
);

-- ── TURNOS ───────────────────────────────────────────────────
-- medico_id = tenant key (apunta al médico dueño de la agenda).
-- Tanto el médico como sus asistentes pueden operar en esta tabla.
-- Al crear un turno (médico o asistente), medico_id = get_medico_id().
CREATE TABLE public.turnos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paciente_id   UUID REFERENCES public.pacientes(id) ON DELETE SET NULL,

  -- Puede ser un turno sin paciente registrado (ej: nuevo paciente)
  paciente_nombre_libre TEXT,  -- Usado cuando no está en el sistema aún

  -- Tiempo
  fecha_inicio  TIMESTAMPTZ NOT NULL,
  fecha_fin     TIMESTAMPTZ NOT NULL,

  -- Info del turno
  motivo        TEXT,
  notas         TEXT,          -- Notas internas (no las ve el paciente)
  estado        turno_estado NOT NULL DEFAULT 'pendiente',
  color         TEXT DEFAULT '#3B82F6', -- Para mostrar en el calendario

  -- Recordatorio
  recordatorio_enviado BOOLEAN DEFAULT false,

  -- Multi-tenancy: agenda del médico
  medico_id     UUID NOT NULL REFERENCES public.profiles(id),

  -- Auditoría (quién agendó el turno)
  agendado_por  UUID NOT NULL REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_turnos_fecha ON public.turnos(fecha_inicio);
CREATE INDEX idx_turnos_rango ON public.turnos(fecha_inicio, fecha_fin);
CREATE INDEX idx_turnos_paciente ON public.turnos(paciente_id);
CREATE INDEX idx_turnos_estado ON public.turnos(estado);
CREATE INDEX idx_turnos_medico ON public.turnos(medico_id);

ALTER TABLE public.turnos ENABLE ROW LEVEL SECURITY;

-- Médico y asistentes ven la agenda del médico
CREATE POLICY "turnos_select" ON public.turnos
  FOR SELECT USING (medico_id = get_medico_id());

-- Médico y asistentes pueden agendar turnos en la agenda del médico
CREATE POLICY "turnos_insert" ON public.turnos
  FOR INSERT WITH CHECK (medico_id = get_medico_id());

-- Médico y asistentes pueden modificar turnos (cambiar estado, reprogramar)
CREATE POLICY "turnos_update" ON public.turnos
  FOR UPDATE USING (medico_id = get_medico_id());

-- Solo el médico puede eliminar turnos permanentemente
CREATE POLICY "turnos_delete" ON public.turnos
  FOR DELETE USING (
    medico_id = auth.uid()
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'medico'
  );

CREATE TRIGGER turnos_updated_at
  BEFORE UPDATE ON public.turnos
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ── BLOQUEOS DE AGENDA ────────────────────────────────────────
-- Para bloquear horarios: vacaciones, almuerzo, reuniones, etc.
-- medico_id = tenant key de la agenda.
CREATE TABLE public.bloqueos_agenda (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fecha_inicio  TIMESTAMPTZ NOT NULL,
  fecha_fin     TIMESTAMPTZ NOT NULL,
  motivo        TEXT NOT NULL DEFAULT 'No disponible',  -- Mostrar en el calendario
  es_recurrente BOOLEAN DEFAULT false,
  -- Para recurrencia simple (ej: almuerzo todos los días)
  recurrencia_fin DATE,        -- Hasta cuándo aplica la recurrencia
  dias_semana   INTEGER[],     -- Array de días: 0=Dom, 1=Lun...6=Sáb

  -- Multi-tenancy: agenda del médico
  medico_id     UUID NOT NULL REFERENCES public.profiles(id),

  creado_por    UUID NOT NULL REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bloqueos_medico ON public.bloqueos_agenda(medico_id);

ALTER TABLE public.bloqueos_agenda ENABLE ROW LEVEL SECURITY;

-- Médico y asistentes ven los bloqueos de la agenda
CREATE POLICY "bloqueos_select" ON public.bloqueos_agenda
  FOR SELECT USING (medico_id = get_medico_id());

-- Médico y asistentes pueden crear bloqueos en la agenda del médico
CREATE POLICY "bloqueos_insert" ON public.bloqueos_agenda
  FOR INSERT WITH CHECK (medico_id = get_medico_id());

-- Solo el médico puede eliminar bloqueos
CREATE POLICY "bloqueos_delete" ON public.bloqueos_agenda
  FOR DELETE USING (
    medico_id = auth.uid()
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'medico'
  );

-- ── LOG DE AUDITORÍA DE TURNOS ────────────────────────────────
-- Registro de cada cambio en un turno: quién, cuándo, qué cambió
CREATE TABLE public.turnos_audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  turno_id    UUID NOT NULL REFERENCES public.turnos(id) ON DELETE CASCADE,
  usuario_id  UUID NOT NULL REFERENCES public.profiles(id),
  accion      TEXT NOT NULL,    -- 'creado', 'modificado', 'cancelado', 'reprogramado', etc.
  detalle     JSONB,            -- Snapshot del cambio: {campo: {antes, despues}}
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_turno ON public.turnos_audit_log(turno_id);
CREATE INDEX idx_audit_usuario ON public.turnos_audit_log(usuario_id);

ALTER TABLE public.turnos_audit_log ENABLE ROW LEVEL SECURITY;

-- Médico y asistentes pueden ver el log de auditoría de su agenda
CREATE POLICY "audit_select" ON public.turnos_audit_log
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.turnos
    WHERE id = turnos_audit_log.turno_id AND medico_id = get_medico_id()
  ));

-- Insert abierto (lo inserta el trigger server-side)
CREATE POLICY "audit_insert" ON public.turnos_audit_log
  FOR INSERT WITH CHECK (true);

-- ── TRIGGER: auto-log al modificar un turno ──────────────────
CREATE OR REPLACE FUNCTION public.log_turno_cambio()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.turnos_audit_log (turno_id, usuario_id, accion, detalle)
    VALUES (NEW.id, NEW.agendado_por, 'creado', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.turnos_audit_log (turno_id, usuario_id, accion, detalle)
    VALUES (
      NEW.id,
      auth.uid(),
      CASE
        WHEN NEW.estado = 'cancelado' THEN 'cancelado'
        WHEN OLD.fecha_inicio <> NEW.fecha_inicio THEN 'reprogramado'
        ELSE 'modificado'
      END,
      jsonb_build_object(
        'antes', to_jsonb(OLD),
        'despues', to_jsonb(NEW)
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER turno_audit_trigger
  AFTER INSERT OR UPDATE ON public.turnos
  FOR EACH ROW EXECUTE PROCEDURE public.log_turno_cambio();
