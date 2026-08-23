-- ############################################################################
-- ⚠⚠  ESTE ARCHIVO ES DERIVADO. NO ES LA AUTORIDAD SOBRE EL ESQUEMA.
-- ############################################################################
--
--   LA AUTORIDAD ES `supabase/migrations/000_baseline.sql`. Ese archivo se generó
--   LEYENDO la base; éste se mantiene A MANO. Ante cualquier diferencia entre los
--   dos, MANDA EL BASELINE.
--
--   Y ante cualquier duda REAL —algo de lo que dependa una decisión, un diagnóstico
--   o un fix— MANDA LA BASE VIVA, no éste ni el baseline. Se consulta directo (hay
--   un MCP de Supabase de solo lectura conectado a Claude Code; ver CLAUDE.md →
--   "Acceso directo a la base").
--
--   ⚠ ESTE ARCHIVO SE MANTIENE A MANO Y POR ESO PUEDE TENER ERRORES. No es una
--     precaución teórica, ya pasó: hasta el pase de documentación del 2026-08-23
--     decía que el índice de `rate_limits` se llamaba `idx_rate_limits_window`
--     cuando en la base se llama `idx_rate_limits_window_start`, y describía
--     `recetas.fecha_vencimiento` sin default cuando la base tiene uno (ver el ⚠ de
--     esa tabla). Los dos se encontraron consultando la base, no leyendo el archivo.
--
--   PARA QUÉ SIRVE IGUAL: para leer el modelo de datos completo de corrido, con los
--   porqués al lado de cada objeto. Eso el baseline también lo tiene, pero acá está
--   más compacto. Úsalo para ENTENDER; no lo cites como prueba de que algo ES así.
--
-- ############################################################################


-- ============================================================================
-- schema.sql — SNAPSHOT CONSOLIDADO DEL ESQUEMA (Amauta)
-- ============================================================================
-- Este archivo es un SNAPSHOT del estado FINAL del esquema de la base de datos,
-- reconstruido a partir de las migraciones en supabase/migrations/ (001→047, hoy
-- archivadas en supabase/migrations/_historico/).
-- Sirve como referencia y lectura rápida del modelo de datos completo.
--
-- Migraciones recientes reflejadas: 022 (consultas.campos_extra), 023 (Realtime:
-- mensajes_internos en la publicación supabase_realtime — no cambia estructura de
-- tabla), 024 (pacientes.archivado_at + índice idx_pacientes_activos), 025
-- (endurecimiento de seguridad: verificar_documento sin datos sensibles + permisos,
-- drop de RLS huérfanas en consultas, drop de DELETE en pedidos/certificados,
-- search_path en log_turno_cambio), 026 (infraestructura de Storage: bucket privado
-- `estudios` con límite 10 MB y MIME acotado + 4 políticas RLS sobre storage.objects
-- aisladas por tenant; endurecimiento de las 4 políticas de la tabla `estudios` para
-- exigir check_permiso 'ver_historia_clinica' — ver sección STORAGE al final),
-- 027 (persistencia de PDFs: bucket privado `documentos` con límite 5 MB y MIME
-- solo application/pdf + 3 políticas RLS sobre storage.objects aisladas por tenant —
-- select/insert/update, SIN delete a propósito; ver sección STORAGE), 028 (columna
-- `emisor_snapshot JSONB` en pedidos y certificados: foto de los datos del médico
-- firmante al emitir, para que el documento sea fiel e inmutable),
-- 029 (corrección de DRIFT de seguridad en RLS: las políticas de la base habían sido
-- modificadas a mano hacia versiones más permisivas que las migraciones fuente —
-- recetas insert/update/delete, evoluciones update/delete e historia_delete vuelven a
-- exigir rol médico, normalizadas a TO authenticated; + migración del trigger
-- consultas_updated_at a set_updated_at() y drop de la duplicada
-- update_updated_at_column(); drop de get_user_role() sin argumentos; drop de la
-- política duplicada de notificaciones; fix del DEFAULT de profiles.role, que era
-- 'secretario' y violaba su propio CHECK), 030 (recreación de los objetos que existían
-- en la base SIN CREATE versionado: tablas `consultas` y `notificaciones` completas,
-- columnas turnos.categoria/origen/consulta_id + sus 3 CHECK, y columnas
-- profiles.titulo/matriculas/logo_url),
-- 031 (rate limiting efectivo: tabla `rate_limits` [fixed-window counter, RLS on SIN
-- políticas] + función `check_rate_limit` [SECURITY DEFINER, conteo atómico, EXECUTE
-- solo service_role/postgres]. Reemplaza el rate limiter en memoria, inútil en
-- serverless — ver sección RATE LIMITING al final),
-- 032 (REPLICA IDENTITY FULL en `mensajes_internos`: no cambia columnas ni datos,
-- solo la identidad de fila que viaja en la replicación lógica. Compañera de la 023;
-- ⚠ NO resolvió el problema de Realtime que la motivaba — ver sección REALTIME al
-- final y PENDIENTES.md → Bloque A),
-- 033 (RLS de la agenda: CREA `bloqueos_update`, la política que NUNCA existió —
-- editar/mover/redimensionar un bloqueo afectaba 0 filas en silencio y la UI mostraba
-- falso éxito—, espejando `turnos_update`; y REEMPLAZA `bloqueos_delete` y
-- `turnos_delete`, que eran solo-médico, por el mismo criterio de la agenda:
-- gestionar_turnos. Decisión de producto: la agenda es una unidad de permiso, y las
-- políticas de DELETE ahora coinciden con lo que los endpoints ya permitían),
-- 034 (solicitudes_asistente: la UNIQUE TOTAL (solicitante_id, medico_id) pasa a
-- ÍNDICE ÚNICO PARCIAL `WHERE estado = 'pendiente'`. La constraint vieja daba UNA fila
-- por par EN TODA LA HISTORIA, así que un asistente desvinculado o rechazado no podía
-- volver a solicitarle vinculación al mismo médico. ⚠ Es índice y no constraint porque
-- Postgres NO admite constraints UNIQUE parciales),
-- 035 (catálogo: IOSEP agregada a obras_sociales — carga de datos, no cambia estructura),
-- 036 (bloqueos_agenda: columna `updated_at` + trigger `bloqueos_updated_at`. Compañera
-- de la 033: recién desde que los bloqueos son editables de verdad tiene sentido
-- registrar cuándo se editaron. Las filas existentes se sembraron con su `created_at`,
-- no con now(), para no afirmar una edición que nunca ocurrió),
-- 037 (bloqueos_agenda: `bloqueos_select` pasa de TENANT-ONLY a exigir permiso
-- —`ver_turnos` OR `gestionar_turnos`— y las 4 políticas se normalizan a
-- TO authenticated. Cierra una lectura que nadie autorizaba: un asistente sin permisos
-- de agenda podía leer los bloqueos por PostgREST directo),
-- 038 (consultas: columna `creado_por` [autor, nullable, SIN backfill] y `consultas_delete`
-- reescrita —tenant + estado='borrador' + rol médico OR autor, TO authenticated—, que
-- habilita el descarte de borradores por su autor y deja a las consultas FINALIZADAS
-- imborrables desde la base; + índice único parcial `turnos_consulta_id_unico`, que
-- garantiza UN turno por consulta sin depender de ningún permiso),
-- 039 (`turnos_select` pasa de exigir solo `ver_turnos` a aceptar `ver_turnos` OR
-- `gestionar_turnos`, con el MISMO USING que la 037 le puso a `bloqueos_select`: las dos
-- tablas de la agenda quedan por fin con el mismo criterio de lectura. Cierra el falso
-- negativo de solapamiento del asistente con `gestionar_turnos` y SIN `ver_turnos`, que
-- escribía turnos que no podía leer. Es AMPLIACIÓN de acceso [A → A OR B]: nadie que hoy
-- lea turnos deja de leerlos. ⚠ Se hizo con ALTER POLICY, que preserva el rol, así que
-- `turnos_select` quedó en {public} — eso lo cerró después la 042),
-- 040 (`turnos_audit_log` registra también los DELETE: columna `medico_id` [tenant
-- DESNORMALIZADO, backfilleado, NOT NULL] + índice; `turno_id` pasa a NULLABLE y su FK de
-- ON DELETE CASCADE a ON DELETE SET NULL —el CASCADE borraba el historial completo del
-- turno—; `log_turno_cambio()` suma la rama DELETE [`turno_id` NULL, `detalle` =
-- to_jsonb(OLD), acción 'eliminado']; el trigger se recrea como AFTER INSERT OR UPDATE OR
-- DELETE, fijando la dirección de forma explícita y cerrando la discrepancia histórica
-- BEFORE/AFTER; y `audit_select` deja de resolver el tenant por JOIN al turno —que hacía
-- invisibles las filas huérfanas— para leer `medico_id` de la propia fila, normalizada a
-- TO authenticated),
-- 041 (`consultas.proximo_turno_sugerido` pasa de DATE a TIMESTAMPTZ: la columna truncaba
-- en silencio la hora del próximo control y todo se agendaba a las 09:00),
-- 042 (normalización de RLS: las 49 políticas del esquema `public` que NO declaraban
-- cláusula `TO` —o sea `{public}`, `anon` incluido— pasan a `TO authenticated`, en 18
-- tablas. Se hizo con ALTER POLICY, que cambia SOLO el rol: ninguna expresión se
-- reescribió, así que la lógica de autorización quedó idéntica. Cierra el seguimiento que
-- habían dejado abierto la 037 y la 039. Resultado: las 65 políticas de `public` quedan en
-- {authenticated}, cero en {public}. Defensa en profundidad, no un parche de urgencia: las
-- 49 ya colgaban de get_medico_id()/auth.uid(), que para `anon` no resuelven),
-- 043 (`pacientes.dni`: se dropea `pacientes_dni_key UNIQUE (dni)` y se crea
-- `pacientes_creado_por_dni_key UNIQUE (creado_por, dni)`. La unicidad GLOBAL era un bug de
-- modelo multi-tenant: impedía que dos médicos sin relación atendieran al mismo paciente.
-- `idx_pacientes_dni` se CONSERVA — desde acá es el único índice sobre `dni` solo),
-- 044 (`profiles.dni`: columna TEXT NULLABLE nueva + `profiles_dni_key UNIQUE (dni)`.
-- Unicidad GLOBAL, deliberadamente lo opuesto a la 043 — ver CLAUDE.md → nota técnica 27.
-- Opcional a nivel producto; se captura en la edición de perfil, no en el registro, y la
-- cargan médicos y asistentes por igual),
-- 045 (catálogo: se ELIMINA la fila 'Particular / Sin obra social' de obras_sociales, con
-- UPDATE previo que suelta la FK de los pacientes que la apuntaran. "Sin obra social" pasa
-- a modelarse como AUSENCIA. ⚠ En producción esa fila YA HABÍA SIDO BORRADA A MANO, sin
-- migración que lo registrara: la 045 es un no-op contra esa base y existe para que un
-- entorno nuevo no reviva la ambigüedad. Ver PENDIENTES.md → "Esquema sin migración
-- fuente", donde el episodio quedó como caso testigo del ítem de consolidación de baseline),
-- 046 (RLS de mensajería: las 4 políticas de `mensajes_internos` pasan a exigir
-- `check_permiso(auth.uid(), 'acceso_mensajeria')` —NINGUNA lo hacía: el permiso nació en la
-- 015, dos migraciones antes que la mensajería, y nadie lo cableó— y a aplicar el TENANT
-- donde faltaba: `mensajes_ver` solo lo pedía en la rama grupal, así que un mensaje
-- INDIVIDUAL sobrevivía a un cambio de médico. Hecha con ALTER POLICY (cambia solo las
-- expresiones; el rol ya era `authenticated` desde la 042). ⚠ La asimetría entre LEER y
-- BORRAR —el titular borra un individual entre asistentes pero NO lo lee— se revisó y se
-- DECIDIÓ CONSERVAR: es deliberada a partir de acá, no un descuido (CLAUDE.md → nota 29).
-- ⚠ `mensajes_lecturas` queda AFUERA a propósito: no tiene columna de tenant y sus dos
-- políticas ya acotan a `user_id = auth.uid()`. Incluye además `SET search_path = public`
-- en `get_medico_id()`, la única SECURITY DEFINER del esquema que no lo fijaba —y la más
-- usada—; el cuerpo no cambia ni un carácter),
-- 047 (`mensajes_internos.ultima_actividad_at` TIMESTAMPTZ NOT NULL DEFAULT now(), con
-- backfill por GREATEST(raíz, max(hijos)): la bandeja ordenaba por `created_at` de la RAÍZ,
-- así que un hilo viejo con una respuesta de hoy NO subía. La mantiene el trigger
-- `mensajes_actividad_trigger` (AFTER INSERT, WHEN parent_id IS NOT NULL) sobre
-- `bump_actividad_hilo()`, SECURITY DEFINER ⚠ porque `mensajes_marcar_leido` bloquearía su
-- UPDATE en 2 de los 3 casos —y en SILENCIO—; SIN rama de DELETE a propósito. Dos índices
-- PARCIALES nuevos: `mensajes_bandeja_idx` (orden + keyset de la paginación) y
-- `mensajes_parent_idx`, que cierra una carencia preexistente [3 consultas calientes
-- filtran por `parent_id` y ningún índice lo cubría]. Ver CLAUDE.md → nota 30),
--
-- ⚠ NO reemplaza al sistema de migraciones. Las migraciones reales — la fuente
--   de verdad para aplicar cambios — siguen viviendo en supabase/migrations/.
--   No apliques este archivo directamente sobre una base existente.
--
-- Reconstruido para reflejar la forma ACTUAL de cada tabla (con todas las
-- columnas agregadas en bloques posteriores), no la historia de migraciones.
--
-- ✅ Desde la migración 030 TODOS los objetos tienen su CREATE versionado en
--    supabase/migrations/ (ya no quedan objetos "sin migración fuente").
--
-- ⚠ LIMITACIÓN DE ORDEN DEL HISTORIAL (ya no bloquea: la resolvió el baseline).
--    La SECUENCIA 001→047 NO es ejecutable desde una base vacía. SEIS migraciones
--    —013, 014, 015, 022, 025 y 029— referencian DOS tablas que recién se crean en la
--    030: `public.consultas` (las seis) y `public.notificaciones` (la 029). Correr el
--    set desde cero falla en la 013, en
--    `ALTER TABLE public.consultas ENABLE ROW LEVEL SECURITY`.
--    ✅ Resuelto por `supabase/migrations/000_baseline.sql`, que recrea el esquema
--    completo en un solo archivo. Las 49 migraciones se archivaron en
--    supabase/migrations/_historico/ y siguen siendo consultables (su README explica
--    el corte). ⚠ El baseline está PENDIENTE DE VERIFICACIÓN — ver ese README.
-- ============================================================================


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ EXTENSIONES                                                                │
-- └──────────────────────────────────────────────────────────────────────────┘

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- uuid_generate_v4()
-- gen_random_uuid() proviene de pgcrypto (disponible por defecto en Supabase).


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ TIPOS ENUM                                                                 │
-- └──────────────────────────────────────────────────────────────────────────┘

-- Estado de un turno en la agenda.
-- Verificado contra la base real: el ENUM tiene 7 valores e incluye
-- 'pendiente_confirmar' (usado por types/turno.ts y turno.schema.ts). No hay
-- desajuste entre el código y la base.
CREATE TYPE turno_estado AS ENUM (
  'pendiente',           -- Agendado, sin confirmar
  'confirmado',          -- Confirmado con el paciente
  'presente',            -- El paciente llegó al consultorio
  'ausente',             -- No se presentó (no-show)
  'cancelado',           -- Cancelado por cualquier parte
  'reprogramado',        -- Fue movido a otro horario
  'pendiente_confirmar'  -- A la espera de confirmación del paciente
);

-- Tipo de certificado médico.
CREATE TYPE certificado_tipo AS ENUM (
  'aptitud_fisica',
  'reposo',
  'diagnostico',
  'libre_deuda',
  'otro'
);

-- Estado de un post de difusión.
CREATE TYPE difusion_estado AS ENUM ('borrador', 'listo', 'enviado', 'archivado');

-- Canal de envío de difusión.
CREATE TYPE difusion_canal AS ENUM ('email', 'whatsapp', 'ambos');


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ TABLAS                                                                     │
-- └──────────────────────────────────────────────────────────────────────────┘

-- ── profiles ────────────────────────────────────────────────────────────────
-- Extiende auth.users. El médico es dueño del tenant (medico_id NULL); el
-- asistente apunta a su médico vía medico_id. Incluye datos de firma/sello y
-- los 12 permisos granulares (Bloque 3).
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'asistente' CHECK (role IN ('medico', 'asistente')),
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Multi-tenancy: si es asistente, apunta al médico dueño del tenant.
  medico_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Documento de identidad del USUARIO de la app (médico o asistente). Migración 044.
  -- ⚠ OPCIONAL a nivel producto y NULLABLE: los perfiles previos no lo tienen y la ley
  -- argentina no lo exige (el identificador legal del ejercicio es la matrícula). Se
  -- carga en la edición de perfil, nunca en el registro. NO es el DNI del paciente.
  dni         TEXT,

  -- Identidad profesional del médico (se estampan en los PDF).
  matricula   TEXT,                          -- @deprecated → usar matriculas (jsonb)
  firma_url   TEXT,                           -- Firma digitalizada (base64/URL)
  titulo      TEXT,                           -- migración 030 — Dr./Dra./Lic./...
  matriculas  JSONB DEFAULT '[]'::jsonb,      -- migración 030 — [{tipo:'MP'|'MN'|'ME', numero}]
  logo_url    TEXT,                           -- migración 030 — sello/logo (base64)

  -- Permisos legacy (Bloque 2). Reemplazados por los granulares de abajo.
  puede_ver_historias  BOOLEAN DEFAULT FALSE, -- @deprecated
  puede_editar_agenda  BOOLEAN DEFAULT FALSE, -- @deprecated

  -- Permisos granulares para asistentes (Bloque 3). Default FALSE = mínimo privilegio.
  ver_pacientes         BOOLEAN NOT NULL DEFAULT FALSE,
  editar_pacientes      BOOLEAN NOT NULL DEFAULT FALSE,  -- ⚠ es "editar_", NO "gestionar_"
  ver_historia_clinica  BOOLEAN NOT NULL DEFAULT FALSE,
  crear_consultas       BOOLEAN NOT NULL DEFAULT FALSE,
  finalizar_consultas   BOOLEAN NOT NULL DEFAULT FALSE,
  ver_turnos            BOOLEAN NOT NULL DEFAULT FALSE,
  gestionar_turnos      BOOLEAN NOT NULL DEFAULT FALSE,
  ver_pedidos           BOOLEAN NOT NULL DEFAULT FALSE,
  crear_pedidos         BOOLEAN NOT NULL DEFAULT FALSE,
  ver_certificados      BOOLEAN NOT NULL DEFAULT FALSE,
  crear_certificados    BOOLEAN NOT NULL DEFAULT FALSE,
  acceso_mensajeria     BOOLEAN NOT NULL DEFAULT FALSE,

  -- migración 044 — unicidad GLOBAL del DNI, deliberadamente lo OPUESTO a la constraint
  -- por tenant de `pacientes` (mig. 043): `profiles` es la tabla de USUARIOS del sistema,
  -- no pertenece a ningún tenant, y una persona no debería tener dos cuentas.
  -- Los perfiles sin DNI conviven: en un índice único los NULL no se comparan entre sí.
  -- El porqué de la asimetría, en CLAUDE.md → nota técnica 27.
  CONSTRAINT profiles_dni_key UNIQUE (dni)
);
CREATE INDEX idx_profiles_medico ON public.profiles(medico_id);

