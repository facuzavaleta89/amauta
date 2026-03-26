-- ============================================================
-- 009_recetas.sql
-- Recetas digitales (baja prioridad — estructura lista)
-- En Argentina regulado por Ley 26.529 y disposiciones ANMAT/PAMI
-- El médico está en proceso de cumplir los requisitos legales
--
-- ⚠️  Esta migración crea la tabla vacía.
--     La funcionalidad se implementará cuando se regularice.
-- ============================================================

CREATE TABLE public.recetas (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paciente_id  UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE RESTRICT,

  -- Snapshot de datos del paciente al momento de emitir
  paciente_nombre    TEXT NOT NULL,
  paciente_dni       TEXT NOT NULL,
  paciente_dob       DATE NOT NULL,
  obra_social_nombre TEXT,
  numero_afiliado    TEXT,

  -- Contenido de la receta
  diagnostico        TEXT NOT NULL,   -- CIE-10 o texto libre
  medicacion         TEXT NOT NULL,   -- Medicamento, dosis, posología

  -- Fecha de prescripción y vencimiento legal (en AR: 30 días hábiles)
  fecha_receta       DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_vencimiento  DATE GENERATED ALWAYS AS (fecha_receta + INTERVAL '30 days') STORED,

  -- Número de receta (asignado por el sistema o por la autoridad regulatoria)
  numero_receta      TEXT UNIQUE,

  -- Firma digital del médico
  -- (Implementación según normativa ANMAT cuando corresponda)
  firma_digital_ref  TEXT,            -- Referencia al mecanismo de firma habilitado

  -- PDF generado
  pdf_path           TEXT,
  pdf_generado_at    TIMESTAMPTZ,

  -- Auditoría
  firmado_por  UUID NOT NULL REFERENCES public.profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recetas_paciente ON public.recetas(paciente_id);
CREATE INDEX idx_recetas_fecha ON public.recetas(fecha_receta);
CREATE INDEX idx_recetas_numero ON public.recetas(numero_receta);

ALTER TABLE public.recetas ENABLE ROW LEVEL SECURITY;

-- Solo el médico puede emitir recetas (control estricto)
CREATE POLICY "recetas_select" ON public.recetas
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "recetas_insert" ON public.recetas
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'medico'
    )
  );

CREATE POLICY "recetas_update" ON public.recetas
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'medico'
    )
  );

CREATE POLICY "recetas_delete" ON public.recetas
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'medico'
    )
  );

CREATE TRIGGER recetas_updated_at
  BEFORE UPDATE ON public.recetas
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
