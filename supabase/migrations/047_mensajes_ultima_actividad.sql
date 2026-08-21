-- ============================================================================
-- Migration 047 — `mensajes_internos.ultima_actividad_at` + trigger de bump
-- ============================================================================
--
-- ── QUÉ RESUELVE ────────────────────────────────────────────────────────────
--   La bandeja ordena los hilos por `created_at` de la RAÍZ, así que un hilo viejo
--   con una respuesta de hoy NO sube. Peor: con el tope de la bandeja, un hilo con
--   actividad reciente puede quedar directamente fuera de la lista.
--
--   Caso testigo medido sobre la base real: hay un hilo con **18,5 días** entre su
--   creación y su última respuesta. Hoy aparece SÉPTIMO; con esta migración tiene que
--   aparecer PRIMERO.
--
-- ── POR QUÉ UNA COLUMNA DENORMALIZADA Y NO UN ORDER BY AGREGADO ─────────────
--   Ordenar por `GREATEST(raiz.created_at, MAX(hijos.created_at))` es una agregación
--   correlacionada, y PostgREST no ordena por un agregado de un recurso embebido.
--   Resolverlo del lado de la base pediría una vista o una RPC —el proyecto no tiene
--   ni una RPC de dominio— y en cualquier caso obligaría a tocar TODAS las respuestas
--   de TODAS las raíces del tenant en cada carga de la bandeja.
--
--   La columna denormalizada convierte el orden en un `ORDER BY` de columna simple,
--   indexable. Es el mismo patrón que la migración **040** usó para
--   `turnos_audit_log.medico_id`: columna nueva + backfill + NOT NULL + índice, y un
--   trigger `SECURITY DEFINER` que la mantiene.
--
-- ── AUDITORÍA PREVIA (hecha sobre la base viva, antes de escribir esto) ─────
--   · 18 hilos raíz y 24 respuestas, en 2 consultorios (17 hilos uno, 1 el otro).
--   · Hilos cortos: promedio 1,3 respuestas por hilo, máximo 5.
--   · CERO empates de actividad → el cursor de la paginación puede ser SIMPLE.
--   · CERO respuestas con padre de otro consultorio.
--   · CERO hilos de tres niveles (ningún `parent_id` apunta a una respuesta).
--   · CERO respuestas con `created_at` anterior al de su raíz.
--   Las tres últimas hacen que las guardas de abajo sean preventivas, no correctivas.
--
-- ── QUÉ NO HACE, A PROPÓSITO ────────────────────────────────────────────────
--   · **NO tiene rama de DELETE.** Si se borra la última respuesta de un hilo, el hilo
--     CONSERVA su posición. Es deliberado: la UI solo permite borrar el hilo entero o
--     un mensaje suelto desde el modal abierto, y recalcular haría que un hilo SALTE de
--     lugar mientras el usuario lo está mirando. El costo de no recalcular es que un
--     hilo puede quedar "más arriba de lo que le corresponde"; el de recalcular sería
--     que la lista se reordene bajo el cursor del usuario. Se eligió el primero.
--   · No toca `mensajes_lecturas`, ni el contador global de no leídos, ni ninguna
--     política RLS.
--
-- Fecha: 2026-08-21
-- ============================================================================

BEGIN;

-- ── 1. La columna ───────────────────────────────────────────────────────────
-- Nullable POR AHORA: el NOT NULL va al final, después del backfill (paso 5).
--
-- ⚠ Se llama `ultima_actividad_at` y NO `updated_at` a propósito. En las otras 13
-- tablas del esquema `updated_at` significa "cuándo se modificó ESTA fila" y lo
-- mantiene `set_updated_at()`. Acá significa "cuándo pasó algo en el HILO": la fila de
-- la raíz no se modificó, se le agregó un hijo. Usar el nombre convencional invitaría
-- a colgarle el trigger genérico, que haría lo incorrecto.
--
-- El DEFAULT resuelve el alta de una raíz nueva sin lógica extra: nace con
-- `ultima_actividad_at = created_at`, o sea que un hilo sin respuestas se ordena por su
-- fecha de creación — exactamente el comportamiento actual.
ALTER TABLE public.mensajes_internos
  ADD COLUMN IF NOT EXISTS ultima_actividad_at TIMESTAMPTZ DEFAULT now();