-- ── obras_sociales ──────────────────────────────────────────────────────────
-- Catálogo de obras sociales. Lectura pública para autenticados.
-- NOTA: el catálogo NO tiene fila para "sin obra social", y es deliberado.
--   La seed de la 001 incluía 'Particular / Sin obra social' como registro real, que
--   convivía con una opción homónima hardcodeada en el formulario de pacientes. Las dos
--   se veían idénticas en el <Select> y guardaban cosas distintas (la del catálogo
--   escribía obra_social_id; la hardcodeada deja al paciente sin obra social), así que
--   dos pacientes igualmente particulares quedaban modelados distinto.
--   ✅ La migración 045 ELIMINÓ la fila del catálogo. Decisión de producto: "sin obra
--   social" se representa como AUSENCIA — obra_social_id IS NULL y sin texto libre —,
--   nunca como una fila. El literal quedó como valor de PRESENTACIÓN en la constante
--   SIN_OBRA_SOCIAL_LABEL. Ver CLAUDE.md → nota técnica 28.
-- NOTA: este archivo NO incluye el INSERT del catálogo (vive en las migraciones). El
--   contenido actual = las 13 filas de la seed de la 001, MENOS 'Particular / Sin obra
--   social' (borrada por la 045), MÁS 'IOSEP', agregada por la migración 035 (obra social
--   común en la zona del consultorio, que hasta entonces se venía cargando como texto
--   libre en pacientes.obra_social_otro).
--   ⚠ El id que ocupaba la fila borrada queda HUECO: SERIAL no reutiliza ids.
CREATE TABLE public.obras_sociales (
  id     SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
);

-- ── pacientes ───────────────────────────────────────────────────────────────
-- Pacientes del consultorio. creado_por = UUID del médico dueño (tenant key).
CREATE TABLE public.pacientes (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dni              TEXT NOT NULL,             -- ⚠ único POR TENANT, no global: ver la constraint de abajo (mig. 043)
  nombre_completo  TEXT NOT NULL,
  fecha_nacimiento DATE NOT NULL,
  sexo             TEXT NOT NULL CHECK (sexo IN ('masculino', 'femenino', 'otro')),
  telefono         TEXT,
  email            TEXT,
  provincia        TEXT,
  ciudad           TEXT,
  obra_social_id   INTEGER REFERENCES public.obras_sociales(id),
  obra_social_otro TEXT,                      -- Texto libre si no está en la lista
  numero_afiliado  TEXT,
  creado_por       UUID NOT NULL REFERENCES public.profiles(id),  -- tenant key
  archivado_at     TIMESTAMPTZ,                -- NULL = activo; con valor = archivado (Ley 26.529). Migración 024.
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- migración 043 — reemplazó a `pacientes_dni_key UNIQUE (dni)`, que era unicidad
  -- GLOBAL y por eso impedía que DOS médicos distintos atendieran al mismo paciente.
  -- Ahora el DNI es único DENTRO de cada tenant. ⚠ Contrastar con `profiles.dni`, que
  -- sí es único global y a propósito (ver esa tabla y CLAUDE.md → nota técnica 27).
  CONSTRAINT pacientes_creado_por_dni_key UNIQUE (creado_por, dni)
);
-- ⚠ idx_pacientes_dni NO es redundante desde la 043: el índice de la constraint es
-- (creado_por, dni) y no sirve para buscar por `dni` solo (no es prefijo izquierdo).
CREATE INDEX idx_pacientes_dni         ON public.pacientes(dni);
CREATE INDEX idx_pacientes_nombre      ON public.pacientes(nombre_completo);
CREATE INDEX idx_pacientes_obra_social ON public.pacientes(obra_social_id);
CREATE INDEX idx_pacientes_activos     ON public.pacientes(creado_por) WHERE archivado_at IS NULL;  -- listado de activos (migración 024)

