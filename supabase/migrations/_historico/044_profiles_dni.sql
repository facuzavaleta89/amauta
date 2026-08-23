-- ============================================================================
-- Migration 044 — DNI del profesional en `public.profiles`
-- ============================================================================
--
-- ── QUÉ AGREGA ──────────────────────────────────────────────────────────────
--   Columna  `public.profiles.dni TEXT` (NULLABLE)
--   Constraint `profiles_dni_key UNIQUE (dni)`
--
--   Hasta ahora `profiles` no tenía ningún documento de identidad del usuario. La
--   identidad profesional que guardaba era la del ejercicio —`titulo`, `matriculas`
--   (JSONB), `firma_url`, `logo_url`—, no la civil. Verificado antes de escribir esto:
--   la columna NO existe en el `CREATE TABLE` de `schema.sql`, no la declara ningún tipo
--   de `src/types/roles.ts`, no aparece en ninguna de las 43 migraciones previas y el
--   formulario de perfil no la pide.
--
--   ⚠ NO CONFUNDIR con los tres `dni` que ya existen, que son TODOS del PACIENTE:
--   `pacientes.dni`, el snapshot `paciente_dni` de `pedidos`/`certificados`, y el
--   `paciente_dni_masked` que devuelve `verificar_documento()`. Este es el del
--   PROFESIONAL que usa la app.
--
-- ── POR QUÉ NULLABLE ────────────────────────────────────────────────────────
--   Hay 23 perfiles ya creados (10 médicos y 13 asistentes) y NINGUNO tiene el dato:
--   nunca se pidió. Una columna `NOT NULL` sin DEFAULT haría fallar el ALTER en el
--   acto, y un DEFAULT de relleno sería peor —inventaría un documento de identidad—,
--   así que la columna nace nullable y se completa perfil por perfil.
--
--   Esto se apoya en una garantía de Postgres que conviene dejar escrita, porque es lo
--   que hace que la combinación nullable + UNIQUE funcione: en un índice único, **los
--   NULL no se consideran iguales entre sí**. Los 23 perfiles sin DNI conviven sin
--   chocar, por más que la columna sea UNIQUE. (Es el comportamiento por defecto,
--   `NULLS DISTINCT`; no hace falta declararlo.)
--
-- ── POR QUÉ ES OPCIONAL A NIVEL PRODUCTO (no solo "por ahora") ──────────────
--   No es una laxitud temporal que haya que endurecer más adelante: hoy el dato
--   simplemente no hace falta. La ley argentina NO exige el DNI del profesional ni en
--   la historia clínica ni en los certificados médicos — el identificador legal del
--   ejercicio profesional es la MATRÍCULA, que la app ya guarda en `profiles.matriculas`
--   y estampa en los PDF vía `emisor_snapshot` (regla de negocio 11).
--
--   El DNI recién pasaría a ser necesario si la app llegara a emitir RECETA ELECTRÓNICA
--   formal (hoy bloqueada por la certificación ANMAT, ver regla de negocio 7) o a
--   FACTURAR. Si eso ocurre, la conversación es "¿lo volvemos obligatorio?", y esa sí
--   sería otra migración.
--
-- ── ⚠ POR QUÉ EL UNIQUE ES GLOBAL Y NO POR TENANT ───────────────────────────
--   Es lo OPUESTO a lo que hizo la migración 043 con `pacientes.dni` —que pasó de
--   `UNIQUE (dni)` a `UNIQUE (creado_por, dni)`— y quiero dejarlo explicado acá para
--   que la asimetría no se lea después como una inconsistencia, ni lleve a "corregir"
--   esta constraint por simetría con aquélla.
--
--   Las dos tablas responden a preguntas distintas:
--
--     · `pacientes` es MULTI-TENANT: cada fila pertenece a un médico (`creado_por`) y
--       la misma persona puede ser paciente de DOS consultorios distintos, legítimamente.
--       Ahí la unicidad global era un bug: le impedía al segundo médico cargar a alguien
--       que otro ya tenía. Por eso la 043 la bajó a "único DENTRO de cada tenant".
--
--     · `profiles` NO pertenece a ningún tenant: es la tabla de USUARIOS del sistema,
--       la extensión de `auth.users`. Una misma persona no debería tener dos cuentas
--       profesionales en la instalación, así que acá la unicidad global es exactamente
--       lo que se quiere: el DNI identifica a la persona, y la persona es una sola.
--
--   Dicho corto: en `pacientes` el DNI describe a un TERCERO registrado por un tenant;
--   en `profiles` identifica al DUEÑO de la cuenta. Distinto sujeto, distinto alcance.
--
-- ── QUIÉN LO CARGA ──────────────────────────────────────────────────────────
--   TODOS los roles: médicos y asistentes. No es un campo de "identidad de ejercicio"
--   como `matriculas`, `titulo` o `firma_url` —que en la UI están reservados al médico—,
--   sino un dato de la persona, y un asistente también es personal identificable del
--   consultorio. La columna no distingue rol, y la UI tampoco debería gatearlo con
--   `isMedico`.
--
-- ── ALCANCE: ESTA MIGRACIÓN ES SOLO LA COLUMNA ──────────────────────────────
--   No toca `schema.sql`, ni los tipos de `src/types/`, ni la página de perfil, ni las
--   Server Actions. La captura en la UI (input en /perfil, validación, manejo del 23505)
--   va aparte.
--
--   Lo que NO hay que tocar cuando llegue esa parte, y conviene anticipar:
--     · El trigger `handle_new_user()` — inserta solo `(id, full_name, role)`, así que
--       toda cuenta nueva nace con `dni` NULL. Correcto: el dato se pide en edición de
--       perfil, no en el registro, para no meter fricción en el alta.
--     · `emisor_snapshot` (migración 028) — el DNI NO va en los documentos emitidos.
--       Sumarlo obligaría a decidir qué pasa con los ya emitidos, que son inmutables y
--       no tienen backfill.
--
-- ── POR QUÉ VA DENTRO DE UNA TRANSACCIÓN ────────────────────────────────────
--   Los dos DDL son transaccionales en Postgres. Envolverlos deja la tabla en uno de dos
--   estados y ninguno intermedio: o queda con la columna Y su constraint, o queda como
--   estaba. Sin el `BEGIN; … COMMIT;`, un fallo del segundo ALTER dejaría la columna
--   creada y SIN unicidad — silencioso, y justo el estado que después admite el
--   duplicado que la constraint tenía que impedir.
--
-- Fecha: 2026-08-20
-- ============================================================================

