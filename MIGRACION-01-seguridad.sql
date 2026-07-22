-- ============================================================================
-- Migration 025 — Endurecimiento de seguridad (datos sensibles de salud)
-- ============================================================================
-- Ley 25.326 (AR): la data clínica es "dato sensible". Esta migración cierra
-- cuatro hallazgos de la auditoría de la base real:
--
--   1. CRÍTICO  verificar_documento exponía DNI completo y contenido clínico
--               en la página pública /verificar/[codigo] (sin login).
--   2. CRÍTICO  Políticas RLS huérfanas en `consultas` (medico_full_access,
--               asistente_access) salteaban los permisos granulares.
--   3. ALTO     DELETE de pedidos/certificados seguía habilitado en la base
--               pese a que la regla de negocio es "nunca se borran, solo se anulan".
--   4. MEDIO    log_turno_cambio() (SECURITY DEFINER) sin search_path fijo.
--
-- Idempotente donde es posible (DROP ... IF EXISTS, CREATE OR REPLACE).
-- ============================================================================


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 1. verificar_documento — dejar de exponer datos sensibles                  │
-- └──────────────────────────────────────────────────────────────────────────┘
-- La página pública mostraba nombre completo + DNI completo + contenido clínico
-- (diagnóstico, estudios pedidos). La función corre con el admin client, así que
-- ocultarlo en React no alcanza: hay que quitarlo EN LA FUNCIÓN.
--
-- Nueva forma del retorno:
--   · Se ELIMINAN: paciente_dni (completo) y contenido (clínico).
--   · Se AGREGA:   paciente_dni_masked → solo los últimos 3 dígitos visibles
--                  ('12345678' → '•••••678'; ≤3 caracteres → todo enmascarado).
--   · paciente_nombre se MANTIENE (sin él la verificación no cumple su función).
--   · Se agrega SET search_path = public (era SECURITY DEFINER sin search_path).
--
-- Cambia la firma (columnas del RETURNS TABLE), por lo que CREATE OR REPLACE no
-- basta: hay que DROP + CREATE.
DROP FUNCTION IF EXISTS public.verificar_documento(text);

CREATE FUNCTION public.verificar_documento(codigo text)
RETURNS TABLE (
  id uuid,
  tipo_documento text,
  fecha_emision date,
  medico_nombre text,
  medico_titulo text,
  medico_matriculas jsonb,
  paciente_nombre text,
  paciente_dni_masked text,
  estado text,
  valido_hasta date
) SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  -- Certificados
  SELECT
    c.id,
    'certificado'::text,
    c.fecha_certificado,
    p.full_name,
    p.titulo,
    p.matriculas,
    c.paciente_nombre,
    -- Enmascarado robusto para longitud variable de DNI.
    CASE
      WHEN c.paciente_dni IS NULL          THEN NULL
      WHEN length(c.paciente_dni) <= 3     THEN repeat('•', length(c.paciente_dni))
      ELSE repeat('•', length(c.paciente_dni) - 3) || right(c.paciente_dni, 3)
    END::text AS paciente_dni_masked,
    c.estado,
    c.valido_hasta
  FROM public.certificados c
  JOIN public.profiles p ON c.firmado_por = p.id
  WHERE c.codigo_verificacion = codigo

  UNION ALL

  -- Pedidos
  SELECT
    ped.id,
    'pedido'::text,
    ped.fecha_pedido,
    p.full_name,
    p.titulo,
    p.matriculas,
    ped.paciente_nombre,
    CASE
      WHEN ped.paciente_dni IS NULL        THEN NULL
      WHEN length(ped.paciente_dni) <= 3   THEN repeat('•', length(ped.paciente_dni))
      ELSE repeat('•', length(ped.paciente_dni) - 3) || right(ped.paciente_dni, 3)
    END::text AS paciente_dni_masked,
    ped.estado,
    NULL::date
  FROM public.pedidos ped
  JOIN public.profiles p ON ped.firmado_por = p.id
  WHERE ped.codigo_verificacion = codigo;
END;
$$ LANGUAGE plpgsql;

-- Permisos de ejecución explícitos.
-- El DROP FUNCTION de arriba elimina los privilegios previos; al crear la función,
-- Postgres otorga EXECUTE a PUBLIC por default. No dependemos de ese default: esta
-- función es SECURITY DEFINER y devuelve los datos de un documento SIN autenticación,
-- así que endurecemos quién puede invocarla y lo dejamos auditable.
-- La página /verificar/[codigo] la llama SIEMPRE con el admin client (service_role,
-- ver src/lib/supabase/admin.ts + src/app/verificar/[codigo]/page.tsx). Por eso los
-- roles anon/authenticated NO necesitan poder ejecutarla directamente con la anon key.
REVOKE EXECUTE ON FUNCTION public.verificar_documento(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.verificar_documento(text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.verificar_documento(text) TO postgres;


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 2. Políticas RLS huérfanas en `consultas`                                  │
-- └──────────────────────────────────────────────────────────────────────────┘
-- Estas dos políticas (aplicadas directo en Supabase, no en las migraciones)
-- daban acceso TOTAL (ALL) a cualquier asistente vinculado al tenant, salteando
-- check_permiso(). Como las políticas permisivas se combinan con OR, convivían
-- con las correctas (consultas_select/insert/update/delete) anulándolas de hecho:
-- un asistente con ver_historia_clinica=false igual leía toda la HC del médico.
-- Se DROPEAN. Las políticas correctas ya existen y quedan como únicas.
DROP POLICY IF EXISTS "medico_full_access" ON public.consultas;
DROP POLICY IF EXISTS "asistente_access"  ON public.consultas;


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 3. Defensa en profundidad — revocar DELETE de documentos                   │
-- └──────────────────────────────────────────────────────────────────────────┘
-- Regla de negocio 5: pedidos y certificados NO se borran nunca, solo se anulan
-- (estado='revocado'). El borrado físico ya se quitó de la app (sin handlers ni
-- botones). Se dropean las políticas de DELETE para que Postgres niegue el borrado
-- aunque alguien llegue por otra vía (service role, o un cliente que reintroduzca
-- la llamada). Sin política de DELETE, RLS deniega por defecto.
DROP POLICY IF EXISTS "pedidos_delete"      ON public.pedidos;
DROP POLICY IF EXISTS "certificados_delete" ON public.certificados;


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 4. log_turno_cambio() — fijar search_path                                  │
-- └──────────────────────────────────────────────────────────────────────────┘
-- Es SECURITY DEFINER y no fijaba search_path (riesgo de secuestro de esquema).
-- Se agrega SET search_path = public. Cuerpo idéntico al vigente.
CREATE OR REPLACE FUNCTION public.log_turno_cambio()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.turnos_audit_log (turno_id, usuario_id, accion, detalle)
    VALUES (NEW.id, NEW.agendado_por, 'creado', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.turnos_audit_log (turno_id, usuario_id, accion, detalle)
    VALUES (
      NEW.id,
      COALESCE(auth.uid(), NEW.agendado_por),
      CASE
        WHEN NEW.estado = 'cancelado'             THEN 'cancelado'
        WHEN OLD.fecha_inicio <> NEW.fecha_inicio THEN 'reprogramado'
        ELSE 'modificado'
      END,
      jsonb_build_object('antes', to_jsonb(OLD), 'despues', to_jsonb(NEW))
    );
  END IF;
  RETURN NEW;
END;
$$;