-- ── historia_clinica ────────────────────────────────────────────────────────
-- Historia clínica base (modelo legacy 1:1 por paciente). Antecedentes y datos
-- iniciales. Las consultas cronológicas viven en la tabla `consultas`.
CREATE TABLE public.historia_clinica (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paciente_id               UUID NOT NULL UNIQUE REFERENCES public.pacientes(id) ON DELETE CASCADE,
  antecedentes_patologicos  TEXT,
  medicacion_diaria         TEXT,
  habitos_toxicos           TEXT,
  actividad_fisica          TEXT,
  actividad_laboral         TEXT,
  antecedentes_quirurgicos  TEXT,
  clinica_actual            TEXT,
  examen_fisico             TEXT,
  laboratorio               TEXT,
  estudios_complementarios  TEXT,
  conducta                  TEXT,
  proximo_control           TIMESTAMPTZ,      -- migración 016 lo pasó de DATE a TIMESTAMPTZ
  peso_inicial              NUMERIC(5,2),
  talla                     NUMERIC(5,2),
  perimetro_cintura         NUMERIC(5,2),
  creado_por    UUID NOT NULL REFERENCES public.profiles(id),
  updated_by    UUID REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_historia_paciente ON public.historia_clinica(paciente_id);

-- ── consultas ───────────────────────────────────────────────────────────────
-- Versionada por la migración 030. Consultas cronológicas del nuevo modelo de HC
-- (Bloque 1), específicas para diabetología. medico_id = tenant key.
-- Tipos y nullability VERIFICADOS contra la base real (difieren de lo que este
-- archivo documentaba antes: talla_cm y temperatura tienen escala 1, y los cinco
-- parámetros metabólicos son (6,2), no (5,1); created_at/updated_at son NULLABLE).
CREATE TABLE public.consultas (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id            UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  medico_id              UUID NOT NULL REFERENCES public.profiles(id),  -- tenant key
  fecha_hora             TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Motivo y anamnesis
  motivo_consulta        TEXT,
  anamnesis              TEXT,
  -- Examen físico
  peso_kg                NUMERIC(5,2),
  talla_cm               NUMERIC(5,1),
  ta_sistolica           INTEGER,
  ta_diastolica          INTEGER,
  frecuencia_cardiaca    INTEGER,
  temperatura            NUMERIC(4,1),
  -- Parámetros metabólicos
  glucemia_ayunas        NUMERIC(6,2),
  glucemia_postprandial  NUMERIC(6,2),
  hba1c                  NUMERIC(4,2),
  trigliceridos          NUMERIC(6,2),
  colesterol_ldl         NUMERIC(6,2),
  colesterol_hdl         NUMERIC(6,2),
  -- Diagnóstico y plan
  diagnostico            TEXT,
  plan_terapeutico       TEXT,
  medicacion_actual      TEXT,
  observaciones          TEXT,
  -- Seguimiento
  -- migración 041 — pasó de DATE a TIMESTAMPTZ. Era DATE y truncaba en silencio la
  -- hora que el formulario mandaba ('2026-08-20T14:00' se guardaba '2026-08-20'), así
  -- que al reabrir un borrador la hora elegida volvía al default 09:00. Sin backfill:
  -- las filas previas quedaron en la medianoche UTC que produjo el cast (data de prueba).
  proximo_turno_sugerido TIMESTAMPTZ,
  -- Campos extra ad-hoc por consulta (migración 022): array [{ seccion, nombre, valor }],
  -- seccion ∈ 'examen_fisico' | 'parametros_metabolicos'. Preserva el orden de carga.
  campos_extra           JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Estado: 'finalizada' es inmutable desde la UI
  estado                 TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'finalizada')),
  -- migración 038 — AUTOR de la consulta (quien la creó). ⚠ NO es el tenant: eso es
  -- medico_id. Habilita la regla de descarte "el médico O el asistente que la creó"
  -- (ver la política consultas_delete). NULLABLE y SIN BACKFILL a propósito: a una
  -- consulta anterior a la 038 no se le puede inventar autor, y con NULL la comparación
  -- `creado_por = auth.uid()` da NULL → solo el médico puede descartarla.
  creado_por             UUID REFERENCES public.profiles(id),
  -- NULLABLE en la base (no NOT NULL), con default now()
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now()
);
-- Índices verificados contra pg_indexes de la base real; la migración 030 los crea
-- con estos mismos nombres y definiciones.
CREATE INDEX consultas_paciente_id_idx ON public.consultas(paciente_id);
CREATE INDEX consultas_medico_id_idx   ON public.consultas(medico_id);
CREATE INDEX consultas_fecha_hora_idx  ON public.consultas(fecha_hora DESC);

