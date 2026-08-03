-- ============================================================================
-- Migration 032 — REPLICA IDENTITY FULL en public.mensajes_internos
-- ============================================================================
-- COMPAÑERA DE LA 023. La 023 agregó la tabla a la publicación `supabase_realtime`
-- y dio por terminado el trabajo con esta línea, que resultó EQUIVOCADA:
--
--     "Solo se necesitan eventos INSERT, así que alcanza con agregarla a la
--      publicación (no hace falta tocar REPLICA IDENTITY)."
--
-- No alcanzaba. Estar en la publicación es condición necesaria pero no suficiente
-- cuando el cliente se suscribe CON UN FILTRO POR COLUMNA.
--
-- PROBLEMA QUE RESUELVE:
--   El canal de la campanita (src/components/layout/notificaciones-bell.tsx) se
--   suscribe a los INSERT de `mensajes_internos` filtrando por tenant:
--
--       filter: `medico_id=eq.${tenantId}`
--
--   `medico_id` NO es la PRIMARY KEY de la tabla (la PK es `id`). Con
--   REPLICA IDENTITY DEFAULT —el estado actual, `relreplident = 'd'`— la identidad
--   de la fila que viaja en la replicación lógica se limita a la PK, así que
--   Realtime no tiene con qué evaluar un filtro sobre `medico_id` y DESCARTA el
--   evento en vez de entregarlo.
--
--   Síntoma exacto que esto explica, medido en vivo con la instrumentación
--   `[RT avisos]`: el canal llega a **SUBSCRIBED** (la suscripción funciona, el
--   transporte funciona) pero **nunca llega ningún evento**. El badge de mensajes
--   solo se actualizaba tras un F5, que no usa Realtime sino el render del servidor.
--
--   Diagnóstico confirmado contra la base antes de escribir esto:
--     · `mensajes_internos` SÍ está en la publicación   → pg_publication_tables ✓
--     · `relreplident = 'd'` (DEFAULT)                  → pg_class ✓
--
-- QUÉ HACE:
--   Pone la tabla en REPLICA IDENTITY FULL, para que el evento de replicación lleve
--   la fila completa —`medico_id` incluido— y Realtime pueda evaluar el filtro y
--   entregar el evento a los suscriptores del tenant.
--
-- COSTO ACEPTADO:
--   FULL hace que los UPDATE y DELETE escriban la fila vieja completa en el WAL (los
--   INSERT ya la escribían entera). En esta tabla el volumen es bajo —mensajería
--   interna de un consultorio unipersonal— y las escrituras son casi siempre INSERT,
--   así que el costo es despreciable frente a tener la funcionalidad rota.
--
-- IDEMPOTENTE:
--   El guard evita reaplicar si la tabla ya está en FULL. El `ALTER` de por sí
--   tampoco fallaría (aplicar FULL sobre una tabla ya FULL es un no-op), pero se
--   deja el DO $$ para seguir el patrón de la 023 y dejar la intención auditable.
--
-- NO TOCA: ni la publicación (eso lo hizo la 023), ni RLS, ni datos, ni el esquema
--   de la tabla. Es reversible con `ALTER TABLE … REPLICA IDENTITY DEFAULT;`.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.mensajes_internos'::regclass
      AND relreplident = 'f'
  ) THEN
    ALTER TABLE public.mensajes_internos REPLICA IDENTITY FULL;
  END IF;
END $$;


-- ── VERIFICACIÓN (correr después de aplicar) ────────────────────────────────
-- Verificar: SELECT relname, relreplident FROM pg_class WHERE relname = 'mensajes_internos';  -- debe devolver 'f'
--
-- Valores posibles de relreplident: 'd' = DEFAULT (solo PK) · 'f' = FULL (fila
-- completa) · 'n' = NOTHING · 'i' = USING INDEX. Antes de esta migración devolvía
-- 'd'; después tiene que devolver 'f'.
--
-- La prueba REAL es funcional y necesita DOS sesiones (médico + asistente): que un
-- mensaje nuevo suba el badge de la campanita SIN recargar. En la consola del
-- receptor, filtrando por `[RT avisos]`, tiene que aparecer
-- `evento mensajes_internos recibido` — que hasta ahora nunca aparecía.
