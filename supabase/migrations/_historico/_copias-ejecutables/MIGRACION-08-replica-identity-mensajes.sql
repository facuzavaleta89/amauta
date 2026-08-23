-- Copia ejecutable de supabase/migrations/032_replica_identity_full_mensajes.sql — pegar en el SQL Editor de Supabase y correr UNA sola vez.
--
-- QUÉ HACE: pone `public.mensajes_internos` en REPLICA IDENTITY FULL para que el
-- Realtime entregue los eventos al canal de la campanita, que filtra por
-- `medico_id=eq.<tenant>` — una columna que NO es la PK. Con REPLICA IDENTITY
-- DEFAULT (el estado actual, `relreplident = 'd'`) el evento solo garantiza la PK,
-- así que Realtime no puede evaluar ese filtro y descarta el evento: el canal llega
-- a SUBSCRIBED pero no llega nada. Es la compañera de la migración 023, que agregó
-- la tabla a la publicación `supabase_realtime` (necesario, pero no suficiente).
--
-- SEGURO: no toca datos, ni RLS, ni el esquema de la tabla. Idempotente (si ya está
-- en FULL no hace nada). Reversible con:
--     ALTER TABLE public.mensajes_internos REPLICA IDENTITY DEFAULT;

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


-- ── VERIFICACIÓN — correr esto después y confirmar que devuelve 'f' ─────────
SELECT relname, relreplident
FROM pg_class
WHERE relname = 'mensajes_internos';
-- Esperado: relreplident = 'f'   ('d' = DEFAULT, el estado anterior)
