-- Migration: QR verification system, document state and validation function
-- Adds columns `codigo_verificacion` and `estado` to pedidos and certificados.
-- Creates security definer verification function.

-- 1. Alter pedidos table
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS codigo_verificacion TEXT UNIQUE;
ALTER TABLE public.pedidos ALTER COLUMN codigo_verificacion SET DEFAULT upper(substring(md5(random()::text) from 1 for 12));
-- Backfill existing rows with unique codes
UPDATE public.pedidos SET codigo_verificacion = upper(substring(md5(random()::text) from 1 for 12)) WHERE codigo_verificacion IS NULL;
ALTER TABLE public.pedidos ALTER COLUMN codigo_verificacion SET NOT NULL;

ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'emitido' CHECK (estado IN ('emitido', 'revocado'));

-- 2. Alter certificados table
ALTER TABLE public.certificados ADD COLUMN IF NOT EXISTS codigo_verificacion TEXT UNIQUE;
ALTER TABLE public.certificados ALTER COLUMN codigo_verificacion SET DEFAULT upper(substring(md5(random()::text) from 1 for 12));
-- Backfill existing rows with unique codes
UPDATE public.certificados SET codigo_verificacion = upper(substring(md5(random()::text) from 1 for 12)) WHERE codigo_verificacion IS NULL;
ALTER TABLE public.certificados ALTER COLUMN codigo_verificacion SET NOT NULL;

ALTER TABLE public.certificados ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'emitido' CHECK (estado IN ('emitido', 'revocado'));

-- 3. Create public verification function
CREATE OR REPLACE FUNCTION public.verificar_documento(codigo text)
RETURNS TABLE (
  id uuid,
  tipo_documento text,
  fecha_emision date,
  medico_nombre text,
  medico_titulo text,
  medico_matriculas jsonb,
  paciente_nombre text,
  paciente_dni text,
  contenido text,
  estado text,
  valido_hasta date
) SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  -- Certificados
  SELECT 
    c.id,
    'certificado'::text AS tipo_documento,
    c.fecha_certificado AS fecha_emision,
    p.full_name AS medico_nombre,
    p.titulo AS medico_titulo,
    p.matriculas AS medico_matriculas,
    c.paciente_nombre,
    c.paciente_dni,
    c.contenido,
    c.estado,
    c.valido_hasta
  FROM public.certificados c
  JOIN public.profiles p ON c.firmado_por = p.id
  WHERE c.codigo_verificacion = codigo
  
  UNION ALL
  
  -- Pedidos
  SELECT 
    ped.id,
    'pedido'::text AS tipo_documento,
    ped.fecha_pedido AS fecha_emision,
    p.full_name AS medico_nombre,
    p.titulo AS medico_titulo,
    p.matriculas AS medico_matriculas,
    ped.paciente_nombre,
    ped.paciente_dni,
    (E'Estudios pedidos: ' || ped.estudios_pedidos || E'\nDiagnóstico: ' || ped.diagnostico || COALESCE(E'\nIndicaciones: ' || ped.indicaciones, ''))::text AS contenido,
    ped.estado,
    NULL::date AS valido_hasta
  FROM public.pedidos ped
  JOIN public.profiles p ON ped.firmado_por = p.id
  WHERE ped.codigo_verificacion = codigo;
END;
$$ LANGUAGE plpgsql;
