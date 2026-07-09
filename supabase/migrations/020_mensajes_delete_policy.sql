-- ============================================================
-- 020_mensajes_delete_policy.sql
-- Permite borrar mensajes de la tabla mensajes_internos.
--
-- Regla de negocio:
--   1. El remitente del mensaje puede borrar su propio mensaje.
--   2. El médico vinculado a la cuenta puede borrar cualquier mensaje de su tenant.
-- ============================================================

DROP POLICY IF EXISTS "mensajes_borrar" ON public.mensajes_internos;

CREATE POLICY "mensajes_borrar" ON public.mensajes_internos
  FOR DELETE USING (
    -- El remitente puede borrar su propio mensaje
    remitente_id = auth.uid()

    -- El médico puede borrar cualquier mensaje de su consultorio/tenant
    OR medico_id = auth.uid()
  );
