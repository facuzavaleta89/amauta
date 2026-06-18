-- Migración para permitir hora en próximo control
ALTER TABLE public.historia_clinica ALTER COLUMN proximo_control TYPE TIMESTAMPTZ;