COMMENT ON COLUMN public.mensajes_internos.ultima_actividad_at IS
  'Fecha del último mensaje del HILO. Solo es significativa en los mensajes RAÍZ '
  '(parent_id IS NULL), que son los que lista la bandeja: en una respuesta vale su '
  'propio created_at y NO SE LEE NUNCA. La mantiene el trigger '
  'mensajes_actividad_trigger, que la sube al insertar una respuesta. ⚠ No se '
  'recalcula al borrar (ver migración 047).';

-- ── 2. Índice sobre la columna de parentesco ────────────────────────────────
-- ⚠ VA ANTES DEL BACKFILL, y no es cosmético: el paso 3 hace un subselect
-- `max(created_at) WHERE parent_id = m.id` UNA VEZ POR RAÍZ. Sin índice son 18 seq
-- scans (trivial hoy, pero el orden correcto es el que escala).
--
-- Además cierra una carencia preexistente: `parent_id` es la columna por la que
-- filtran TRES consultas calientes del dominio —el paso 3 de `obtenerBandeja`
-- (`.in('parent_id', …)`), `obtenerHilo` (`.eq('parent_id', …)`) y el borrado de
-- respuestas de `eliminarMensaje`— y hasta hoy NINGUNO de los 3 índices de la tabla
-- la cubría (los existentes son sobre destinatario_id, remitente_id y
-- (medico_id, es_grupal, created_at)).
--
-- PARCIAL: las raíces nunca se buscan por esta columna, y son ~43% de las filas.
CREATE INDEX IF NOT EXISTS mensajes_parent_idx
  ON public.mensajes_internos (parent_id, created_at)
  WHERE parent_id IS NOT NULL;

-- ── 3. Backfill de las RAÍCES ───────────────────────────────────────────────
-- La mayor entre su propia creación y la de su respuesta más reciente.
--
-- ⚠ El GREATEST se usa AUNQUE HOY NO HAGA FALTA (auditado: 0 respuestas anteriores a
-- su raíz). Protege del caso de una respuesta con `created_at` más viejo que el de su
-- raíz —importación, backdating— que sin él ordenaría el hilo ANTES de haber existido.
--
-- ⚠ Sin este backfill la migración sería DESTRUCTIVA para el orden: el ADD COLUMN con
-- DEFAULT pone `now()` en todas las filas, así que los 18 hilos quedarían con la MISMA
-- actividad y el orden pasaría a ser arbitrario (el que decida el planner). No quedaría
-- el orden viejo: quedaría ninguno.
UPDATE public.mensajes_internos m
SET    ultima_actividad_at = GREATEST(
         m.created_at,
         COALESCE(
           (SELECT max(h.created_at)
              FROM public.mensajes_internos h
             WHERE h.parent_id = m.id),
           m.created_at
         )
       )
WHERE  m.parent_id IS NULL;

-- ── 4. Backfill de las RESPUESTAS ───────────────────────────────────────────
-- Su propio `created_at`. El valor no se lee nunca (la bandeja lista solo raíces),
-- pero tener un dato coherente en vez de `now()` evita que alguien que mire la tabla
-- por SQL saque conclusiones falsas.
UPDATE public.mensajes_internos
SET    ultima_actividad_at = created_at
WHERE  parent_id IS NOT NULL;

-- ── 5. NOT NULL ─────────────────────────────────────────────────────────────
-- ⚠ SI ESTE ALTER FALLA, no lo fuerces ni le agregues lógica condicional: significa
--   que quedaron filas con `ultima_actividad_at IS NULL`, o sea filas que los backfills
--   de los pasos 3 y 4 no alcanzaron. Con el DEFAULT `now()` eso es imposible, pero si
--   ocurriera hay que identificarlas y resolverlas ANTES:
--     SELECT id, parent_id, created_at FROM public.mensajes_internos
--     WHERE ultima_actividad_at IS NULL;
--   Que falle ruidosamente es preferible a dejar filas sin valor. Mismo criterio que la
--   migración 040 dejó escrito para el NOT NULL de `turnos_audit_log.medico_id`.
--
-- ⚠ Y acá el NOT NULL no es cosmético: en un `ORDER BY … DESC` Postgres pone los NULL
--   PRIMERO, así que una sola fila rota ENCABEZARÍA la bandeja.
ALTER TABLE public.mensajes_internos
  ALTER COLUMN ultima_actividad_at SET NOT NULL;

