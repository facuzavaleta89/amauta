-- ============================================================
-- 007_certificados.sql
-- Certificados médicos con generación de PDF
-- ============================================================

CREATE TYPE certificado_tipo AS ENUM (
  'aptitud_fisica',
  'reposo',
  'diagnostico',
  'libre_deuda',
  'otro'
);

CREATE TABLE public.certificados (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paciente_id  UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE RESTRICT,

  -- Snapshot de datos del paciente al momento de emitir
  paciente_nombre    TEXT NOT NULL,
  paciente_dni       TEXT NOT NULL,
  paciente_dob       DATE NOT NULL,
  obra_social_nombre TEXT,
  numero_afiliado    TEXT,

  -- Contenido del certificado
  tipo               certificado_tipo NOT NULL DEFAULT 'otro',
  tipo_descripcion   TEXT,           -- Si tipo = 'otro', descripción libre

  -- Texto principal del certificado (campo libre)
  -- Ej: "Certifico que el/la Sr/a... se encuentra en condiciones de..."
  contenido          TEXT NOT NULL,

  -- Para certificados de reposo
  dias_reposo        INTEGER,        -- Cantidad de días
  fecha_inicio_reposo DATE,

  fecha_certificado  DATE NOT NULL DEFAULT CURRENT_DATE,
  valido_hasta       DATE,           -- Vencimiento del certificado (opcional)

  -- PDF generado
  pdf_path           TEXT,
  pdf_generado_at    TIMESTAMPTZ,

  -- Firma
  firmado_por        UUID NOT NULL REFERENCES public.profiles(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_certificados_paciente ON public.certificados(paciente_id);
CREATE INDEX idx_certificados_fecha ON public.certificados(fecha_certificado);

ALTER TABLE public.certificados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "certificados_select" ON public.certificados
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "certificados_insert" ON public.certificados
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "certificados_update" ON public.certificados
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "certificados_delete" ON public.certificados
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'medico'
    )
  );

CREATE TRIGGER certificados_updated_at
  BEFORE UPDATE ON public.certificados
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
