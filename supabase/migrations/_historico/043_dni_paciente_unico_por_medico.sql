-- ============================================================================
-- Migration 043 — DNI de paciente: unicidad POR TENANT, no global
-- ============================================================================
--
-- ── EL PROBLEMA ─────────────────────────────────────────────────────────────
--   `public.pacientes.dni` nació declarado inline como `dni TEXT NOT NULL UNIQUE`
--   (ver `schema.sql` → tabla `pacientes`), y Postgres le puso el nombre automático
--   `pacientes_dni_key` a esa constraint, definida como `UNIQUE (dni)` — o sea,
--   unicidad GLOBAL sobre toda la tabla.
--
--   Eso es incorrecto en una app multi-tenant. Amauta aísla los datos por médico
--   (regla de negocio 3: "ninguna data se comparte entre médicos distintos"), y dos
--   médicos distintos pueden legítimamente atender al MISMO paciente: una persona
--   con diabetes puede ir a dos consultorios. Con la constraint global, el primero
--   que carga el DNI se lo "reserva" para toda la instalación y el segundo médico
--   recibe un 23505 → la app le contesta "Ya existe un paciente registrado con este
--   DNI" (`POST /api/pacientes`), un mensaje que además le MIENTE: para él ese
--   paciente no existe, la RLS `pacientes_select` ni siquiera se lo deja ver.
--
--   Dicho de otro modo: la constraint filtraba información entre tenants (permitía
--   inferir por prueba y error que otro médico atiende a tal DNI) y, sobre todo,
--   bloqueaba un alta perfectamente válida.
--
-- ── QUÉ CAMBIA ──────────────────────────────────────────────────────────────
--   Se dropea  `pacientes_dni_key`            → UNIQUE (dni)
--   Se crea    `pacientes_creado_por_dni_key` → UNIQUE (creado_por, dni)
--
--   Lo que se conserva es lo importante: DENTRO de un mismo médico el DNI sigue
--   siendo único, así que no se puede duplicar un paciente en el propio consultorio
--   (que es el error real que la constraint original quería evitar). Lo que se
--   habilita es que el mismo DNI exista una vez por cada tenant.
--
-- ── POR QUÉ LA COLUMNA DE TENANT ES `creado_por` Y NO `medico_id` ───────────
--   ⚠ `pacientes` es la EXCEPCIÓN del esquema. El resto de las tablas de dominio
--   (`turnos`, `consultas`, `difusion_posts`, `notificaciones`…) llevan `medico_id`,
--   pero `pacientes` NO TIENE esa columna: su tenant key es `creado_por UUID NOT NULL
--   REFERENCES public.profiles(id)`, que guarda el UUID del MÉDICO TITULAR (nunca el
--   del asistente que hizo el alta — ver el insert de `POST /api/pacientes`, que
--   escribe `creado_por: tenantMedicoId` explícitamente).
--
--   No es una interpretación: las cuatro políticas RLS de la tabla comparan contra
--   esa columna —`pacientes_select/insert/update` usan `creado_por = get_medico_id()`
--   y `pacientes_delete` usa `creado_por = auth.uid()`— y el índice de listado de la
--   migración 024 es `idx_pacientes_activos ON pacientes(creado_por) WHERE
--   archivado_at IS NULL`. Escribir esta constraint contra cualquier otra columna
--   dejaría el aislamiento mal.
--
-- ── AUDITORÍA PREVIA (hecha sobre la base viva, antes de escribir esto) ─────
--   · Duplicados de (creado_por, dni): 0 filas → la constraint nueva entra sin fallar.
--   · 11 pacientes, 7 tenants, 0 filas sin dni.
--   · Índices existentes sobre `pacientes`: pacientes_pkey, pacientes_dni_key (el
--     ÚNICO que esta migración toca), idx_pacientes_dni, idx_pacientes_nombre,
--     idx_pacientes_obra_social, idx_pacientes_activos.
--
-- ── POR QUÉ TODO VA DENTRO DE UNA TRANSACCIÓN ───────────────────────────────
--   Entre el DROP y el ADD la tabla queda SIN NINGUNA protección de unicidad sobre
--   el DNI: en esa ventana un insert concurrente podría meter el duplicado que la
--   constraint nueva después no admitiría, y el ADD fallaría dejando la tabla sin
--   constraint alguna. El `BEGIN; … COMMIT;` cierra esa ventana — el DROP toma
--   ACCESS EXCLUSIVE sobre la tabla y lo retiene hasta el COMMIT, así que ninguna
--   otra sesión escribe en el medio, y si algo falla se revierte entero (se vuelve a
--   la constraint global, no a "ninguna").
--
--   Los dos DDL son transaccionales en Postgres, así que el rollback es total.
--
-- ── POR QUÉ EL `DROP` VA SIN `IF EXISTS` ────────────────────────────────────
--   A propósito: si `pacientes_dni_key` ya no existiera con ese nombre exacto, la
--   premisa de esta migración cambió y quiero que FALLE RUIDOSAMENTE en vez de
--   seguir de largo y crear una constraint nueva conviviendo con vaya a saber qué.
--   Como todo está en la transacción, el fallo no deja nada a medias. (`ALTER TABLE
--   … ADD CONSTRAINT` no admite `IF NOT EXISTS` en ninguna versión, así que esta
--   migración no es idempotente de todos modos: se corre una sola vez.)
--
-- Fecha: 2026-08-19
-- ============================================================================

