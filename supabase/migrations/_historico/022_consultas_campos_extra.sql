-- Campos extra ad-hoc por consulta (Examen Físico / Parámetros Metabólicos).
-- Array JSONB de objetos: [{ seccion, nombre, valor }].
-- seccion ∈ 'examen_fisico' | 'parametros_metabolicos'. Preserva el orden de carga.
-- Aditiva y segura: no reescribe la tabla ni afecta las consultas existentes.
-- RLS: las políticas de `consultas` son a nivel de fila, la columna queda cubierta. No se toca RLS.
ALTER TABLE public.consultas
  ADD COLUMN IF NOT EXISTS campos_extra JSONB NOT NULL DEFAULT '[]'::jsonb;
