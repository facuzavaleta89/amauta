-- ============================================================
-- 009_recetas.sql
-- Recetas digitales (estructura lista, funcionalidad pendiente)
-- En Argentina regulado por Ley 26.529 y disposiciones ANMAT/PAMI
-- El médico está en proceso de cumplir los requisitos legales.
--
-- RLS: tenant via pacientes.creado_por = get_medico_id()
-- Solo el médico puede emitir/modificar/eliminar recetas.
-- Los asistentes pueden ver pero NO crear ni modificar.
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
  fecha_vencimiento  DATE,            -- Calculado externamente o por trigger

  -- Número de receta (asignado por el sistema o por la autoridad regulatoria)
  numero_receta      TEXT UNIQUE,

  -- Firma digital del médico
  -- (Implementación según normativa ANMAT cuando corresponda)
  firma_digital_ref  TEXT,            -- Referencia al mecanismo de firma habilitado

  -- PDF generado
  pdf_path           TEXT,
  pdf_generado_at    TIMESTAMPTZ,

  -- Auditoría (solo el médico firma recetas)
  firmado_por  UUID NOT NULL REFERENCES public.profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recetas_paciente ON public.recetas(paciente_id);
CREATE INDEX idx_recetas_fecha ON public.recetas(fecha_receta);
CREATE INDEX idx_recetas_numero ON public.recetas(numero_receta);

ALTER TABLE public.recetas ENABLE ROW LEVEL SECURITY;

-- Médico y asistentes pueden VER recetas del tenant
CREATE POLICY "recetas_select" ON public.recetas
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.pacientes
    WHERE id = recetas.paciente_id AND creado_por = get_medico_id()
  ));

-- Solo el médico puede emitir recetas (control legal estricto)
CREATE POLICY "recetas_insert" ON public.recetas
  FOR INSERT WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'medico'
    AND EXISTS (
      SELECT 1 FROM public.pacientes
      WHERE id = recetas.paciente_id AND creado_por = auth.uid()
    )
  );

-- Solo el médico puede modificar recetas (ej: guardar pdf_path, firma)
CREATE POLICY "recetas_update" ON public.recetas
  FOR UPDATE USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'medico'
    AND EXISTS (
      SELECT 1 FROM public.pacientes
      WHERE id = recetas.paciente_id AND creado_por = auth.uid()
    )
  );

-- Solo el médico puede eliminar recetas
CREATE POLICY "recetas_delete" ON public.recetas
  FOR DELETE USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'medico'
    AND EXISTS (
      SELECT 1 FROM public.pacientes
      WHERE id = recetas.paciente_id AND creado_por = auth.uid()
    )
  );

CREATE TRIGGER recetas_updated_at
  BEFORE UPDATE ON public.recetas
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