-- ── 6. La función del trigger ───────────────────────────────────────────────
--
-- ⚠⚠ POR QUÉ NECESITA `SECURITY DEFINER` — EL ANÁLISIS
--
--   La función hace un UPDATE sobre `mensajes_internos`, así que tiene que atravesar
--   `mensajes_marcar_leido`, la ÚNICA política de UPDATE que la tabla tiene:
--
--     USING      (NOT es_grupal AND destinatario_id = auth.uid())
--     WITH CHECK (NOT es_grupal AND destinatario_id = auth.uid())
--
--   Evaluada contra la fila que el trigger quiere tocar —la RAÍZ— da esto:
--
--     CASO 1 · Raíz GRUPAL, alguien responde
--              → `NOT es_grupal` es FALSE. BLOQUEADO.
--     CASO 2 · Raíz individual, responde el REMITENTE original
--              (yo inicié el hilo y ahora contesto)
--              → el `destinatario_id` de la raíz es EL OTRO, no yo. BLOQUEADO.
--     CASO 3 · Raíz individual, responde el DESTINATARIO
--              (me escribieron y contesto)
--              → la raíz me tiene a mí de destinatario. PASA.
--
--   O sea: la política bloquearía el UPDATE en DOS DE LOS TRES CASOS.
--
--   ⚠ Y lo haría EN SILENCIO. Un UPDATE cuyas filas no pasan el `USING` no da error:
--   simplemente afecta 0 filas. El trigger correría, no actualizaría nada, y el hilo no
--   subiría — sin ningún rastro en ningún lado. Es la lección de la migración 033
--   (la RLS filtra en silencio, no lanza) aplicada a un trigger.
--
--   `SECURITY DEFINER` hace que la función corra como su OWNER, que es también el owner
--   de la tabla, y el owner bypassa RLS. Es el mismo motivo por el que
--   `log_turno_cambio()` (migración 040) es SECURITY DEFINER: escribe en una tabla cuya
--   RLS no dejaría pasar al usuario que dispara el trigger.
--
-- ⚠⚠ ESTO DEPENDE DE QUE LA TABLA NO TENGA `FORCE ROW LEVEL SECURITY`
--
--   El owner bypassa RLS SOLO si la tabla no la tiene forzada. Verificado al escribir
--   esta migración: NINGUNA tabla del esquema declara `ALTER TABLE … FORCE ROW LEVEL
--   SECURITY` (barrido sobre las 46 migraciones anteriores y sobre schema.sql).
--
--   ⚠ Si alguna vez se activara sobre `mensajes_internos` —cosa que un endurecimiento
--   futuro podría querer—, ESTE TRIGGER DEJARÍA DE ACTUALIZAR LA RAÍZ, EN SILENCIO, y
--   el orden de la bandeja se congelaría sin que nadie lo note. No hay forma de que la
--   base avise. Si se activa, hay que revisar este trigger.
--
-- ⚠ RECURSIÓN: NO LA HAY, y la garantía es una sola palabra
--
--   El trigger es `AFTER INSERT` y ejecuta un `UPDATE`. Un UPDATE no dispara un trigger
--   de INSERT, así que la función NO PUEDE llamarse a sí misma. No hace falta
--   `pg_trigger_depth()`.
--
--   ⚠ AGREGARLE `OR UPDATE` AL TRIGGER INTRODUCIRÍA RECURSIÓN INFINITA. La red de
--   seguridad es la tercera condición del WHERE (`ultima_actividad_at < NEW.created_at`):
--   en un segundo pase la actividad ya sería igual, no habría filas que actualizar y la
--   cadena cortaría en la primera iteración. Pero es una red, no un permiso: no agregar
--   el evento.
--
-- `SET search_path = public` por el criterio que fijó la migración 025 para las
-- funciones SECURITY DEFINER (riesgo de secuestro de esquema).
CREATE OR REPLACE FUNCTION public.bump_actividad_hilo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Las TRES condiciones del WHERE, y las tres importan:
  --
  --   1. `id = NEW.parent_id`
  --      La raíz del hilo.
  --
  --   2. `medico_id = NEW.medico_id`  ⚠ LA GUARDA DE TENANT
  --      La FK de `parent_id` garantiza que el padre EXISTA, pero NO valida que sea del
  --      mismo consultorio. Sin esta condición, una respuesta cuyo `parent_id` apunte a
  --      un mensaje de OTRO tenant subiría el hilo de ese otro consultorio al tope de su
  --      bandeja. La app ya lo valida (`enviarMensaje` exige que el padre exista, sea del
  --      mismo tenant y sea raíz), pero el trigger corre igual —también para inserts que
  --      entren por PostgREST directo—, que es justamente para lo que un trigger existe.
  --
  --   3. `ultima_actividad_at < NEW.created_at`  ⚠ MONOTONÍA
  --      Un insert con fecha vieja (importación, backdating) no puede BAJAR la actividad
  --      de un hilo. Y es la red anti-recursión descrita arriba.
  --
  -- ⚠ Si ninguna fila coincide, NO PASA NADA y el INSERT sigue adelante. Es deliberado:
  -- el trigger no debe abortar el envío de un mensaje válido por una anomalía de
  -- parentesco. Falla silenciosa POR DISEÑO, al revés que el NOT NULL del paso 5.
  UPDATE public.mensajes_internos
  SET    ultima_actividad_at = NEW.created_at
  WHERE  id                  = NEW.parent_id
    AND  medico_id           = NEW.medico_id
    AND  ultima_actividad_at < NEW.created_at;

  -- En un trigger AFTER el retorno se ignora, pero por corrección devuelve NEW.
  RETURN NEW;