-- ── estudios ────────────────────────────────────────────────────────────────
-- Archivos de estudios complementarios (bucket privado "estudios") por paciente.
CREATE TABLE public.estudios (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paciente_id   UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  nombre        TEXT NOT NULL,
  tipo          TEXT,
  fecha_estudio DATE,
  descripcion   TEXT,
  storage_path  TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  file_size     INTEGER,
  mime_type     TEXT DEFAULT 'application/pdf',
  subido_por    UUID NOT NULL REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_estudios_paciente ON public.estudios(paciente_id);
CREATE INDEX idx_estudios_fecha    ON public.estudios(fecha_estudio);

-- ── evoluciones ─────────────────────────────────────────────────────────────
-- Series temporales de laboratorio/antropometría (modelo legacy, para gráficos).
CREATE TABLE public.evoluciones (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paciente_id   UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
  peso               NUMERIC(5,2),
  perimetro_cintura  NUMERIC(5,2),
  hba1c              NUMERIC(4,2),
  glucemia_ayunas    NUMERIC(5,1),
  insulina_basal     NUMERIC(6,2),
  homa_ir            NUMERIC(5,2),
  colesterol_total   NUMERIC(5,1),
  hdl                NUMERIC(5,1),
  ldl                NUMERIC(5,1),
  trigliceridos      NUMERIC(5,1),
  got_ast            NUMERIC(6,2),
  gpt_alt            NUMERIC(6,2),
  ggt                NUMERIC(6,2),
  fosfatasa_alcalina NUMERIC(6,2),
  tension_sistolica  INTEGER,
  tension_diastolica INTEGER,
  frecuencia_cardiaca INTEGER,
  observaciones      TEXT,
  registrado_por UUID NOT NULL REFERENCES public.profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_evoluciones_paciente_fecha ON public.evoluciones(paciente_id, fecha);

-- ── turnos ──────────────────────────────────────────────────────────────────
-- Agenda de turnos. medico_id = tenant key. Las columnas categoria/origen/
-- consulta_id son del Bloque 4 y las versionó la migración 030 (junto con sus
-- tres CHECK, incluido check_paciente_id_required_for_turno_medico).
CREATE TABLE public.turnos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paciente_id   UUID REFERENCES public.pacientes(id) ON DELETE SET NULL,
  paciente_nombre_libre TEXT,
  fecha_inicio  TIMESTAMPTZ NOT NULL,
  fecha_fin     TIMESTAMPTZ NOT NULL,
  motivo        TEXT,
  notas         TEXT,
  estado        turno_estado NOT NULL DEFAULT 'pendiente',
  color         TEXT DEFAULT '#3B82F6',
  recordatorio_enviado BOOLEAN DEFAULT false,
  medico_id     UUID NOT NULL REFERENCES public.profiles(id),  -- tenant key
  agendado_por  UUID NOT NULL REFERENCES public.profiles(id),
  -- Bloque 4 (versionadas por la migración 030). Nombres reales de los CHECK:
  --   check_turnos_categoria · turnos_origen_check · check_paciente_id_required_for_turno_medico
  categoria     TEXT NOT NULL DEFAULT 'turno_medico'
                CONSTRAINT check_turnos_categoria
                CHECK (categoria IN ('turno_medico','curso','personal','administrativo','recordatorio')),
  origen        TEXT NOT NULL DEFAULT 'manual'
                CONSTRAINT turnos_origen_check CHECK (origen IN ('manual','desde_hc')),
  consulta_id   UUID REFERENCES public.consultas(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Un turno de categoría 'turno_medico' exige paciente asociado.
  CONSTRAINT check_paciente_id_required_for_turno_medico
    CHECK (categoria <> 'turno_medico' OR paciente_id IS NOT NULL)
);
CREATE INDEX idx_turnos_fecha    ON public.turnos(fecha_inicio);
CREATE INDEX idx_turnos_rango    ON public.turnos(fecha_inicio, fecha_fin);
CREATE INDEX idx_turnos_paciente ON public.turnos(paciente_id);
CREATE INDEX idx_turnos_estado   ON public.turnos(estado);
CREATE INDEX idx_turnos_medico   ON public.turnos(medico_id);
-- migración 038 — UN turno por consulta. Lo único que evitaba el duplicado era un SELECT
-- previo en el código de los endpoints de consultas, que pasa por `turnos_select` y por lo
-- tanto dependía de los permisos de lectura: un asistente sin ellos recibía `null` aunque
-- el turno existiera e insertaba un duplicado. El índice lo cierra en la base, sin depender
-- de ningún permiso. Es PARCIAL porque los turnos manuales —la mayoría— tienen
-- consulta_id NULL. (La 039 cerró aparte el lado de los permisos; son dos garantías
-- distintas: ésta cubre el duplicado por consulta, aquélla el solapamiento.)
-- ⚠ Por eso mismo NO alcanza a ningún turno con consulta_id NULL. El único camino que los
--   creaba fuera del flujo de consultas era POST /api/pacientes/[id]/historia (HC vieja),
--   DADO DE BAJA en 2026-08-11 junto con la tabla `historia_clinica`, que quedó dormida.
CREATE UNIQUE INDEX turnos_consulta_id_unico ON public.turnos(consulta_id) WHERE consulta_id IS NOT NULL;

-- ── bloqueos_agenda ─────────────────────────────────────────────────────────
-- Bloqueos de horario (vacaciones, almuerzo, etc.). medico_id = tenant key.
CREATE TABLE public.bloqueos_agenda (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fecha_inicio  TIMESTAMPTZ NOT NULL,
  fecha_fin     TIMESTAMPTZ NOT NULL,
  motivo        TEXT NOT NULL DEFAULT 'No disponible',
  es_recurrente BOOLEAN DEFAULT false,
  recurrencia_fin DATE,
  dias_semana   INTEGER[],                    -- 0=Dom … 6=Sáb
  medico_id     UUID NOT NULL REFERENCES public.profiles(id),  -- tenant key
  creado_por    UUID NOT NULL REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- migración 036 — compañera de la 033: recién desde que existe `bloqueos_update` los
  -- bloqueos son editables de verdad, así que tiene sentido registrar CUÁNDO. Lo mantiene
  -- el trigger `bloqueos_updated_at` (ver TRIGGERS). ⚠ Registra el cuándo, NO el quién ni
  -- el qué: no hay un equivalente de `turnos_audit_log` para bloqueos.
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bloqueos_medico ON public.bloqueos_agenda(medico_id);

-- ── turnos_audit_log ────────────────────────────────────────────────────────
-- Log automático (vía trigger) de cambios en turnos. Desde la migración 040 cubre
-- también los DELETE (antes el borrado no dejaba ningún rastro).
CREATE TABLE public.turnos_audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- migración 040 — NULLABLE, y la FK pasó de ON DELETE CASCADE a ON DELETE SET NULL.
  -- ⚠ Los dos cambios son el corazón de esa migración: con CASCADE, borrar un turno
  -- borraba TODO su historial de auditoría, así que auditar el DELETE habría sido
  -- escribir una fila que se autodestruye en el mismo statement.
  -- Hay DOS caminos que dejan esta columna en NULL:
  --   1. el SET NULL de la FK, que preserva las filas históricas del turno borrado;
  --   2. la propia fila 'eliminado', que NACE con NULL — en un trigger AFTER DELETE el
  --      turno ya no existe y un INSERT que lo referenciara violaría la FK y abortaría
  --      el borrado entero. El id del turno queda dentro de `detalle` (to_jsonb(OLD)).
  turno_id    UUID REFERENCES public.turnos(id) ON DELETE SET NULL,
  -- migración 040 — TENANT DESNORMALIZADO (backfilleado desde turnos, luego NOT NULL).
  -- Es lo que hace visibles las filas cuyo turno ya no existe: `audit_select` filtra por
  -- esta columna en vez de hacer JOIN contra `turnos`.
  medico_id   UUID NOT NULL,
  usuario_id  UUID NOT NULL REFERENCES public.profiles(id),
  accion      TEXT NOT NULL,                  -- 'creado' | 'modificado' | 'cancelado' | 'reprogramado' | 'eliminado'
  detalle     JSONB,                          -- {antes, despues} · en 'creado'/'eliminado': la fila entera
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_turno   ON public.turnos_audit_log(turno_id);
CREATE INDEX idx_audit_usuario ON public.turnos_audit_log(usuario_id);
-- migración 040 — la RLS nueva filtra por medico_id en cada SELECT.
CREATE INDEX idx_turnos_audit_medico ON public.turnos_audit_log(medico_id);

-- ── pedidos ─────────────────────────────────────────────────────────────────
-- Pedidos de estudios complementarios con PDF y verificación por QR.
CREATE TABLE public.pedidos (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paciente_id  UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE RESTRICT,
  paciente_nombre    TEXT NOT NULL,           -- snapshot al emitir
  paciente_dni       TEXT NOT NULL,
  paciente_dob       DATE NOT NULL,
  obra_social_nombre TEXT,
  numero_afiliado    TEXT,
  diagnostico        TEXT NOT NULL,
  estudios_pedidos   TEXT NOT NULL,
  fecha_pedido       DATE NOT NULL DEFAULT CURRENT_DATE,
  indicaciones       TEXT,
  pdf_path           TEXT,            -- ruta del PDF congelado en el bucket `documentos` (migración 027)
  pdf_generado_at    TIMESTAMPTZ,
  -- migración 028: foto del médico firmante al emitir. Shape (= prop `medico` de la
  -- plantilla PDF): { full_name, titulo, matriculas:[{tipo,numero}], firma_url, logo_url }.
  -- El preview HTML y la regeneración del PDF leen de acá, no de `profiles` en vivo.
  emisor_snapshot    JSONB,
  firmado_por        UUID NOT NULL REFERENCES public.profiles(id),
  codigo_verificacion TEXT UNIQUE NOT NULL DEFAULT upper(substring(md5(random()::text) from 1 for 12)),
  estado             TEXT NOT NULL DEFAULT 'emitido' CHECK (estado IN ('emitido', 'revocado')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pedidos_paciente ON public.pedidos(paciente_id);
CREATE INDEX idx_pedidos_fecha    ON public.pedidos(fecha_pedido);

-- ── certificados ────────────────────────────────────────────────────────────
-- Certificados médicos con PDF y verificación por QR.
CREATE TABLE public.certificados (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paciente_id  UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE RESTRICT,
  paciente_nombre    TEXT NOT NULL,           -- snapshot al emitir
  paciente_dni       TEXT NOT NULL,
  paciente_dob       DATE NOT NULL,
  obra_social_nombre TEXT,
  numero_afiliado    TEXT,
  tipo               certificado_tipo,        -- migración 017: nullable, sin default
  tipo_descripcion   TEXT,
  contenido          TEXT NOT NULL,
  dias_reposo        INTEGER,
  fecha_inicio_reposo DATE,
  fecha_certificado  DATE NOT NULL DEFAULT CURRENT_DATE,
  valido_hasta       DATE,                    -- si < hoy → "expirado" (lógica de display)
  pdf_path           TEXT,            -- ruta del PDF congelado en el bucket `documentos` (migración 027)
  pdf_generado_at    TIMESTAMPTZ,
  -- migración 028: foto del médico firmante al emitir. Shape (= prop `medico` de la
  -- plantilla PDF): { full_name, titulo, matriculas:[{tipo,numero}], firma_url, logo_url }.
  -- El preview HTML y la regeneración del PDF leen de acá, no de `profiles` en vivo.
  emisor_snapshot    JSONB,
  firmado_por        UUID NOT NULL REFERENCES public.profiles(id),
  codigo_verificacion TEXT UNIQUE NOT NULL DEFAULT upper(substring(md5(random()::text) from 1 for 12)),
  estado             TEXT NOT NULL DEFAULT 'emitido' CHECK (estado IN ('emitido', 'revocado')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_certificados_paciente ON public.certificados(paciente_id);
CREATE INDEX idx_certificados_fecha    ON public.certificados(fecha_certificado);

-- ── recetas ─────────────────────────────────────────────────────────────────
-- Recetas digitales (estructura lista; emisión bloqueada hasta cumplir ANMAT).
-- Solo el médico puede crear/modificar; los asistentes solo pueden ver.
CREATE TABLE public.recetas (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paciente_id  UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE RESTRICT,
  paciente_nombre    TEXT NOT NULL,
  paciente_dni       TEXT NOT NULL,
  paciente_dob       DATE NOT NULL,
  obra_social_nombre TEXT,
  numero_afiliado    TEXT,
  diagnostico        TEXT NOT NULL,
  medicacion         TEXT NOT NULL,
  fecha_receta       DATE NOT NULL DEFAULT CURRENT_DATE,
  -- ⚠ EN LA BASE ESTA COLUMNA TIENE UN DEFAULT QUE ACÁ NO SE PUEDE ESCRIBIR:
  --   `(fecha_receta + '30 days'::interval)`, o sea una referencia a OTRA COLUMNA de
  --   la misma fila. Postgres NO permite crear eso por DDL, así que ni este archivo ni
  --   el baseline pueden reproducirlo. Es el CUARTO caso de cambio hecho a mano sobre
  --   la base sin migración que lo registre (la 009 crea la columna sin default).
  --   Inocuo hoy: la emisión de recetas está bloqueada por ANMAT y nadie inserta filas.
  --   Ver CLAUDE.md → nota técnica 31 y PENDIENTES.md → Bloque A.
  fecha_vencimiento  DATE,
  numero_receta      TEXT UNIQUE,
  firma_digital_ref  TEXT,
  pdf_path           TEXT,
  pdf_generado_at    TIMESTAMPTZ,
  firmado_por  UUID NOT NULL REFERENCES public.profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_recetas_paciente ON public.recetas(paciente_id);
CREATE INDEX idx_recetas_fecha    ON public.recetas(fecha_receta);
CREATE INDEX idx_recetas_numero   ON public.recetas(numero_receta);

-- ── difusion_posts ──────────────────────────────────────────────────────────
-- Posts de difusión/comunicación. medico_id = tenant key.
CREATE TABLE public.difusion_posts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  titulo       TEXT NOT NULL,
  contenido    TEXT NOT NULL,
  estado       difusion_estado NOT NULL DEFAULT 'borrador',
  canal        difusion_canal DEFAULT 'email',
  asunto_email TEXT,
  imagen_path  TEXT,
  medico_id    UUID NOT NULL REFERENCES public.profiles(id),  -- tenant key
  creado_por   UUID NOT NULL REFERENCES public.profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_difusion_estado  ON public.difusion_posts(estado);
CREATE INDEX idx_difusion_created ON public.difusion_posts(created_at DESC);
CREATE INDEX idx_difusion_medico  ON public.difusion_posts(medico_id);

-- ── difusion_envios ─────────────────────────────────────────────────────────
-- Historial de envíos de un post de difusión. EN USO desde la tanda de difusión por
-- email (2026-07-27): la puebla POST /api/difusion/enviar con UNA FILA POR DESTINATARIO
-- (enviado_ok, error_msg, enviado_at, enviado_por, email_destino, canal='email').
-- Además de log, es la fuente de dos cosas: el conteo del TOPE DIARIO de 100 emails por
-- tenant (filas con enviado_at dentro del día) y el resumen de envío + lista de fallidos
-- del detalle del comunicado. tel_destino sigue sin uso (canal WhatsApp no implementado).
CREATE TABLE public.difusion_envios (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id      UUID NOT NULL REFERENCES public.difusion_posts(id) ON DELETE CASCADE,
  paciente_id  UUID REFERENCES public.pacientes(id) ON DELETE SET NULL,
  email_destino TEXT,
  tel_destino   TEXT,
  canal         difusion_canal NOT NULL,
  enviado_ok   BOOLEAN DEFAULT false,
  error_msg    TEXT,
  enviado_at   TIMESTAMPTZ,
  enviado_por  UUID NOT NULL REFERENCES public.profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_envios_post     ON public.difusion_envios(post_id);
CREATE INDEX idx_envios_paciente ON public.difusion_envios(paciente_id);

-- ── solicitudes_asistente ───────────────────────────────────────────────────
-- Workflow de vinculación asistente ↔ médico (onboarding).
CREATE TABLE public.solicitudes_asistente (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  solicitante_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  medico_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  estado          TEXT NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  mensaje         TEXT,
  respondido_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  -- ⚠ La UNIQUE(solicitante_id, medico_id) que la 010 declaraba acá YA NO EXISTE: la
  --   migración 034 la dropeó y la reemplazó por el índice único PARCIAL de abajo.
);
CREATE INDEX idx_solicitudes_medico      ON public.solicitudes_asistente(medico_id);
CREATE INDEX idx_solicitudes_solicitante ON public.solicitudes_asistente(solicitante_id);
CREATE INDEX idx_solicitudes_estado      ON public.solicitudes_asistente(estado);
-- migración 034 — una sola solicitud PENDIENTE por par, en vez de una sola en toda la
-- historia. La constraint anterior no contemplaba `estado`, así que la fila vieja
-- ('aprobada' tras una desvinculación, o 'rechazada') ocupaba el cupo del par para siempre
-- y el asistente quedaba sin poder reingresar con ese médico.
-- ⚠ Es un ÍNDICE y no una CONSTRAINT porque Postgres NO admite constraints UNIQUE parciales
--   (no existe `ADD CONSTRAINT … UNIQUE (…) WHERE …`). Por eso el objeto aparece en
--   pg_indexes / pg_index y NO en pg_constraint; a efectos de integridad es equivalente
--   (mismo SQLSTATE 23505, que es el que la app ya traducía).
CREATE UNIQUE INDEX solicitudes_asistente_solicitante_medico_pendiente_key
  ON public.solicitudes_asistente(solicitante_id, medico_id) WHERE estado = 'pendiente';

-- ── notas ───────────────────────────────────────────────────────────────────
-- Notas personales por usuario (cualquier rol). RLS personal por user_id.
CREATE TABLE public.notas (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo     TEXT        NOT NULL CHECK (char_length(titulo) BETWEEN 1 AND 200),
  cuerpo     TEXT        NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notas_user_id_idx      ON public.notas(user_id);
CREATE INDEX notas_user_created_idx ON public.notas(user_id, created_at DESC);

-- ── mensajes_internos ───────────────────────────────────────────────────────
-- Mensajería interna asíncrona (individual o grupal). medico_id = tenant key.
-- ⚠ Esta tabla tiene REPLICA IDENTITY FULL (migración 032) y está en la publicación
--   `supabase_realtime` (migración 023). Ver la sección REALTIME al final.
CREATE TABLE public.mensajes_internos (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  remitente_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  destinatario_id UUID        REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL si es_grupal
  es_grupal       BOOLEAN     NOT NULL DEFAULT false,
  asunto          TEXT        NOT NULL CHECK (char_length(asunto) BETWEEN 1 AND 200),
  cuerpo          TEXT        NOT NULL DEFAULT '',
  leido           BOOLEAN     NOT NULL DEFAULT false,
  leido_at        TIMESTAMPTZ,
  parent_id       UUID        REFERENCES public.mensajes_internos(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- migración 047. Fecha del último mensaje del HILO. Solo es significativa en los
  -- mensajes RAÍZ (parent_id IS NULL), que son los que lista la bandeja: en una respuesta
  -- vale su propio created_at y NO SE LEE NUNCA. La mantiene el trigger
  -- `mensajes_actividad_trigger` (ver TRIGGERS). ⚠ NO se recalcula al borrar, a propósito.
  -- ⚠ No se llama `updated_at` a propósito: acá significa "pasó algo en el HILO", no "se
  -- modificó esta fila" — el nombre convencional invitaría a colgarle set_updated_at().
  ultima_actividad_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mensajes_destinatario_check
    CHECK (es_grupal = true OR destinatario_id IS NOT NULL)
);
CREATE INDEX mensajes_destinatario_idx  ON public.mensajes_internos(destinatario_id, created_at DESC);
CREATE INDEX mensajes_remitente_idx     ON public.mensajes_internos(remitente_id, created_at DESC);
CREATE INDEX mensajes_medico_grupal_idx ON public.mensajes_internos(medico_id, es_grupal, created_at DESC);
-- migración 047 — los dos PARCIALES:
--   · bandeja: tenant primero (igualdad) y columna de orden después, así sirve al WHERE y al
--     ORDER BY de una sola pasada, y la paginación por keyset lo recorre directo.
--   · parent : cierra una carencia PREEXISTENTE — filtran por `parent_id` el paso 3 de
--     `obtenerBandeja`, `obtenerHilo` y el borrado de respuestas de `eliminarMensaje`, y
--     ninguno de los 3 índices de arriba lo cubría.
CREATE INDEX mensajes_bandeja_idx ON public.mensajes_internos(medico_id, ultima_actividad_at DESC)
  WHERE parent_id IS NULL;
CREATE INDEX mensajes_parent_idx  ON public.mensajes_internos(parent_id, created_at)
  WHERE parent_id IS NOT NULL;

-- ── mensajes_lecturas ───────────────────────────────────────────────────────
-- Registro de lecturas de mensajes grupales (uno por usuario que leyó).
CREATE TABLE public.mensajes_lecturas (
  mensaje_id  UUID        NOT NULL REFERENCES public.mensajes_internos(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leido_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (mensaje_id, user_id)
);
CREATE INDEX mensajes_lecturas_user_idx ON public.mensajes_lecturas(user_id);


-- ── notificaciones ──────────────────────────────────────────────────────────
-- Versionada por la migración 030. Avisos del sistema para el médico.
-- Referencias en el código:
--   · SELECT  → src/app/(app)/notificaciones/page.tsx        (.eq('medico_id', ...))
--   · INSERT  → src/app/api/turnero/route.ts                 (turno agendado por asistente)
--   · INSERT  → src/app/api/cron/recordatorios/route.ts      (recordatorio 24hs enviado)
CREATE TABLE public.notificaciones (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id  UUID        NOT NULL REFERENCES public.profiles(id),
  titulo     TEXT        NOT NULL,
  mensaje    TEXT        NOT NULL,
  tipo       TEXT        NOT NULL,
  leida      BOOLEAN     DEFAULT false,
  payload    JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
-- Índices verificados contra pg_indexes de la base real; la migración 030 los crea
-- con estos mismos nombres y definiciones.
CREATE INDEX idx_notificaciones_medico  ON public.notificaciones(medico_id);
CREATE INDEX idx_notificaciones_leida   ON public.notificaciones(medico_id, leida);
CREATE INDEX idx_notificaciones_created ON public.notificaciones(created_at DESC);

ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

-- RLS de notificaciones (el médico solo ve/gestiona las propias).
-- ⚠ ASIMETRÍA INTENCIONAL: el INSERT usa get_medico_id() y los otros tres auth.uid().
--   Es a propósito: un ASISTENTE inserta la notificación EN NOMBRE de su médico al
--   agendar un turno (src/app/api/turnero/route.ts) → get_medico_id() resuelve al id
--   del médico del tenant y el WITH CHECK lo permite. Con auth.uid() ese insert
--   fallaría. Los select/update/delete sí usan auth.uid(): solo el propio médico lee
--   y gestiona sus notificaciones.
--   (La migración 029 dropeó la política duplicada "Medicos ven sus propias
--    notificaciones", redundante con notificaciones_select.)
CREATE POLICY "notificaciones_select" ON public.notificaciones
  FOR SELECT TO authenticated USING (medico_id = auth.uid());
CREATE POLICY "notificaciones_insert" ON public.notificaciones
  FOR INSERT TO authenticated WITH CHECK (medico_id = get_medico_id());
CREATE POLICY "notificaciones_update" ON public.notificaciones
  FOR UPDATE TO authenticated USING (medico_id = auth.uid());
CREATE POLICY "notificaciones_delete" ON public.notificaciones
  FOR DELETE TO authenticated USING (medico_id = auth.uid());


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ FUNCIONES                                                                  │
-- └──────────────────────────────────────────────────────────────────────────┘

-- Trigger genérico: setea updated_at = now() en cada UPDATE.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger en auth.users: crea el profile automáticamente al registrarse.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    LEFT(COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''), NEW.email, 'Usuario'), 100),
    CASE
      WHEN NEW.raw_user_meta_data->>'role' IN ('medico', 'asistente') THEN NEW.raw_user_meta_data->>'role'
      ELSE 'asistente'
    END
  );
  RETURN NEW;
END;
$$;

-- Resuelve el tenant key del usuario actual: su id si es médico, su medico_id si
-- es asistente. Base de casi todas las políticas RLS multi-tenant.
-- ⚠ `SET search_path = public` desde la migración 046: era la ÚNICA SECURITY DEFINER del
--   esquema sin fijarlo —y la más usada—. Riesgo de comportamiento nulo: el cuerpo no
--   cambió y ya calificaba `public.profiles`. Mismo criterio que la 025 aplicó a
--   verificar_documento() y log_turno_cambio().
CREATE OR REPLACE FUNCTION public.get_medico_id()
RETURNS uuid AS $$
  SELECT CASE
    WHEN role = 'medico'    THEN id
    WHEN role = 'asistente' THEN medico_id
    ELSE NULL
  END
  FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Helpers SECURITY DEFINER para evitar recursión RLS en profiles.
CREATE OR REPLACE FUNCTION public.get_user_role(user_id uuid)
RETURNS text AS $$
  SELECT role FROM public.profiles WHERE id = user_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_user_medico_id(user_id uuid)
RETURNS uuid AS $$
  SELECT medico_id FROM public.profiles WHERE id = user_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Verificación genérica de permisos: TRUE si es médico, o si es asistente con el
-- permiso booleano correspondiente. Usa IF/ELSIF explícito (sin SQL dinámico).
CREATE OR REPLACE FUNCTION public.check_permiso(user_id uuid, permiso text)
RETURNS boolean AS $$
DECLARE
  v_role text;
  v_result boolean;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = user_id;
  IF v_role = 'medico' THEN RETURN TRUE; END IF;

  IF    permiso = 'ver_pacientes'        THEN SELECT ver_pacientes        INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'editar_pacientes'     THEN SELECT editar_pacientes     INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'ver_historia_clinica' THEN SELECT ver_historia_clinica INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'crear_consultas'      THEN SELECT crear_consultas      INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'finalizar_consultas'  THEN SELECT finalizar_consultas  INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'ver_turnos'           THEN SELECT ver_turnos           INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'gestionar_turnos'     THEN SELECT gestionar_turnos     INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'ver_pedidos'          THEN SELECT ver_pedidos          INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'crear_pedidos'        THEN SELECT crear_pedidos        INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'ver_certificados'     THEN SELECT ver_certificados     INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'crear_certificados'   THEN SELECT crear_certificados   INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'acceso_mensajeria'    THEN SELECT acceso_mensajeria    INTO v_result FROM public.profiles WHERE id = user_id;
  ELSE RETURN FALSE;
  END IF;

  RETURN COALESCE(v_result, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Wrappers legacy (delegan en check_permiso).
CREATE OR REPLACE FUNCTION public.check_asistente_ver_hc(user_id uuid)
RETURNS boolean AS $$ SELECT public.check_permiso(user_id, 'ver_historia_clinica'); $$
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.check_asistente_editar_agenda(user_id uuid)
RETURNS boolean AS $$ SELECT public.check_permiso(user_id, 'ver_turnos'); $$
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Trigger: registra en turnos_audit_log cada alta/cambio/BORRADO de un turno.
-- SECURITY DEFINER con search_path fijo (migración 025).
-- Reescrita por la migración 040: se sumó la rama DELETE y la columna `medico_id` a los
-- tres INSERT (es NOT NULL: sin ella el trigger fallaría en la primera alta). Las ramas
-- INSERT y UPDATE conservan su semántica EXACTA (mismo actor, mismo CASE, mismo detalle).
CREATE OR REPLACE FUNCTION public.log_turno_cambio()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.turnos_audit_log (turno_id, medico_id, usuario_id, accion, detalle)
    VALUES (NEW.id, NEW.medico_id, NEW.agendado_por, 'creado', to_jsonb(NEW));
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.turnos_audit_log (turno_id, medico_id, usuario_id, accion, detalle)
    VALUES (
      NEW.id,
      NEW.medico_id,
      COALESCE(auth.uid(), NEW.agendado_por),
      CASE
        WHEN NEW.estado = 'cancelado'             THEN 'cancelado'
        WHEN OLD.fecha_inicio <> NEW.fecha_inicio THEN 'reprogramado'
        ELSE 'modificado'
      END,
      jsonb_build_object('antes', to_jsonb(OLD), 'despues', to_jsonb(NEW))
    );
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    -- ⚠ `turno_id` va NULL, NO `OLD.id`: en un trigger AFTER DELETE el turno ya no
    -- existe, y un INSERT que lo referencie viola la FK y aborta el borrado entero.
    -- `ON DELETE SET NULL` gobierna las filas hijas que YA existen; no habilita insertar
    -- una hija nueva apuntando a un padre que se fue. El id del turno queda en `detalle`.
    INSERT INTO public.turnos_audit_log (turno_id, medico_id, usuario_id, accion, detalle)
    VALUES (
      NULL,
      OLD.medico_id,
      -- Red de seguridad: si el borrado lo hace el admin client (service_role, sin
      -- sesión), auth.uid() es NULL y usuario_id es NOT NULL → el INSERT fallaría y se
      -- llevaría puesto el DELETE. Cae en quien agendó el turno. Mismo patrón que UPDATE.
      COALESCE(auth.uid(), OLD.agendado_por),
      'eliminado',
      to_jsonb(OLD)
    );
    -- En un trigger AFTER el retorno se ignora, pero por corrección devuelve OLD.
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger: sube `mensajes_internos.ultima_actividad_at` de la RAÍZ cuando entra una
-- respuesta. Migración 047.
--
-- ⚠⚠ POR QUÉ ES SECURITY DEFINER, Y DE QUÉ DEPENDE ESO
--   Hace un UPDATE sobre `mensajes_internos`, así que tiene que atravesar
--   `mensajes_marcar_leido`, la ÚNICA política de UPDATE de la tabla
--   (NOT es_grupal AND destinatario_id = auth.uid()). Evaluada contra la RAÍZ, esa política
--   BLOQUEA 2 de los 3 casos: raíz grupal (NOT es_grupal = FALSE) y raíz individual
--   respondida por su REMITENTE original (el destinatario de la raíz es el otro). Solo pasa
--   el caso "me escribieron y contesto".
--   ⚠ Y bloquearía EN SILENCIO: un UPDATE cuyas filas no pasan el USING no da error, afecta
--   0 filas (la lección de la 033 aplicada a un trigger). SECURITY DEFINER lo hace correr
--   como el owner, que bypassa RLS — igual que log_turno_cambio() (040).
--   ⚠⚠ ESO EXIGE QUE LA TABLA NO TENGA `FORCE ROW LEVEL SECURITY`. Hoy NINGUNA tabla del
--   esquema la declara. Si alguna vez se activara sobre `mensajes_internos`, ESTE TRIGGER
--   DEJARÍA DE ACTUALIZAR LA RAÍZ, EN SILENCIO, y el orden de la bandeja se congelaría sin
--   que nadie lo note. No hay forma de que la base avise.
--
-- ⚠ RECURSIÓN: no la hay porque es AFTER INSERT y ejecuta un UPDATE (un UPDATE no dispara
--   un trigger de INSERT). Agregarle `OR UPDATE` al trigger SÍ la introduciría.
CREATE OR REPLACE FUNCTION public.bump_actividad_hilo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Las tres condiciones importan:
  --   1. id = NEW.parent_id                  → la raíz del hilo.
  --   2. medico_id = NEW.medico_id           → GUARDA DE TENANT. La FK garantiza que el
  --      padre exista, no que sea del mismo consultorio: sin esto, una respuesta con
  --      `parent_id` de otro tenant subiría el hilo ajeno al tope de su bandeja.
  --   3. ultima_actividad_at < NEW.created_at → MONOTONÍA. Un insert con fecha vieja
  --      (importación, backdating) no puede BAJAR la actividad; y es la red anti-recursión.
  -- ⚠ Si ninguna fila coincide NO PASA NADA y el INSERT sigue: el trigger no debe abortar
  -- el envío de un mensaje válido por una anomalía de parentesco. Falla silenciosa POR
  -- DISEÑO, al revés que el NOT NULL de la columna.
  UPDATE public.mensajes_internos
  SET    ultima_actividad_at = NEW.created_at
  WHERE  id                  = NEW.parent_id
    AND  medico_id           = NEW.medico_id
    AND  ultima_actividad_at < NEW.created_at;

  RETURN NEW;   -- en un trigger AFTER el retorno se ignora
END;
$$;

-- Verificación pública de documentos (QR). SECURITY DEFINER: la usa el
-- admin client (service_role) en /verificar/[codigo] sin login.
-- Endurecida en la migración 025 (Ley 25.326, minimización de datos sensibles):
--   · Fija SET search_path = public.
--   · NO expone DNI completo ni contenido clínico. Devuelve el DNI enmascarado
--     (paciente_dni_masked: solo los últimos 3 dígitos) y omite el contenido.
--   · EXECUTE revocado de PUBLIC; solo service_role y postgres pueden invocarla.
CREATE OR REPLACE FUNCTION public.verificar_documento(codigo text)
RETURNS TABLE (
  id uuid, tipo_documento text, fecha_emision date,
  medico_nombre text, medico_titulo text, medico_matriculas jsonb,
  paciente_nombre text, paciente_dni_masked text,
  estado text, valido_hasta date
) SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, 'certificado'::text, c.fecha_certificado,
         p.full_name, p.titulo, p.matriculas,
         c.paciente_nombre,
         CASE
           WHEN c.paciente_dni IS NULL      THEN NULL
           WHEN length(c.paciente_dni) <= 3 THEN repeat('•', length(c.paciente_dni))
           ELSE repeat('•', length(c.paciente_dni) - 3) || right(c.paciente_dni, 3)
         END::text,
         c.estado, c.valido_hasta
  FROM public.certificados c
  JOIN public.profiles p ON c.firmado_por = p.id
  WHERE c.codigo_verificacion = codigo
  UNION ALL
  SELECT ped.id, 'pedido'::text, ped.fecha_pedido,
         p.full_name, p.titulo, p.matriculas,
         ped.paciente_nombre,
         CASE
           WHEN ped.paciente_dni IS NULL      THEN NULL
           WHEN length(ped.paciente_dni) <= 3 THEN repeat('•', length(ped.paciente_dni))
           ELSE repeat('•', length(ped.paciente_dni) - 3) || right(ped.paciente_dni, 3)
         END::text,
         ped.estado, NULL::date
  FROM public.pedidos ped
  JOIN public.profiles p ON ped.firmado_por = p.id
  WHERE ped.codigo_verificacion = codigo;
END;
$$ LANGUAGE plpgsql;

-- Solo el servidor (admin client / service_role) puede ejecutarla. Ver migración 025.
REVOKE EXECUTE ON FUNCTION public.verificar_documento(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.verificar_documento(text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.verificar_documento(text) TO postgres;


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ TRIGGERS                                                                   │
-- └──────────────────────────────────────────────────────────────────────────┘

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

CREATE TRIGGER profiles_updated_at        BEFORE UPDATE ON public.profiles             FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER pacientes_updated_at       BEFORE UPDATE ON public.pacientes            FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER historia_updated_at        BEFORE UPDATE ON public.historia_clinica     FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER consultas_updated_at       BEFORE UPDATE ON public.consultas            FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER evoluciones_updated_at     BEFORE UPDATE ON public.evoluciones          FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER turnos_updated_at          BEFORE UPDATE ON public.turnos               FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER bloqueos_updated_at        BEFORE UPDATE ON public.bloqueos_agenda      FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();  -- migración 036
CREATE TRIGGER pedidos_updated_at         BEFORE UPDATE ON public.pedidos              FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER certificados_updated_at    BEFORE UPDATE ON public.certificados         FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER recetas_updated_at         BEFORE UPDATE ON public.recetas              FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER difusion_updated_at        BEFORE UPDATE ON public.difusion_posts       FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER solicitudes_updated_at     BEFORE UPDATE ON public.solicitudes_asistente FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER set_notas_updated_at       BEFORE UPDATE ON public.notas                FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ✅ LA DISCREPANCIA BEFORE/AFTER QUEDÓ CERRADA (migración 040). Durante años este
--   archivo y la migración fuente `005_turnos.sql:176` no coincidían con lo observado en
--   la base. La 040 hace DROP + CREATE del trigger, así que **fija la dirección de forma
--   explícita**: es AFTER, y ya no depende de a quién se le crea. `005_turnos.sql` NO se
--   toca (es historia ya aplicada).
-- ⚠ Que sea AFTER es lo que obligó a la forma de la rama DELETE: con la fila ya borrada,
--   la de auditoría no puede referenciar el turno (ver `log_turno_cambio` más arriba).
CREATE TRIGGER turno_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.turnos
  FOR EACH ROW EXECUTE FUNCTION public.log_turno_cambio();

-- migración 047. ⚠ La condición va EN EL TRIGGER y no dentro de la función: con un IF
-- adentro, Postgres invocaría plpgsql para CADA raíz nueva y recién ahí saldría sin hacer
-- nada. ⚠ SOLO INSERT: `OR UPDATE` introduciría recursión infinita, y la ausencia de
-- `OR DELETE` es una decisión de producto (borrar la última respuesta NO recalcula, para
-- que la lista no se reordene bajo el cursor del usuario). Ver `bump_actividad_hilo()`.
CREATE TRIGGER mensajes_actividad_trigger
  AFTER INSERT ON public.mensajes_internos
  FOR EACH ROW
  WHEN (NEW.parent_id IS NOT NULL)
  EXECUTE FUNCTION public.bump_actividad_hilo();


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ ROW LEVEL SECURITY                                                         │
-- └──────────────────────────────────────────────────────────────────────────┘
-- Modelo: tenant aislado por médico. get_medico_id() resuelve el tenant del
-- usuario actual; check_permiso() valida permisos granulares de asistentes
-- (el médico siempre obtiene TRUE). Refleja el estado final tras la migración 021.

ALTER TABLE public.profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obras_sociales        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pacientes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historia_clinica      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estudios              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evoluciones           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turnos                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bloqueos_agenda       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turnos_audit_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificados          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recetas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.difusion_posts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.difusion_envios       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitudes_asistente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensajes_internos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensajes_lecturas     ENABLE ROW LEVEL SECURITY;
-- notificaciones: su ENABLE RLS y sus políticas viven en su propio bloque
-- autocontenido más arriba (tabla sin migración fuente).

-- ── profiles ────────────────────────────────────────────────────────────────
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated USING (
    auth.uid() = id
    OR public.get_user_role(auth.uid()) = 'medico'
    OR medico_id = auth.uid()
    OR id = public.get_user_medico_id(auth.uid())
    OR medico_id = public.get_user_medico_id(auth.uid())
  );
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

-- ── obras_sociales ──────────────────────────────────────────────────────────
CREATE POLICY "obras_sociales_select_all" ON public.obras_sociales
  FOR SELECT TO authenticated USING (auth.role() = 'authenticated');

-- ── pacientes ───────────────────────────────────────────────────────────────
CREATE POLICY "pacientes_select" ON public.pacientes
  FOR SELECT TO authenticated USING (creado_por = get_medico_id() AND public.check_permiso(auth.uid(), 'ver_pacientes'));
CREATE POLICY "pacientes_insert" ON public.pacientes
  FOR INSERT TO authenticated WITH CHECK (creado_por = get_medico_id() AND public.check_permiso(auth.uid(), 'editar_pacientes'));
CREATE POLICY "pacientes_update" ON public.pacientes
  FOR UPDATE TO authenticated USING (creado_por = get_medico_id() AND public.check_permiso(auth.uid(), 'editar_pacientes'));
CREATE POLICY "pacientes_delete" ON public.pacientes
  FOR DELETE TO authenticated USING (creado_por = auth.uid() AND public.get_user_role(auth.uid()) = 'medico');

-- ── historia_clinica ────────────────────────────────────────────────────────
CREATE POLICY "historia_select" ON public.historia_clinica
  FOR SELECT TO authenticated USING (public.check_permiso(auth.uid(), 'ver_historia_clinica')
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = historia_clinica.paciente_id AND creado_por = get_medico_id()));
CREATE POLICY "historia_insert" ON public.historia_clinica
  FOR INSERT TO authenticated WITH CHECK (public.check_permiso(auth.uid(), 'ver_historia_clinica')
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = historia_clinica.paciente_id AND creado_por = get_medico_id()));
CREATE POLICY "historia_update" ON public.historia_clinica
  FOR UPDATE TO authenticated USING (public.check_permiso(auth.uid(), 'ver_historia_clinica')
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = historia_clinica.paciente_id AND creado_por = get_medico_id()));
-- Restaurada por la migración 029 (la base había perdido el chequeo de rol médico).
-- Borrar una HC es exclusivo del médico: la Ley 26.529 obliga a conservarla.
CREATE POLICY "historia_delete" ON public.historia_clinica
  FOR DELETE TO authenticated USING (
    public.get_user_role(auth.uid()) = 'medico'
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = historia_clinica.paciente_id AND creado_por = public.get_medico_id()));

-- ── consultas ───────────────────────────────────────────────────────────────
-- ⚠ La migración 025 dropeó dos políticas huérfanas (medico_full_access,
--   asistente_access) que existían solo en la base (no en migraciones) y daban a
--   cualquier asistente acceso ALL a las consultas del tenant, salteando
--   check_permiso(). Las cuatro políticas de abajo son las únicas correctas.
CREATE POLICY "consultas_select" ON public.consultas
  FOR SELECT TO authenticated USING (public.check_permiso(auth.uid(), 'ver_historia_clinica') AND medico_id = get_medico_id());
CREATE POLICY "consultas_insert" ON public.consultas
  FOR INSERT TO authenticated WITH CHECK (public.check_permiso(auth.uid(), 'crear_consultas') AND medico_id = get_medico_id());
CREATE POLICY "consultas_update" ON public.consultas
  FOR UPDATE TO authenticated USING (medico_id = get_medico_id() AND (
    public.get_user_role(auth.uid()) = 'medico'
    OR public.check_permiso(auth.uid(), 'crear_consultas')
    OR public.check_permiso(auth.uid(), 'finalizar_consultas')));
-- consultas_delete: REESCRITA por la migración 038 (antes solo-médico:
-- `get_user_role(auth.uid()) = 'medico' AND medico_id = auth.uid()`). Habilita el descarte
-- de BORRADORES por su autor, con tres condiciones:
--   · tenant  → get_medico_id(). Reemplaza al `medico_id = auth.uid()` anterior, que era
--     correcto solo para el médico: para un asistente auth.uid() NUNCA es el medico_id de
--     la fila, así que el predicado viejo lo excluía por construcción.
--   · estado = 'borrador' → DEFENSA EN PROFUNDIDAD de la regla de negocio 1 y de la Ley
--     26.529: una consulta FINALIZADA es imborrable desde la base, para todos los roles y
--     por cualquier vía (endpoint, PostgREST directo, un script futuro).
--   · rol médico OR creado_por = auth.uid() → la regla de producto.
-- ⚠ Con `creado_por IS NULL` (consultas anteriores a la 038) la comparación da NULL, o sea
--   NO pasa: esas solo las descarta el médico. La regla "sin autor → solo el médico" NO
--   necesita cláusula propia, cae sola de la lógica ternaria de SQL.
CREATE POLICY "consultas_delete" ON public.consultas
  FOR DELETE TO authenticated USING (
    medico_id = get_medico_id()
    AND estado = 'borrador'
    AND (
      public.get_user_role(auth.uid()) = 'medico'
      OR creado_por = auth.uid()
    ));

-- ── estudios ────────────────────────────────────────────────────────────────
-- Endurecidas en la migración 026: select/insert/update exigen ahora
-- check_permiso 'ver_historia_clinica' (antes cualquier asistente del tenant
-- accedía — mismo hueco que tenía consultas antes de la 025). El delete queda
-- exclusivo del médico. El predicado de tenant usa get_medico_id() en las cuatro.
CREATE POLICY "estudios_select" ON public.estudios
  FOR SELECT TO authenticated USING (public.check_permiso(auth.uid(), 'ver_historia_clinica')
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = estudios.paciente_id AND creado_por = get_medico_id()));
CREATE POLICY "estudios_insert" ON public.estudios
  FOR INSERT TO authenticated WITH CHECK (public.check_permiso(auth.uid(), 'ver_historia_clinica')
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = estudios.paciente_id AND creado_por = get_medico_id()));
CREATE POLICY "estudios_update" ON public.estudios
  FOR UPDATE TO authenticated USING (public.check_permiso(auth.uid(), 'ver_historia_clinica')
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = estudios.paciente_id AND creado_por = get_medico_id()));
CREATE POLICY "estudios_delete" ON public.estudios
  FOR DELETE TO authenticated USING (public.get_user_role(auth.uid()) = 'medico'
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = estudios.paciente_id AND creado_por = get_medico_id()));

-- ── evoluciones ─────────────────────────────────────────────────────────────
CREATE POLICY "evoluciones_select" ON public.evoluciones
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.pacientes WHERE id = evoluciones.paciente_id AND creado_por = get_medico_id()));
CREATE POLICY "evoluciones_insert" ON public.evoluciones
  FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.pacientes WHERE id = evoluciones.paciente_id AND creado_por = get_medico_id()));
-- update/delete restaurados por la migración 029 (la base había perdido el chequeo
-- de rol médico): modificar/eliminar evoluciones es exclusivo del médico.
CREATE POLICY "evoluciones_update" ON public.evoluciones
  FOR UPDATE TO authenticated
  USING (public.get_user_role(auth.uid()) = 'medico'
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = evoluciones.paciente_id AND creado_por = public.get_medico_id()))
  WITH CHECK (public.get_user_role(auth.uid()) = 'medico'
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = evoluciones.paciente_id AND creado_por = public.get_medico_id()));
CREATE POLICY "evoluciones_delete" ON public.evoluciones
  FOR DELETE TO authenticated
  USING (public.get_user_role(auth.uid()) = 'medico'
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = evoluciones.paciente_id AND creado_por = public.get_medico_id()));

