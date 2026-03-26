-- ============================================================
-- 003_estudios.sql
-- Estudios complementarios: archivos PDF/imagen por paciente
-- ============================================================

CREATE TABLE public.estudios (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paciente_id   UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,

  nombre        TEXT NOT NULL,          -- Ej: "Eco abdominal mayo 2025"
  tipo          TEXT,                   -- Ej: "Laboratorio", "Ecografía", "RX", etc.
  fecha_estudio DATE,                   -- Fecha del estudio (puede diferir de la carga)
  descripcion   TEXT,                   -- Observación del médico sobre el estudio

  -- Storage de Supabase (bucket privado "estudios")
  storage_path  TEXT NOT NULL,          -- Ruta interna: {paciente_id}/{uuid}.pdf
  file_name     TEXT NOT NULL,          -- Nombre original del archivo
  file_size     INTEGER,                -- Bytes
  mime_type     TEXT DEFAULT 'application/pdf',

  -- Auditoría
  subido_por    UUID NOT NULL REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_estudios_paciente ON public.estudios(paciente_id);
CREATE INDEX idx_estudios_fecha ON public.estudios(fecha_estudio);

ALTER TABLE public.estudios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "estudios_select" ON public.estudios
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "estudios_insert" ON public.estudios
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "estudios_update" ON public.estudios
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "estudios_delete" ON public.estudios
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'medico'
    )
  );

-- ── NOTA SOBRE STORAGE ───────────────────────────────────────
-- Crear el bucket "estudios" como PRIVADO en Supabase Dashboard
-- (Storage > New bucket > Private).
-- Las políticas de acceso se configuran en el Dashboard o via CLI:
--
-- Permitir SELECT (download) solo a usuarios autenticados:
--   storage.objects: SELECT WHERE bucket_id = 'estudios' AND auth.role() = 'authenticated'
-- Permitir INSERT (upload) a usuarios autenticados:
--   storage.objects: INSERT WHERE bucket_id = 'estudios' AND auth.role() = 'authenticated'
-- Permitir DELETE solo al médico:
--   storage.objects: DELETE WHERE bucket_id = 'estudios'
--     AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'medico')
