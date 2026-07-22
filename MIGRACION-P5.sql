-- ============================================================
-- MIGRACIÓN P5 — Archivado de pacientes
-- Copiá y pegá este bloque en el SQL Editor de Supabase.
-- Corresponde a: supabase/migrations/024_pacientes_archivado.sql
-- ============================================================

-- Columna de archivado (NULL = activo; con valor = archivado + cuándo).
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS archivado_at TIMESTAMPTZ;

-- Índice parcial para el listado de pacientes activos (caso por defecto).
CREATE INDEX IF NOT EXISTS idx_pacientes_activos
  ON public.pacientes(creado_por)
  WHERE archivado_at IS NULL;