BEGIN;

-- ── 1. La columna ───────────────────────────────────────────────────────────
-- TEXT y no un tipo numérico, a propósito: es un IDENTIFICADOR, no una cantidad.
-- No se suma ni se compara por magnitud, y como texto no pierde ceros a la izquierda.
-- Es el mismo criterio que ya usa `pacientes.dni TEXT NOT NULL`.
ALTER TABLE public.profiles
  ADD COLUMN dni TEXT;

COMMENT ON COLUMN public.profiles.dni IS
  'DNI del profesional (médico o asistente). OPCIONAL: la ley argentina no lo exige '
  'para historia clínica ni certificados — el identificador legal del ejercicio es la '
  'matrícula (profiles.matriculas). Se carga en la edición de perfil, nunca en el '
  'registro. ⚠ NO es el DNI del paciente (ver pacientes.dni). Migración 044.';

-- ── 2. La unicidad ──────────────────────────────────────────────────────────
-- GLOBAL, no por tenant — ver la explicación del encabezado antes de "corregirla"
-- por simetría con la 043. Los 23 perfiles existentes tienen dni NULL y no chocan
-- entre sí: en un índice único los NULL no se consideran iguales.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_dni_key UNIQUE (dni);

COMMENT ON CONSTRAINT profiles_dni_key ON public.profiles IS
  'DNI único en TODA la instalación (no por tenant): profiles es la tabla de usuarios '
  'del sistema y una persona no debería tener dos cuentas profesionales. Contraste '
  'deliberado con pacientes_creado_por_dni_key, que sí es por tenant (mig. 043).';

COMMIT;


-- ============================================================================
-- VERIFICACIÓN (correr DESPUÉS del COMMIT, fuera de la transacción)
-- ============================================================================
--
-- 1) La columna existe y es NULLABLE.
--    ESPERADO: 1 fila → dni | text | YES | (sin default)
--
-- SELECT column_name,
--        data_type,
--        is_nullable,          -- debe decir 'YES'
--        column_default        -- debe ser NULL
--   FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND table_name   = 'profiles'
--    AND column_name  = 'dni';
--
--
-- 2) La constraint existe y es UNIQUE sobre (dni) solo.
--    ESPERADO: 1 fila → profiles_dni_key | u | UNIQUE (dni)
--
-- SELECT con.conname                   AS constraint_name,
--        con.contype                   AS tipo,        -- 'u' = unique
--        pg_get_constraintdef(con.oid) AS definicion
--   FROM pg_constraint con
--   JOIN pg_class     rel ON rel.oid = con.conrelid
--   JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
--  WHERE nsp.nspname = 'public'
--    AND rel.relname = 'profiles'
--    AND con.conname = 'profiles_dni_key';
--
--
-- 3) (Opcional) Todas las constraints de unicidad de `profiles`, para ver el conjunto.
--    ESPERADO: 2 filas → profiles_pkey (PRIMARY KEY (id)) y profiles_dni_key.
--
-- SELECT con.conname, con.contype, pg_get_constraintdef(con.oid)
--   FROM pg_constraint con
--  WHERE con.conrelid = 'public.profiles'::regclass
--    AND con.contype IN ('u', 'p')
--  ORDER BY con.conname;
--
--
-- 4) (Opcional) Estado de los datos: los 23 perfiles deberían seguir con dni NULL.
--
-- SELECT count(*) AS total,
--        count(dni) AS con_dni,               -- count(col) ignora los NULL
--        count(*) - count(dni) AS sin_dni
--   FROM public.profiles;
--
-- ============================================================================


-- ============================================================================
-- REVERSIBLE — cómo volver atrás
-- ============================================================================
--
-- Sin advertencias especiales: la columna es NUEVA y el dato es OPCIONAL, así que nada
-- del sistema depende de ella. Revertir solo pierde los DNI que se hayan cargado entre
-- la aplicación de esta migración y la reversión — no rompe ninguna consulta, ninguna
-- RLS ni ningún documento emitido (el DNI no entra en `emisor_snapshot`).
--
-- Si esos valores importan, copiarlos antes:
--
--   SELECT id, full_name, dni FROM public.profiles WHERE dni IS NOT NULL;
--
-- El DROP COLUMN se lleva la constraint puesta, así que el primer ALTER es redundante;
-- va explícito igual, para que la reversión diga exactamente qué deshace.
--
-- BEGIN;
--   ALTER TABLE public.profiles
--     DROP CONSTRAINT profiles_dni_key;
--
--   ALTER TABLE public.profiles
--     DROP COLUMN dni;
-- COMMIT;
--
-- ============================================================================