END;
$$;

-- ── 7. El trigger ───────────────────────────────────────────────────────────
-- ⚠ La condición `WHEN (NEW.parent_id IS NOT NULL)` va EN EL TRIGGER y no dentro de la
-- función: con un `IF` adentro, Postgres invocaría la función igual para CADA raíz nueva
-- (una llamada a plpgsql por hilo creado) y recién ahí saldría sin hacer nada. Con el
-- WHEN, ni siquiera la invoca.
--
-- ⚠ `AFTER INSERT` y solo INSERT. La dirección se declara explícitamente, como hizo la
-- 040 al recrear `turno_audit_trigger` ("cierra la discrepancia histórica BEFORE/AFTER").
-- No hay `OR UPDATE` ni `OR DELETE`, y las dos ausencias son deliberadas: la de UPDATE
-- por la recursión, la de DELETE por la decisión de producto de la cabecera.
DROP TRIGGER IF EXISTS mensajes_actividad_trigger ON public.mensajes_internos;
CREATE TRIGGER mensajes_actividad_trigger
  AFTER INSERT ON public.mensajes_internos
  FOR EACH ROW
  WHEN (NEW.parent_id IS NOT NULL)
  EXECUTE FUNCTION public.bump_actividad_hilo();

-- ── 8. Índice para el orden nuevo ───────────────────────────────────────────
-- PARCIAL sobre las raíces: la query de la bandeja SIEMPRE filtra por
-- `parent_id IS NULL` —es su definición: lista hilos—, y el predicado de la query
-- implica literalmente el del índice, que es el caso más fácil de reconocer para el
-- planner.
--
-- El orden de las columnas sigue el patrón del repo (`mensajes_medico_grupal_idx`,
-- `idx_turnos_medico`): el TENANT primero, que es el filtro de igualdad, y la columna de
-- orden después. Así el índice sirve para el WHERE y para el ORDER BY de una sola
-- pasada, y la paginación por keyset (`ultima_actividad_at < cursor`) lo recorre directo.
--
-- `DESC` explícito: la bandeja ordena descendente. Postgres puede recorrer un índice
-- ascendente hacia atrás, pero declararlo evita depender de esa optimización.
CREATE INDEX IF NOT EXISTS mensajes_bandeja_idx
  ON public.mensajes_internos (medico_id, ultima_actividad_at DESC)
  WHERE parent_id IS NULL;

COMMIT;