-- ── turnos ──────────────────────────────────────────────────────────────────
-- ⚠ turnos_select YA NO EXIGE SOLO `ver_turnos` (migración 039): acepta CUALQUIERA de los
--   dos permisos de agenda, con el MISMO USING que la 037 le puso a `bloqueos_select`. Las
--   dos tablas de la agenda quedan con el mismo criterio de lectura — que era exactamente
--   la diferencia que quedaba abierta.
--   El motivo concreto: los 12 permisos son booleanos INDEPENDIENTES, así que un asistente
--   con `gestionar_turnos` y SIN `ver_turnos` es configurable desde /perfil, y ese asistente
--   ESCRIBÍA TURNOS QUE NO PODÍA LEER. Consecuencia peor que los 404 falsos: el helper
--   `src/lib/agenda/solapamiento.ts` consulta con el cliente de SESIÓN, así que pasaba por
--   esta política, recibía [] y concluía que la franja estaba LIBRE → dejaba crear un turno
--   ENCIMA de otro. Unificar el criterio en el helper no cerraba esto (solo concentraba el
--   bug); se cierra acá, en la base.
--   Es AMPLIACIÓN de acceso (A → A OR B): nadie que ya leyera turnos dejó de leerlos.
-- ✅ ROL: la 039 usó ALTER POLICY (cambia el USING EN EL LUGAR, sin el instante en que la
--   política no existe) y `ALTER POLICY` sin `TO` PRESERVA el rol, así que esta política
--   quedó un tiempo en {public} mientras las 4 de bloqueos_agenda ya estaban en
--   `authenticated` desde la 037. Nunca fue explotable (cuelga de get_medico_id(), que para
--   `anon` no resuelve), y la 042 cerró la diferencia: las 4 de `turnos` están en
--   `TO authenticated`, igual que las 65 del esquema `public`.
CREATE POLICY "turnos_select" ON public.turnos
  FOR SELECT TO authenticated USING (
    medico_id = get_medico_id()
    AND (
      public.check_permiso(auth.uid(), 'ver_turnos')
      OR public.check_permiso(auth.uid(), 'gestionar_turnos')
    )
  );
