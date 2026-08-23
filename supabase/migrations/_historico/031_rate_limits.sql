-- ============================================================================
-- Migration 031 — Rate limiting efectivo sobre Postgres
-- ============================================================================
-- PROBLEMA QUE RESUELVE:
--   El rate limiter actual (src/lib/rate-limit.ts) guarda los contadores en un `Map`
--   en la MEMORIA DEL PROCESO. En Vercel (serverless) cada request puede caer en una
--   instancia distinta, y las lambdas se reciclan, así que los contadores NO se
--   comparten ni persisten. En la práctica HOY NO HAY protección real contra fuerza
--   bruta en el login/registro: un atacante distribuye los intentos y el límite nunca
--   se alcanza. Esta migración mueve el conteo a una tabla compartida en la base.
--
-- QUÉ CREA:
--   1. Tabla `public.rate_limits` — fixed-window counter (una fila por key+ventana).
--   2. RLS habilitado SIN políticas (deny-by-default; el acceso es solo vía la función).
--   3. Función `public.check_rate_limit(...)` — cuenta de forma atómica y decide.
--   4. Permisos: EXECUTE solo para service_role/postgres (el módulo la llama con el
--      admin client, porque el login ocurre SIN sesión).
--
-- LIMITACIÓN ACEPTADA:
--   Postgres NO escala a ataques de volumen muy alto (miles de req/s): la base se
--   satura antes de bloquear. Para un consultorio unipersonal no aplica. La interfaz
--   del módulo queda aislada, así que migrar a Redis en el futuro sería cambiar la
--   implementación de rate-limit.ts SIN tocar a los ~25 llamadores.
--
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS, CREATE OR REPLACE FUNCTION.
-- ============================================================================


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 1. Tabla `rate_limits` (fixed-window counter)                              │
-- └──────────────────────────────────────────────────────────────────────────┘
-- Una fila por combinación (key, window_start), NO una fila por request: la tabla no
-- crece con el tráfico, solo con la cantidad de keys activas por ventana.
--   · key          → identificador del contador (ej. 'login:<ip>:<email>', 'verificar:<ip>').
--   · window_start → inicio de la ventana (floor del epoch al tamaño de ventana); agrupa
--                    todas las requests de la misma ventana en la misma fila.
--   · count        → cantidad de hits en esa ventana.
-- La PK (key, window_start) es lo que habilita el UPSERT atómico de la función.
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key          TEXT        NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count        INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

-- Índice sobre window_start para que el DELETE de limpieza (en el cron de
-- recordatorios) sea barato: borra ventanas viejas por rango de tiempo.
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON public.rate_limits(window_start);


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 2. RLS habilitado SIN políticas (deny-by-default)                          │
-- └──────────────────────────────────────────────────────────────────────────┘
-- ⚠ La AUSENCIA de políticas es DELIBERADA (mismo criterio que el bucket `documentos`
--   en la 027, que no tiene política de DELETE a propósito). Con RLS activado y sin
--   ninguna política, Postgres DENIEGA por defecto todo acceso de `anon` y
--   `authenticated` vía PostgREST. Así ningún cliente puede:
--     · leer las keys/contadores de otros (privacidad de la tabla de control),
--     · ni resetear su propio contador borrando/actualizando su fila (evadir el límite).
--   El único acceso es a través de la función check_rate_limit (SECURITY DEFINER), que
--   corre con privilegios elevados y bypasea RLS. El admin client (service_role) también
--   bypasea RLS, pero el camino previsto es SIEMPRE la función, por su atomicidad.
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 3. Función `check_rate_limit` — conteo atómico + decisión                  │
-- └──────────────────────────────────────────────────────────────────────────┘
-- Devuelve (allowed, retry_after_secs). SECURITY DEFINER + search_path fijo (evita
-- secuestro de esquema, igual que verificar_documento en la 025).
--
-- ATOMICIDAD: el conteo es UN SOLO statement — INSERT ... ON CONFLICT DO UPDATE ...
-- RETURNING. Esto toma el row-lock de la fila (key, window_start) y evita el TOCTOU
-- del patrón "SELECT count(); si < limit INSERT", donde dos requests concurrentes
-- leen ambos un valor bajo el límite y ambos pasan. Con el UPSERT, el incremento y la
-- lectura del nuevo valor ocurren bajo el mismo lock: el conteo es exacto.
--
-- VENTANA: window_start = floor(epoch_actual / p_window_secs) * p_window_secs. Todas
-- las requests de la misma ventana calculan el mismo window_start → caen en la misma
-- fila. (Fixed window: puede haber hasta ~2x el límite en el borde entre ventanas;
-- aceptado por diseño para esta app.)
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key         TEXT,
  p_limit       INT,
  p_window_secs INT
)
RETURNS TABLE(allowed BOOLEAN, retry_after_secs INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_secs) * p_window_secs
  );
  v_count INT;
BEGIN
  -- Incremento atómico: crea la fila con count=1 o suma 1 a la existente, y devuelve
  -- el valor resultante bajo el mismo lock.
  INSERT INTO public.rate_limits AS rl (key, window_start, count)
  VALUES (p_key, v_window_start, 1)
  ON CONFLICT (key, window_start)
    DO UPDATE SET count = rl.count + 1
  RETURNING rl.count INTO v_count;

  IF v_count > p_limit THEN
    -- Bloqueado: segundos que faltan hasta que termine la ventana actual.
    RETURN QUERY SELECT
      FALSE,
      GREATEST(
        CEIL(extract(epoch FROM (v_window_start + make_interval(secs => p_window_secs)) - now()))::INT,
        0
      );
  ELSE
    RETURN QUERY SELECT TRUE, 0;
  END IF;
END;
$$;


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 4. Permisos de ejecución                                                   │
-- └──────────────────────────────────────────────────────────────────────────┘
-- La función ESCRIBE en una tabla de control de acceso (incrementa contadores). Solo
-- el SERVIDOR debe poder invocarla: el módulo rate-limit.ts la llama con el admin
-- client (service_role), porque el login ocurre SIN sesión y no hay un usuario cuyo
-- cliente usar. Se revoca de PUBLIC y se otorga solo a service_role/postgres — mismo
-- patrón que verificar_documento en la migración 025. Sin esto, cualquier usuario
-- autenticado podría llamar la RPC y, por ejemplo, inflar contadores de terceros.
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INT, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INT, INT) TO service_role;
GRANT  EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INT, INT) TO postgres;
