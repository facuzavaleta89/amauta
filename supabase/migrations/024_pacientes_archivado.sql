-- Archivado de pacientes (Ley 26.529: la documentación clínica se conserva).
-- Los pacientes no se borran: se ARCHIVAN. El borrado físico queda como excepción
-- (solo pacientes sin ninguna actuación registrada; se valida en el endpoint).
--
-- archivado_at: NULL = activo · con valor = archivado (y queda registrado cuándo).
-- Aditiva y segura: no reescribe la tabla ni afecta filas existentes (quedan activas).
-- RLS: NO se toca. La política `pacientes_update` existente cubre el UPDATE de esta
-- columna; el control "solo médico" para archivar/desarchivar se hace en el endpoint.
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS archivado_at TIMESTAMPTZ;

-- Índice parcial para acelerar el listado de pacientes activos (el caso por defecto).
CREATE INDEX IF NOT EXISTS idx_pacientes_activos
  ON public.pacientes(creado_por)
  WHERE archivado_at IS NULL;