CREATE POLICY "turnos_insert" ON public.turnos
  FOR INSERT TO authenticated WITH CHECK (medico_id = get_medico_id() AND public.check_permiso(auth.uid(), 'gestionar_turnos'));
CREATE POLICY "turnos_update" ON public.turnos
  FOR UPDATE TO authenticated USING (medico_id = get_medico_id() AND public.check_permiso(auth.uid(), 'gestionar_turnos'));
-- ⚠ turnos_delete YA NO es solo-médico (migración 033): la agenda es una unidad de
-- permiso, así que el asistente con gestionar_turnos también borra. Antes era
-- `medico_id = auth.uid() AND get_user_role(auth.uid()) = 'medico'`, y como el endpoint
-- DELETE sí dejaba pasar al asistente, el borrado le fallaba en silencio (0 filas + 200).
CREATE POLICY "turnos_delete" ON public.turnos
  FOR DELETE TO authenticated USING (medico_id = get_medico_id() AND public.check_permiso(auth.uid(), 'gestionar_turnos'));

-- ── bloqueos_agenda ─────────────────────────────────────────────────────────
-- Las tres de escritura comparten el mismo criterio (tenant + gestionar_turnos) desde
-- la migración 033. Las CUATRO están en `TO authenticated` desde la 037 (antes ninguna
-- declaraba TO, o sea que se evaluaban para {public}, `anon` incluido).
--
-- ⚠ bloqueos_select YA NO ES TENANT-ONLY (migración 037): exige permiso, y acepta
--   CUALQUIERA de los dos permisos de agenda. Es deliberado: los 12 permisos son booleanos
--   INDEPENDIENTES y nada obliga a que `gestionar_turnos` implique `ver_turnos`, así que un
--   asistente con `gestionar_turnos` y SIN `ver_turnos` es configurable hoy. Con un USING
--   que pidiera solo `ver_turnos`, a ese asistente se le romperían los endpoints de edición
--   y borrado, que hacen fetch previo y `.select()` de verificación sobre esta misma tabla
--   (src/app/api/turnero/bloqueos/[id]/route.ts). El OR neutraliza ese riesgo por diseño.
-- ✅ `turnos_select` YA ESPEJA ESTE CRITERIO (migración 039): durante dos migraciones esta
--   política y la de `turnos` tuvieron criterios distintos, y ese hueco quedó cerrado. Las
--   dos tablas de la agenda leen con el mismo USING. ✅ Y desde la 042 tampoco las diferencia
--   el ROL: las 4 de acá lo tenían desde la 037 y las 4 de `turnos` se normalizaron ahí. Las
--   dos tablas de la agenda son hoy idénticas en criterio de lectura y en rol.
CREATE POLICY "bloqueos_select" ON public.bloqueos_agenda
  FOR SELECT TO authenticated USING (
    medico_id = get_medico_id()
    AND (
      public.check_permiso(auth.uid(), 'ver_turnos')
      OR public.check_permiso(auth.uid(), 'gestionar_turnos')
    ));