BEGIN;

-- ── 1. Fuera la unicidad GLOBAL ─────────────────────────────────────────────
-- `pacientes_dni_key` = UNIQUE (dni). Nombre verificado contra pg_constraint en la
-- base viva. Al dropear la constraint desaparece también su índice implícito
-- (`pacientes_dni_key`), que Postgres administra como parte de la constraint.
ALTER TABLE public.pacientes
  DROP CONSTRAINT pacientes_dni_key;

-- ── 2. Unicidad POR TENANT ──────────────────────────────────────────────────
-- El orden de las columnas es (creado_por, dni), no al revés: el índice implícito
-- que crea esta constraint queda entonces también utilizable para las consultas que
-- filtran por tenant solo (prefijo izquierdo), que es como consulta la app.
ALTER TABLE public.pacientes
  ADD CONSTRAINT pacientes_creado_por_dni_key UNIQUE (creado_por, dni);

COMMENT ON CONSTRAINT pacientes_creado_por_dni_key ON public.pacientes IS
  'DNI único POR MÉDICO (tenant = creado_por), no global. Dos médicos distintos '
  'pueden atender al mismo paciente; dentro de un mismo consultorio el DNI sigue '
  'sin poder duplicarse. Reemplazó a pacientes_dni_key UNIQUE(dni) en la mig. 043.';

-- ── 3. `idx_pacientes_dni` SE CONSERVA — NO DROPEARLO ───────────────────────
-- ⚠ Hasta esta migración, `idx_pacientes_dni ON pacientes(dni)` era REDUNDANTE: el
-- índice implícito de `pacientes_dni_key` ya cubría exactamente `(dni)`, así que
-- borrarlo habría sido lo correcto. Con este cambio deja de serlo, y por eso queda:
--
--   · El índice de la constraint nueva es sobre `(creado_por, dni)`. Un índice
--     compuesto NO sirve para buscar por `dni` solo, porque `dni` no es el prefijo
--     izquierdo: Postgres no puede hacer un index scan sin conocer `creado_por`.
--   · Con `pacientes_dni_key` fuera, `idx_pacientes_dni` pasa a ser el ÚNICO índice
--     sobre `dni` a secas. Lo necesita toda búsqueda de un paciente por DNI que NO
--     filtre por tenant: hoy, tareas de soporte/diagnóstico contra la base, y a
--     futuro cualquier lookup transversal (p. ej. detectar que un DNI ya está cargado
--     en otro consultorio, algo que recién ahora es un caso posible).
--
-- No se emite ningún DDL sobre él; solo se documenta en la base para que la próxima
-- revisión de índices no lo lea como sobrante y lo borre.
COMMENT ON INDEX public.idx_pacientes_dni IS
  'Único índice sobre dni SOLO desde la mig. 043 (antes redundante con '
  'pacientes_dni_key). NO dropear: el índice de pacientes_creado_por_dni_key es '
  '(creado_por, dni) y no sirve para buscar por dni sin tenant.';

COMMIT;


