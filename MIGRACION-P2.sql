-- ============================================================================
-- MIGRACIÓN PARTE 2 — columna campos_extra en public.consultas
-- ============================================================================
-- Copiá y pegá este SQL en el SQL Editor de Supabase y ejecutalo.
-- Es idéntico a supabase/migrations/022_consultas_campos_extra.sql.
--
-- Qué hace: agrega una columna JSONB para campos extra ad-hoc por consulta,
-- con default '[]'. Es aditiva y segura: no reescribe la tabla ni afecta las
-- consultas existentes. NO toca RLS (las políticas de `consultas` son a nivel
-- de fila, así que la columna nueva queda cubierta automáticamente).
--
-- Estructura esperada del array: [{ seccion, nombre, valor }]
--   seccion ∈ 'examen_fisico' | 'parametros_metabolicos'
-- ============================================================================

ALTER TABLE public.consultas
  ADD COLUMN IF NOT EXISTS campos_extra JSONB NOT NULL DEFAULT '[]'::jsonb;
