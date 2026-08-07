-- ============================================================================
-- Migration 034 — solicitudes_asistente: UNIQUE total → índice único PARCIAL
-- ============================================================================
-- PROBLEMA QUE RESUELVE:
--   Un asistente que fue DESVINCULADO (o RECHAZADO) no puede volver a enviarle una
--   solicitud de vinculación AL MISMO MÉDICO: la app le responde
--   "Ya enviaste una solicitud a este médico" y queda sin forma de reingresar.
--
--   La causa es la constraint que la 010 creó junto con la tabla:
--
--       UNIQUE(solicitante_id, medico_id)        -- 010_multitenancy.sql:70
--
--   No contempla `estado` y no es parcial, así que un par (asistente, médico) puede
--   tener EXACTAMENTE UNA fila EN TODA LA HISTORIA. Como la fila vieja sobrevive a
--   la desvinculación —`desvincularAsistente()` solo pone `profiles.medico_id = NULL`
--   y no toca esta tabla—, el par queda con su cupo ocupado para siempre por una
--   solicitud en 'aprobada' (o 'rechazada'), y el segundo INSERT muere con 23505.
--
--   ⚠ LA CONSTRAINT NUNCA IMPLEMENTÓ LO QUE DECÍA IMPLEMENTAR. El comentario que la
--   010 escribió tres líneas más arriba (`010_multitenancy.sql:59`) dice:
--
--       "Constraint UNIQUE garantiza una sola solicitud activa por par."
--
--   La intención declarada era "una sola ACTIVA" —o sea, una sola PENDIENTE—; lo
--   implementado fue "una sola en la historia". Esta migración cierra esa brecha:
--   no cambia la regla de negocio, la hace cumplir como estaba escrita.
--
-- QUÉ HACE:
--   1. Dropea la constraint total `solicitudes_asistente_solicitante_id_medico_id_key`
--      (nombre real leído de pg_constraint contra la base; es el que Postgres generó).
--   2. Crea un ÍNDICE ÚNICO PARCIAL sobre el mismo par, restringido a las pendientes.
--
--   Resultado: sigue habiendo como máximo UNA solicitud pendiente por par —no se puede
--   spamear al médico— pero el historial ('aprobada' / 'rechazada') deja de bloquear
--   una solicitud nueva.
--
-- ⚠ POR QUÉ UN ÍNDICE Y NO UNA CONSTRAINT — no es una preferencia de estilo:
--   Postgres NO admite constraints UNIQUE parciales (no existe
--   `ADD CONSTRAINT ... UNIQUE (...) WHERE ...`). La cláusula WHERE solo se puede
--   expresar en un `CREATE UNIQUE INDEX`. Por eso el swap es constraint → índice, y
--   por eso el objeto nuevo aparece en `pg_indexes` / `pg_index` y NO en
--   `pg_constraint`. A efectos de integridad son equivalentes: el índice único
--   rechaza el duplicado con el mismo SQLSTATE 23505.
--
-- SEGURO POR CONSTRUCCIÓN — sin auditoría previa de datos:
--   Se pasa de una regla MÁS ESTRICTA a una MÁS LAXA, así que es imposible que los
--   datos existentes violen la nueva. Todo par que hoy cumple "una sola fila en la
--   historia" cumple trivialmente "una sola pendiente". Es la situación INVERSA a la
--   de las UNIQUE de DNI/matrícula previstas en PENDIENTES.md, que sí exigen auditar
--   duplicados antes de aplicar. (Igual se verificó contra la base: 0 pares duplicados.)
--
-- NO CAMBIA NADA DEL CÓDIGO — y esto es intencional:
--   · `enviarSolicitud()` sigue insertando directo y traduciendo el 23505. El código
--     de error no cambia, así que el mapeo sigue funcionando sin tocarlo. De hecho su
--     mensaje —"Ya enviaste una solicitud a este médico"— pasa a ser VERDADERO: a
--     partir de acá solo puede chocar contra una solicitud realmente pendiente.
--   · `desvincularAsistente()` no se toca: la fila vieja se conserva a propósito, como
--     rastro de que el vínculo existió.
--   · No se agrega ningún estado nuevo al CHECK (sigue 'pendiente'/'aprobada'/'rechazada').
--   · Ningún `.upsert()` / `ON CONFLICT ON CONSTRAINT` referencia el nombre viejo
--     (verificado por grep: las 6 referencias a la tabla en src/ son insert/select/update
--     planos), así que dropear el nombre no rompe ninguna consulta.
--
-- ALCANCE: arregla los DOS caminos que necesitaban una segunda solicitud del mismo par
--   — tras desvinculación (fila en 'aprobada') y tras rechazo (fila en 'rechazada', donde
--   la UI ya invitaba a reintentar con el botón "Buscar otro médico").
--
-- Envuelto en transacción: entre el DROP y el CREATE la tabla queda sin la garantía de
--   unicidad; BEGIN/COMMIT lo hace atómico y evita quedarse sin ninguna de las dos si
--   el CREATE fallara.
--   ⚠ Por eso el índice se crea SIN `CONCURRENTLY`: esa variante no puede correr dentro
--   de un bloque de transacción. El lock que toma el CREATE INDEX común es irrelevante
--   acá (tabla chiquísima, un puñado de filas).
-- Reversible: ver el bloque comentado al final (con su condición).
-- ============================================================================