-- ============================================================================
-- VERIFICACIÓN (correr DESPUÉS del COMMIT, fuera de la transacción)
-- ============================================================================
--
-- 1) Constraints de unicidad sobre `pacientes`.
--    ESPERADO: NO aparece `pacientes_dni_key`, y sí aparece
--    `pacientes_creado_por_dni_key` con definición `UNIQUE (creado_por, dni)`.
--
-- SELECT con.conname                                AS constraint_name,
--        con.contype                                AS tipo,      -- 'u' = unique, 'p' = primary key
--        pg_get_constraintdef(con.oid)              AS definicion
--   FROM pg_constraint con
--   JOIN pg_class     rel ON rel.oid = con.conrelid
--   JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
--  WHERE nsp.nspname = 'public'
--    AND rel.relname = 'pacientes'
--    AND con.contype IN ('u', 'p')
--  ORDER BY con.conname;
--
--   Resultado esperado (2 filas):
--     pacientes_creado_por_dni_key | u | UNIQUE (creado_por, dni)
--     pacientes_pkey               | p | PRIMARY KEY (id)
--
--
-- 2) Chequeo puntual de que la vieja YA NO ESTÁ (devuelve 0 filas).
--
-- SELECT conname
--   FROM pg_constraint
--  WHERE conrelid = 'public.pacientes'::regclass
--    AND conname  = 'pacientes_dni_key';
--
--
-- 3) Índices de `pacientes`.
--    ESPERADO: 6 filas → pacientes_pkey, pacientes_creado_por_dni_key (nuevo,
--    implícito de la constraint), idx_pacientes_dni (CONSERVADO), idx_pacientes_nombre,
--    idx_pacientes_obra_social, idx_pacientes_activos.
--    ⚠ `pacientes_dni_key` NO debe figurar.
--
-- SELECT indexname, indexdef
--   FROM pg_indexes
--  WHERE schemaname = 'public'
--    AND tablename  = 'pacientes'
--  ORDER BY indexname;
--
--
-- 4) (Opcional) Confirmar que no hay duplicados dentro de un mismo tenant —
--    debería devolver 0 filas, y si la migración commiteó es imposible que no.
--
-- SELECT creado_por, dni, count(*)
--   FROM public.pacientes
--  GROUP BY creado_por, dni
-- HAVING count(*) > 1;
--
-- ============================================================================


-- ============================================================================
-- REVERSIBLE — cómo volver atrás
-- ============================================================================
--
-- ⚠⚠ LEER ESTO ANTES DE CORRERLO: LA REVERSIÓN PUEDE FALLAR, Y ES LO ESPERABLE.
--
--   Recrear `UNIQUE (dni)` exige que NO exista el mismo DNI en dos tenants distintos.
--   Pero eso es EXACTAMENTE lo que esta migración habilitó: en cuanto un segundo
--   médico cargue a un paciente que otro ya tenía, el `ADD CONSTRAINT` de abajo va a
--   abortar con `could not create unique index "pacientes_dni_key" / Key (dni)=(…)
--   is duplicated` (23505). No es un bug de la reversión: es la constraint vieja
--   diciendo la verdad sobre por qué estaba mal.
--
--   O sea que la reversión es segura SOLO en una ventana corta después de aplicar la
--   043, antes de que aparezca el primer DNI compartido entre tenants. Pasada esa
--   ventana, revertir exige una DECISIÓN DE DATOS previa: a qué médico se le borra o
--   se le archiva el paciente duplicado. ⚠ Y ojo con la regla de negocio 9 (Ley
--   26.529): un paciente con actuaciones NO se borra, se archiva — y archivar NO
--   libera el DNI, porque `archivado_at` no participa de la constraint. En la
--   práctica, pasada la ventana, esta migración es de ida.
--
--   Para saber de antemano si la reversión va a poder correr, listar los conflictos:
--
--     SELECT dni, count(*) AS tenants, array_agg(creado_por) AS medicos
--       FROM public.pacientes
--      GROUP BY dni
--     HAVING count(*) > 1;
--
--   Si eso devuelve 0 filas, la reversión corre limpia. Si devuelve algo, resolverlo
--   primero.
--
-- BEGIN;
--   ALTER TABLE public.pacientes
--     DROP CONSTRAINT pacientes_creado_por_dni_key;
--
--   ALTER TABLE public.pacientes
--     ADD CONSTRAINT pacientes_dni_key UNIQUE (dni);
--
--   -- Devolver `idx_pacientes_dni` a su estado anterior: con la constraint global de
--   -- vuelta, ese índice vuelve a ser redundante, así que se le quita el comentario
--   -- que la 043 le puso (el índice en sí no se toca: existía desde antes).
--   COMMENT ON INDEX public.idx_pacientes_dni IS NULL;
-- COMMIT;
--
-- ============================================================================
