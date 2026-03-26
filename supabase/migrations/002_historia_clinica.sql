-- ============================================================
-- 002_historia_clinica.sql
-- Historia clínica: 1 por paciente (relación 1:1)
-- ============================================================

CREATE TABLE public.historia_clinica (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paciente_id               UUID NOT NULL UNIQUE REFERENCES public.pacientes(id) ON DELETE CASCADE,

  -- Antecedentes
  antecedentes_patologicos  TEXT,   -- Enfermedades que presenta
  medicacion_diaria         TEXT,   -- Medicación actual
  habitos_toxicos           TEXT,   -- Tabaco, alcohol, etc.
  actividad_fisica          TEXT,
  actividad_laboral         TEXT,
  antecedentes_quirurgicos  TEXT,   -- "A quirúrgicos" en el documento

  -- Consulta actual
  clinica_actual            TEXT,   -- Motivo de consulta / clínica actual
  examen_fisico             TEXT,
  laboratorio               TEXT,
  estudios_complementarios  TEXT,   -- Descripción textual (los archivos van en tabla estudios)
  conducta                  TEXT,   -- Plan / conducta médica
  proximo_control           DATE,   -- Puede linkear con un turno futuro

  -- Mediciones iniciales (para evolución)
  peso_inicial              NUMERIC(5,2),  -- kg
  talla                     NUMERIC(5,2),  -- cm
  perimetro_cintura         NUMERIC(5,2),  -- cm

  -- Auditoría
  creado_por    UUID NOT NULL REFERENCES public.profiles(id),
  updated_by    UUID REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_historia_paciente ON public.historia_clinica(paciente_id);

ALTER TABLE public.historia_clinica ENABLE ROW LEVEL SECURITY;

CREATE POLICY "historia_select" ON public.historia_clinica
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "historia_insert" ON public.historia_clinica
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "historia_update" ON public.historia_clinica
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "historia_delete" ON public.historia_clinica
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'medico'
    )
  );

CREATE TRIGGER historia_updated_at
  BEFORE UPDATE ON public.historia_clinica
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