CREATE POLICY "bloqueos_insert" ON public.bloqueos_agenda
  FOR INSERT TO authenticated WITH CHECK (medico_id = get_medico_id() AND public.check_permiso(auth.uid(), 'gestionar_turnos'));
-- bloqueos_update: CREADA por la 033. Nunca existió desde la 005 — ese era el bug raíz
-- (editar un bloqueo no persistía nada y la UI daba falso éxito). Espeja turnos_update.
-- WITH CHECK omitido a propósito, como en turnos_update: en Postgres el USING oficia de
-- check para la fila nueva, así que nadie puede mover un bloqueo a otro tenant.
CREATE POLICY "bloqueos_update" ON public.bloqueos_agenda
  FOR UPDATE TO authenticated USING (medico_id = get_medico_id() AND public.check_permiso(auth.uid(), 'gestionar_turnos'));
-- bloqueos_delete: REEMPLAZADA por la 033 (antes solo-médico, con un subquery inline a
-- profiles en vez de get_user_role(); mismo falso positivo que turnos_delete).
CREATE POLICY "bloqueos_delete" ON public.bloqueos_agenda
  FOR DELETE TO authenticated USING (medico_id = get_medico_id() AND public.check_permiso(auth.uid(), 'gestionar_turnos'));

-- ── turnos_audit_log ────────────────────────────────────────────────────────
-- SELECT permitido al tenant; el INSERT lo hace el trigger (SECURITY DEFINER),
-- no hay política de INSERT para clientes (revocada en la migración 014).
-- ⚠ REESCRITA por la migración 040. Antes resolvía el tenant CON UN JOIN al turno
--   (`EXISTS (SELECT 1 FROM turnos WHERE id = turnos_audit_log.turno_id …)`), así que una
--   fila cuyo turno ya no existe quedaba INVISIBLE PARA TODOS — justo las filas que la 040
--   crea al auditar los DELETE. Ahora lee `medico_id` de la propia fila (desnormalizado).
--   Normalizada además a TO authenticated, siguiendo lo que la 037 hizo con bloqueos_agenda
--   (la política vieja no declaraba TO, o sea que se evaluaba para {public}).
CREATE POLICY "audit_select" ON public.turnos_audit_log
  FOR SELECT TO authenticated USING (medico_id = get_medico_id());

-- ── pedidos ─────────────────────────────────────────────────────────────────
CREATE POLICY "pedidos_select" ON public.pedidos
  FOR SELECT TO authenticated USING (public.check_permiso(auth.uid(), 'ver_pedidos')
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = pedidos.paciente_id AND creado_por = get_medico_id()));
CREATE POLICY "pedidos_insert" ON public.pedidos
  FOR INSERT TO authenticated WITH CHECK (public.check_permiso(auth.uid(), 'crear_pedidos')
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = pedidos.paciente_id AND creado_por = get_medico_id()));
CREATE POLICY "pedidos_update" ON public.pedidos
  FOR UPDATE TO authenticated USING (public.check_permiso(auth.uid(), 'crear_pedidos')
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = pedidos.paciente_id AND creado_por = get_medico_id()));
-- Sin política de DELETE: los pedidos NO se borran, solo se anulan (regla de negocio 5).
-- La política pedidos_delete fue dropeada en la migración 025 (sin DELETE, RLS lo niega).

-- ── certificados ────────────────────────────────────────────────────────────
CREATE POLICY "certificados_select" ON public.certificados
  FOR SELECT TO authenticated USING (public.check_permiso(auth.uid(), 'ver_certificados')
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = certificados.paciente_id AND creado_por = get_medico_id()));
CREATE POLICY "certificados_insert" ON public.certificados
  FOR INSERT TO authenticated WITH CHECK (public.check_permiso(auth.uid(), 'crear_certificados')
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = certificados.paciente_id AND creado_por = get_medico_id()));
CREATE POLICY "certificados_update" ON public.certificados
  FOR UPDATE TO authenticated USING (public.check_permiso(auth.uid(), 'crear_certificados')
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = certificados.paciente_id AND creado_por = get_medico_id()));
-- Sin política de DELETE: los certificados NO se borran, solo se anulan (regla de negocio 5).
-- La política certificados_delete fue dropeada en la migración 025 (sin DELETE, RLS lo niega).

-- ── recetas ─────────────────────────────────────────────────────────────────
-- Los asistentes solo pueden VER; crear/modificar/eliminar es exclusivo del médico.
-- insert/update/delete restaurados por la migración 029 (la base había perdido el
-- chequeo de rol médico). Con la emisión bloqueada por ANMAT y sin endpoint de
-- escritura, la RLS es la ÚNICA defensa de esta tabla.
CREATE POLICY "recetas_select" ON public.recetas
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.pacientes WHERE id = recetas.paciente_id AND creado_por = get_medico_id()));
CREATE POLICY "recetas_insert" ON public.recetas
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role(auth.uid()) = 'medico'
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = recetas.paciente_id AND creado_por = public.get_medico_id()));
CREATE POLICY "recetas_update" ON public.recetas
  FOR UPDATE TO authenticated
  USING (public.get_user_role(auth.uid()) = 'medico'
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = recetas.paciente_id AND creado_por = public.get_medico_id()))
  WITH CHECK (public.get_user_role(auth.uid()) = 'medico'
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = recetas.paciente_id AND creado_por = public.get_medico_id()));
CREATE POLICY "recetas_delete" ON public.recetas
  FOR DELETE TO authenticated
  USING (public.get_user_role(auth.uid()) = 'medico'
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = recetas.paciente_id AND creado_por = public.get_medico_id()));

-- ── difusion_posts ──────────────────────────────────────────────────────────
-- ⚠ PERMISIVAS A PROPÓSITO (decisión de producto, NO es un error de documentación).
--   Las cuatro políticas validan SOLO el tenant: cualquier miembro del tenant
--   (incluidos los asistentes) puede ver, crear, EDITAR y ELIMINAR posts. Los posts de
--   difusión son comunicación del consultorio, no datos clínicos, y el código de la app
--   ya lo asume: src/app/api/difusion/[id]/route.ts (PATCH y DELETE) valida únicamente
--   la pertenencia al tenant, sin chequear rol.
--   Por eso la migración 029 —que restauró el rol médico en recetas/evoluciones/
--   historia_clinica— NO tocó difusión deliberadamente. Si alguna vez se quisiera
--   restringir, hay que agregar un permiso granular de difusión (hoy no existe).
CREATE POLICY "difusion_select" ON public.difusion_posts
  FOR SELECT TO authenticated USING (medico_id = get_medico_id());
CREATE POLICY "difusion_insert" ON public.difusion_posts
  FOR INSERT TO authenticated WITH CHECK (medico_id = get_medico_id());
CREATE POLICY "difusion_update" ON public.difusion_posts
  FOR UPDATE TO authenticated USING (medico_id = get_medico_id());
CREATE POLICY "difusion_delete" ON public.difusion_posts
  FOR DELETE TO authenticated USING (medico_id = get_medico_id());

-- ── difusion_envios ─────────────────────────────────────────────────────────
CREATE POLICY "envios_select" ON public.difusion_envios
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.difusion_posts WHERE id = difusion_envios.post_id AND medico_id = get_medico_id()));
CREATE POLICY "envios_insert" ON public.difusion_envios
  FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.difusion_posts WHERE id = difusion_envios.post_id AND medico_id = get_medico_id()));

-- ── solicitudes_asistente ───────────────────────────────────────────────────
CREATE POLICY "solicitudes_select" ON public.solicitudes_asistente
  FOR SELECT TO authenticated USING (solicitante_id = auth.uid() OR medico_id = auth.uid());
CREATE POLICY "solicitudes_insert" ON public.solicitudes_asistente
  FOR INSERT TO authenticated WITH CHECK (solicitante_id = auth.uid());
CREATE POLICY "solicitudes_update" ON public.solicitudes_asistente
  FOR UPDATE TO authenticated USING (medico_id = auth.uid());

-- ── notas ───────────────────────────────────────────────────────────────────
CREATE POLICY "notas_select_own" ON public.notas FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notas_insert_own" ON public.notas FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "notas_update_own" ON public.notas FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "notas_delete_own" ON public.notas FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ── mensajes_internos ───────────────────────────────────────────────────────
-- Las CUATRO reescritas por la migración 046 (con ALTER POLICY: cambió solo la expresión,
-- el rol ya era `authenticated` desde la 042). Dos cambios transversales:
--   · TODAS exigen ahora `check_permiso(auth.uid(), 'acceso_mensajeria')` — ninguna lo hacía.
--     ⚠ NO deja afuera al titular: check_permiso() corta con TRUE si el rol es 'medico',
--     antes de leer una sola columna de permiso.
--   · El TENANT se aplica al mensaje entero y no solo a la rama grupal.
CREATE POLICY "mensajes_ver" ON public.mensajes_internos
  FOR SELECT TO authenticated USING (
    public.check_permiso(auth.uid(), 'acceso_mensajeria')
    AND medico_id = get_medico_id()
    AND (
      remitente_id = auth.uid()
      OR (NOT es_grupal AND destinatario_id = auth.uid())
      OR es_grupal));
CREATE POLICY "mensajes_insertar" ON public.mensajes_internos
  FOR INSERT TO authenticated WITH CHECK (
    public.check_permiso(auth.uid(), 'acceso_mensajeria')
    AND remitente_id = auth.uid()
    AND medico_id = get_medico_id());
-- ⚠ El `NOT es_grupal` se CONSERVA y no hay que "arreglarlo": los grupales no admiten UPDATE
-- por diseño (su lectura se registra en `mensajes_lecturas`, una fila por usuario).
CREATE POLICY "mensajes_marcar_leido" ON public.mensajes_internos
  FOR UPDATE TO authenticated
  USING (
    public.check_permiso(auth.uid(), 'acceso_mensajeria')
    AND medico_id = get_medico_id()
    AND NOT es_grupal
    AND destinatario_id = auth.uid())
  WITH CHECK (
    public.check_permiso(auth.uid(), 'acceso_mensajeria')
    AND medico_id = get_medico_id()
    AND NOT es_grupal
    AND destinatario_id = auth.uid());
