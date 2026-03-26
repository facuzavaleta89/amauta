-- ============================================================
-- 004_evoluciones.sql
-- Registros de evolución clínica por paciente (series temporales)
-- Para gráficos: peso, IMC, HbA1c, perfil lipídico, etc.
-- ============================================================

CREATE TABLE public.evoluciones (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paciente_id   UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,

  -- ── Antropometría ──────────────────────────────────────────
  peso               NUMERIC(5,2),    -- kg
  perimetro_cintura  NUMERIC(5,2),    -- cm
  -- IMC se calcula en runtime: peso / (talla_m ^ 2)
  -- talla se obtiene de historia_clinica

  -- ── Metabolismo glucídico ──────────────────────────────────
  hba1c              NUMERIC(4,2),    -- % (Ej: 7.40)
  glucemia_ayunas    NUMERIC(5,1),    -- mg/dL
  insulina_basal     NUMERIC(6,2),    -- µU/mL (opcional)
  homa_ir            NUMERIC(5,2),    -- Calculado: insulina * glucemia / 405

  -- ── Perfil lipídico ────────────────────────────────────────
  colesterol_total   NUMERIC(5,1),    -- mg/dL
  hdl                NUMERIC(5,1),    -- mg/dL
  ldl                NUMERIC(5,1),    -- mg/dL
  trigliceridos      NUMERIC(5,1),    -- mg/dL

  -- ── Perfil hepático ────────────────────────────────────────
  got_ast            NUMERIC(6,2),    -- U/L
  gpt_alt            NUMERIC(6,2),    -- U/L
  ggt                NUMERIC(6,2),    -- U/L
  fosfatasa_alcalina NUMERIC(6,2),    -- U/L

  -- ── Presión arterial ──────────────────────────────────────
  tension_sistolica  INTEGER,         -- mmHg
  tension_diastolica INTEGER,         -- mmHg
  frecuencia_cardiaca INTEGER,        -- lpm

  -- ── Campo libre para otros hallazgos ──────────────────────
  observaciones      TEXT,

  -- Auditoría
  registrado_por UUID NOT NULL REFERENCES public.profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_evoluciones_paciente_fecha ON public.evoluciones(paciente_id, fecha);

ALTER TABLE public.evoluciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "evoluciones_select" ON public.evoluciones
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "evoluciones_insert" ON public.evoluciones
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Solo médico puede modificar/eliminar evoluciones (datos clínicos sensibles)
CREATE POLICY "evoluciones_update" ON public.evoluciones
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'medico'
    )
  );

CREATE POLICY "evoluciones_delete" ON public.evoluciones
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'medico'
    )
  );

CREATE TRIGGER evoluciones_updated_at
  BEFORE UPDATE ON public.evoluciones
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
