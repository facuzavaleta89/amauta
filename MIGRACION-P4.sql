-- ============================================================================
-- MIGRACIÓN PARTE 4 — Realtime para mensajes_internos
-- ============================================================================
-- Copiá y pegá este SQL en el SQL Editor de Supabase y ejecutalo.
-- Es idéntico a supabase/migrations/023_realtime_mensajes_internos.sql.
--
-- Qué hace: agrega public.mensajes_internos a la publicación supabase_realtime
-- (necesario para que la campanita reciba los INSERT en vivo). Es idempotente:
-- si la tabla YA estaba habilitada para Realtime, no hace nada ni da error.
--
-- ¿Cómo saber si ya estaba? Podés correr esto antes para verlo:
--   SELECT tablename FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
--   ORDER BY 1;
-- Si 'mensajes_internos' aparece en la lista, ya estaba y este script no cambia nada.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'mensajes_internos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mensajes_internos;
  END IF;
END $$;