-- ⚠ `medico_id = auth.uid()` se conserva TAL CUAL y NO se cambia por get_medico_id(): con
-- auth.uid() entra SOLO el médico titular; con get_medico_id() entrarían sus asistentes, que
-- resuelven al mismo tenant. Es lo que restringe el borrado al titular (regla de la 020).
-- ⚠⚠ ASIMETRÍA DELIBERADA (desde la 046): el titular PUEDE BORRAR un individual entre dos de
-- sus asistentes pero NO PUEDE LEERLO (`mensajes_ver` solo deja ver los individuales a
-- remitente y destinatario). Hasta la 046 era accidental; ahora es una decisión de producto
-- sobre privacidad. NO "corregirlo" sin tomarla explícitamente. Ver CLAUDE.md → nota 29,
-- que documenta también su consecuencia sobre un `DELETE … RETURNING`.
CREATE POLICY "mensajes_borrar" ON public.mensajes_internos
  FOR DELETE TO authenticated USING (
    public.check_permiso(auth.uid(), 'acceso_mensajeria')
    AND (remitente_id = auth.uid() OR medico_id = auth.uid()));

-- ── mensajes_lecturas ───────────────────────────────────────────────────────
-- ⚠ Estas DOS quedaron FUERA de la migración 046, a propósito: la tabla no tiene columna de
-- tenant (mensaje_id, user_id, leido_at) y ya acotan a `user_id = auth.uid()`, o sea que un
-- usuario solo ve SUS PROPIAS lecturas — no hay fuga. Aplicarles el criterio pediría un
-- EXISTS contra `mensajes_internos` (patrón `estudios`), y se decide aparte.
-- ⚠ Sigue sin política de UPDATE: los upserts van con `ignoreDuplicates`.
CREATE POLICY "lecturas_select_own" ON public.mensajes_lecturas
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "lecturas_insert_own" ON public.mensajes_lecturas
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ STORAGE — buckets privados `estudios` (mig. 026) y `documentos` (mig. 027) │
-- └──────────────────────────────────────────────────────────────────────────┘
-- Dos buckets creados por migración. El bucket `difusion` (imágenes de posts) NO
-- existe todavía (ver PENDIENTES.md → Bloque A).
--
-- ── Bucket `estudios` (migración 026) ───────────────────────────────────────
-- Bucket PRIVADO (public = false): los objetos solo se acceden vía RLS / proxy del
-- servidor, nunca por URL pública. Límite 10 MB por archivo; MIME acotado a
-- pdf/jpeg/png/webp (validado también en el bucket, no solo en la app).
--   Ruta de los objetos: {medico_id}/{paciente_id}/{uuid}.{ext}
--   El medico_id va PRIMERO a propósito: las políticas aíslan por tenant comparando
--   la primera carpeta contra get_medico_id(), sin JOIN contra `pacientes`.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('estudios', 'estudios', false, 10485760,
        ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Políticas RLS sobre storage.objects (bucket `estudios`), rol authenticated.
-- select/insert/update: dentro del tenant + con permiso ver_historia_clinica.
-- delete: solo el MÉDICO dueño del tenant. NO se usa auth.role()='authenticated' a
-- secas (eso dejaría a cualquier tenant descargar conociendo el path).
-- storage.foldername(name)[1] es el medico_id (primer segmento de la ruta).
CREATE POLICY "estudios_objects_select" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'estudios'
    AND (storage.foldername(name))[1] = public.get_medico_id()::text
    AND public.check_permiso(auth.uid(), 'ver_historia_clinica'));
CREATE POLICY "estudios_objects_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'estudios'
    AND (storage.foldername(name))[1] = public.get_medico_id()::text
    AND public.check_permiso(auth.uid(), 'ver_historia_clinica'));
CREATE POLICY "estudios_objects_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'estudios'
    AND (storage.foldername(name))[1] = public.get_medico_id()::text
    AND public.check_permiso(auth.uid(), 'ver_historia_clinica'))
  WITH CHECK (
    bucket_id = 'estudios'
    AND (storage.foldername(name))[1] = public.get_medico_id()::text
    AND public.check_permiso(auth.uid(), 'ver_historia_clinica'));
CREATE POLICY "estudios_objects_delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'estudios'
    AND (storage.foldername(name))[1] = public.get_medico_id()::text
    AND public.get_user_role(auth.uid()) = 'medico');


-- ── Bucket `documentos` (migración 027) ─────────────────────────────────────
-- PDFs CONGELADOS de pedidos y certificados. El PDF se genera una sola vez al
-- emitir y se sube acá; las descargas sirven ese objeto tal cual (documento fiel e
-- inmutable). Bucket PRIVADO, límite 5 MB, MIME solo application/pdf.
--   Ruta de los objetos: {medico_id}/{tipo}/{documento_id}.pdf, con tipo ∈ {pedido,
--   certificado}. Path DETERMINÍSTICO (sin UUID aleatorio): regenerar pisa el mismo
--   objeto vía upsert. El medico_id va PRIMERO: las políticas aíslan por tenant
--   comparando la primera carpeta contra get_medico_id().
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documentos', 'documentos', false, 5242880, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Políticas RLS sobre storage.objects (bucket `documentos`), rol authenticated.
-- select: tenant + (ver_pedidos OR ver_certificados). La autorización fina la hace
-- el endpoint: consulta la fila con el cliente de sesión (RLS de la tabla exige el
-- permiso específico) antes de bajar el objeto, así que conocer el path ya implica
-- tener el permiso correcto. insert/update: tenant + (crear_pedidos OR crear_certificados).
-- UPDATE hace falta porque la subida usa upsert:true sobre el path determinístico.
CREATE POLICY "documentos_objects_select" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'documentos'
    AND (storage.foldername(name))[1] = public.get_medico_id()::text
    AND (public.check_permiso(auth.uid(), 'ver_pedidos')
      OR public.check_permiso(auth.uid(), 'ver_certificados')));
CREATE POLICY "documentos_objects_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'documentos'
    AND (storage.foldername(name))[1] = public.get_medico_id()::text
    AND (public.check_permiso(auth.uid(), 'crear_pedidos')
      OR public.check_permiso(auth.uid(), 'crear_certificados')));
CREATE POLICY "documentos_objects_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documentos'
    AND (storage.foldername(name))[1] = public.get_medico_id()::text
    AND (public.check_permiso(auth.uid(), 'crear_pedidos')
      OR public.check_permiso(auth.uid(), 'crear_certificados')))
  WITH CHECK (
    bucket_id = 'documentos'
    AND (storage.foldername(name))[1] = public.get_medico_id()::text
    AND (public.check_permiso(auth.uid(), 'crear_pedidos')
      OR public.check_permiso(auth.uid(), 'crear_certificados')));
-- ⚠ NO hay política de DELETE para `documentos`, Y ES DELIBERADO (regla de negocio 5):
--   los documentos emitidos no se borran nunca, solo se anulan (estado='revocado').
--   Sin política, RLS niega el DELETE por defecto para `authenticated`. Difiere de
--   `estudios`, que sí permite DELETE al médico (un adjunto se pudo subir por error;
--   un instrumento firmado ya circuló).
--   Nota operativa: los objetos de Storage NO se borran por SQL directo — un trigger
--   de protección (storage.protect_delete) bloquea DELETE FROM storage.objects. Se
--   borran por la API de Storage o el Dashboard.


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ RATE LIMITING — tabla `rate_limits` + función (migración 031)              │
-- └──────────────────────────────────────────────────────────────────────────┘
-- Rate limiter respaldado por Postgres: reemplaza al que vivía en un Map en memoria
-- del proceso, que en Vercel serverless no compartía contadores entre instancias (el
-- login quedaba sin protección real de fuerza bruta). El módulo src/lib/rate-limit.ts
-- llama a check_rate_limit con el ADMIN CLIENT (service role), porque el login ocurre
-- SIN sesión. Fail-open en la app: si la RPC falla/tarda, se permite el request.
--
-- Fixed-window counter: una fila por (key, window_start), no una por request.
CREATE TABLE public.rate_limits (
  key          TEXT        NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,   -- floor del epoch al tamaño de ventana
  count        INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
-- Índice para la limpieza barata de ventanas viejas (la hace el cron de recordatorios:
-- DELETE FROM rate_limits WHERE window_start < now() - interval '1 hour').
CREATE INDEX idx_rate_limits_window_start ON public.rate_limits(window_start);

-- ⚠ RLS habilitado SIN políticas, A PROPÓSITO (mismo criterio que la ausencia de DELETE
--   en el bucket `documentos`): sin políticas, RLS deniega por defecto todo acceso de
--   `anon`/`authenticated` por PostgREST, así nadie lee las keys de otros ni resetea su
--   propio contador. El único acceso es vía la función SECURITY DEFINER de abajo.
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Conteo atómico + decisión. SECURITY DEFINER + search_path fijo. El incremento y la
-- lectura ocurren en UN solo statement (INSERT ... ON CONFLICT DO UPDATE ... RETURNING),
-- bajo el row-lock de la fila → evita el TOCTOU de "SELECT count(); luego INSERT", donde
-- dos requests concurrentes leen ambos un valor bajo el límite y ambos pasan.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key TEXT, p_limit INT, p_window_secs INT
)
RETURNS TABLE(allowed BOOLEAN, retry_after_secs INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_window_start TIMESTAMPTZ := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_secs) * p_window_secs);
  v_count INT;
BEGIN
  INSERT INTO public.rate_limits AS rl (key, window_start, count)
  VALUES (p_key, v_window_start, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET count = rl.count + 1
  RETURNING rl.count INTO v_count;

  IF v_count > p_limit THEN
    RETURN QUERY SELECT FALSE, GREATEST(
      CEIL(extract(epoch FROM (v_window_start + make_interval(secs => p_window_secs)) - now()))::INT, 0);
  ELSE
    RETURN QUERY SELECT TRUE, 0;
  END IF;
END;
$$;

-- La función escribe en una tabla de control de acceso → solo el servidor la invoca.
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INT, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INT, INT) TO service_role;
GRANT  EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INT, INT) TO postgres;


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ REALTIME — publicación `supabase_realtime` (migs. 023 y 032)               │
-- └──────────────────────────────────────────────────────────────────────────┘
-- Estado de la replicación lógica que alimenta el Realtime de Supabase.
-- NO se declara con CREATE acá: la publicación `supabase_realtime` la administra
-- Supabase y las migraciones solo le AGREGAN tablas. Esta sección documenta el
-- estado verificado contra la base, no una estructura a recrear.
--
-- Tablas en la publicación:
--   · public.mensajes_internos  → agregada por la migración 023 (solo INSERT).
--     Verificado en la base: aparece en pg_publication_tables con pubname =
--     'supabase_realtime' y pubinsert = true.
--
-- REPLICA IDENTITY:
--   · public.mensajes_internos → FULL (migración 032). Verificado: pg_class.
--     relreplident = 'f' (antes 'd' = DEFAULT, solo PK).
--     Motivo: el canal de la campanita se suscribe filtrando por `medico_id`, que
--     NO es la PK; con identidad DEFAULT la fila replicada no lleva esa columna y
--     el filtro no se puede evaluar. Costo aceptado: UPDATE/DELETE escriben la fila
--     vieja completa en el WAL (volumen despreciable en esta tabla).
--   · El resto de las tablas conserva REPLICA IDENTITY DEFAULT.
--
-- ⚠ ESTADO FUNCIONAL: el Realtime de `mensajes_internos` NO ENTREGA EVENTOS.
--   La 032 se aplicó y su efecto en la base es el esperado ('f'), pero la hipótesis
--   que la motivaba —que el filtro por `medico_id` era lo que descartaba el evento—
--   quedó REFUTADA: con la migración aplicada el evento sigue sin llegar, y tampoco
--   llega sin filtro ni con una policy permisiva USING(true). El diagnóstico descartó
--   por experimento todo lo que depende de la base (publicación, replica identity,
--   RLS, GRANTs, persistencia de la tabla, forma del INSERT), así que la causa quedó
--   acotada a INFRAESTRUCTURA del servicio Realtime del proyecto, fuera de este
--   esquema y fuera del código de la app. Trabajo DIFERIDO — detalle completo,
--   lista de descartes y próximo paso en PENDIENTES.md → Bloque A.
--
--   No revertir la 032 por esto: deja la tabla en el estado que el filtro necesita
--   cuando el servicio vuelva a entregar. Reversible con
--   `ALTER TABLE public.mensajes_internos REPLICA IDENTITY DEFAULT;`.
--
-- Verificación:
--   SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
--   SELECT relname, relreplident FROM pg_class WHERE relname = 'mensajes_internos';


-- ============================================================================
-- FIN DEL SNAPSHOT
-- ============================================================================