BEGIN;

-- 1. Fuera la constraint total (arrastra consigo su índice único implícito)
ALTER TABLE public.solicitudes_asistente
  DROP CONSTRAINT solicitudes_asistente_solicitante_id_medico_id_key;

-- 2. La misma unicidad, pero solo entre las PENDIENTES
CREATE UNIQUE INDEX solicitudes_asistente_solicitante_medico_pendiente_key
  ON public.solicitudes_asistente (solicitante_id, medico_id)
  WHERE estado = 'pendiente';

COMMIT;

-- ── VERIFICACIÓN (correr por separado después del COMMIT) ────────────────────
-- SELECT conname, contype, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid = 'public.solicitudes_asistente'::regclass ORDER BY contype, conname;
-- Esperado: PK + 2 FK + el CHECK de estado. NINGUNA de tipo 'u'.
--
-- SELECT i.relname, ix.indisunique, pg_get_expr(ix.indpred, ix.indrelid) AS predicado
-- FROM pg_index ix JOIN pg_class i ON i.oid = ix.indexrelid
-- WHERE ix.indrelid = 'public.solicitudes_asistente'::regclass AND ix.indisunique;
-- Esperado: 2 filas — el *_pkey (predicado NULL) y
-- solicitudes_asistente_solicitante_medico_pendiente_key con (estado = 'pendiente'::text).
--
-- La prueba REAL es funcional y necesita DOS sesiones (médico + asistente): que el
-- asistente desvinculado pueda reenviarle la solicitud AL MISMO médico y que el médico
-- la vea en la campanita. Ver el archivo suelto MIGRACION-10-* para los pasos.

-- ── REVERSIBLE ──────────────────────────────────────────────────────────────
-- ⚠ Solo es aplicable MIENTRAS no exista ningún par (solicitante_id, medico_id)
--    repetido — o sea, mientras nadie haya usado todavía la funcionalidad que esta
--    migración destraba. Chequear ANTES (tiene que dar 0 filas):
--      SELECT solicitante_id, medico_id, count(*) FROM public.solicitudes_asistente
--      GROUP BY 1,2 HAVING count(*) > 1;
--    Si devuelve filas, revertir es IMPOSIBLE sin borrar solicitudes: no revertir.
-- BEGIN;
--   DROP INDEX IF EXISTS public.solicitudes_asistente_solicitante_medico_pendiente_key;
--   ALTER TABLE public.solicitudes_asistente
--     ADD CONSTRAINT solicitudes_asistente_solicitante_id_medico_id_key
--     UNIQUE (solicitante_id, medico_id);
-- COMMIT;