-- ============================================================================
-- VERIFICACIÓN (correr DESPUÉS del COMMIT)
-- ============================================================================
--
-- 1) La columna existe, es NOT NULL y tiene su DEFAULT.
--    ESPERADO: 1 fila → timestamptz / NO / now().
--
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'mensajes_internos'
--    AND column_name = 'ultima_actividad_at';
--
--
-- 2) NINGUNA fila quedó sin valor. ESPERADO: 0.
--
-- SELECT count(*) AS sin_valor
--   FROM public.mensajes_internos
--  WHERE ultima_actividad_at IS NULL;
--
--
-- 3) ⚠ EL BACKFILL ES CORRECTO — la comprobación que importa.
--    Compara lo que quedó en la columna contra lo que debería ser.
--    ESPERADO: 0 filas. Cualquier fila acá es un backfill mal hecho.
--
-- SELECT m.id, m.asunto, m.ultima_actividad_at AS quedo,
--        GREATEST(m.created_at,
--                 COALESCE((SELECT max(h.created_at) FROM public.mensajes_internos h
--                            WHERE h.parent_id = m.id), m.created_at)) AS deberia_ser
--   FROM public.mensajes_internos m
--  WHERE m.parent_id IS NULL
--    AND m.ultima_actividad_at IS DISTINCT FROM
--        GREATEST(m.created_at,
--                 COALESCE((SELECT max(h.created_at) FROM public.mensajes_internos h
--                            WHERE h.parent_id = m.id), m.created_at));
--
--
-- 4) ⚠ EL CASO TESTIGO — el hilo con 18,5 días de diferencia.
--    ESPERADO: ese hilo PRIMERO en `orden_nuevo`, y con un `orden_viejo` de 7.
--    Es la prueba de que el cambio hace lo que promete.
--
-- SELECT asunto,
--        created_at, ultima_actividad_at,
--        round(EXTRACT(epoch FROM (ultima_actividad_at - created_at)) / 86400, 1) AS dias,
--        row_number() OVER (ORDER BY ultima_actividad_at DESC) AS orden_nuevo,
--        row_number() OVER (ORDER BY created_at          DESC) AS orden_viejo
--   FROM public.mensajes_internos
--  WHERE parent_id IS NULL
--  ORDER BY ultima_actividad_at DESC;
--
--
-- 5) El trigger y su función existen, con los atributos correctos.
--    ESPERADO: trigger con tgenabled='O' y la condición WHEN; función con
--    prosecdef=true y proconfig={search_path=public}.
--
-- SELECT t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS definicion
--   FROM pg_trigger t
--  WHERE t.tgrelid = 'public.mensajes_internos'::regclass
--    AND NOT t.tgisinternal;
--
-- SELECT p.proname, p.prosecdef AS security_definer, p.proconfig
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public' AND p.proname = 'bump_actividad_hilo';
--
--
-- 6) Los dos índices nuevos. ESPERADO: 2 filas, las dos con su cláusula WHERE.
--
-- SELECT indexname, indexdef
--   FROM pg_indexes
--  WHERE schemaname = 'public' AND tablename = 'mensajes_internos'
--    AND indexname IN ('mensajes_parent_idx', 'mensajes_bandeja_idx');
--
--
-- 7) LA PRUEBA FUNCIONAL DEL TRIGGER (destructiva — solo en un entorno de prueba, o
--    envuelta en BEGIN … ROLLBACK).
--    ESPERADO: `ultima_actividad_at` de la raíz sube al `created_at` de la respuesta.
--
-- BEGIN;
--   SELECT id, ultima_actividad_at FROM public.mensajes_internos
--    WHERE parent_id IS NULL ORDER BY ultima_actividad_at ASC LIMIT 1;
--   -- (pegar ese id y su medico_id/remitente_id abajo)
--   INSERT INTO public.mensajes_internos
--     (medico_id, remitente_id, destinatario_id, es_grupal, asunto, cuerpo, parent_id)
--   VALUES ('<medico_id>', '<remitente_id>', '<destinatario_id>', false,
--           'prueba trigger', 'x', '<id-de-la-raiz>');
--   SELECT id, ultima_actividad_at FROM public.mensajes_internos WHERE id = '<id-de-la-raiz>';
-- ROLLBACK;   -- ⚠ ROLLBACK, no COMMIT
--
-- ============================================================================


-- ============================================================================
-- REVERSIBLE — cómo volver atrás
-- ============================================================================
--
-- ✅ La reversión es TOTAL y sin pérdida de datos de mensajes: lo único que se pierde es
-- la columna DERIVADA, que se recalcula entera con el backfill del paso 3 si se
-- reaplicara. Ningún mensaje se toca.
--
-- ⚠ El orden importa: primero el trigger (si no, la función queda en uso), después la
-- función, después los índices, y la columna al final.
--
-- ⚠ `mensajes_parent_idx` se dropea acá porque esta migración lo creó. Si para entonces
-- alguna otra cosa dependiera de él (era una carencia preexistente que esta migración
-- aprovechó para cerrar — ver paso 2), conviene CONSERVARLO y borrar solo el resto.
--
-- BEGIN;
--   DROP TRIGGER IF EXISTS mensajes_actividad_trigger ON public.mensajes_internos;
--   DROP FUNCTION IF EXISTS public.bump_actividad_hilo();
--   DROP INDEX IF EXISTS public.mensajes_bandeja_idx;
--   DROP INDEX IF EXISTS public.mensajes_parent_idx;
--   ALTER TABLE public.mensajes_internos DROP COLUMN IF EXISTS ultima_actividad_at;
-- COMMIT;
--
-- ⚠ Y del lado del CÓDIGO: revertir esta migración exige revertir también el commit de
-- `obtenerBandeja` (que ordena por la columna nueva) y el del componente. Con la columna
-- borrada y la action pidiéndola, la bandeja devolvería error.
--
-- ============================================================================
