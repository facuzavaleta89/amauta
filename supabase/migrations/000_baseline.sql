-- ███████████████████████████████████████████████████████████████████████████████
-- ⚠⚠  ESTE ARCHIVO NUNCA SE EJECUTÓ CONTRA NINGUNA BASE — NO ESTÁ VERIFICADO
-- ███████████████████████████████████████████████████████████████████████████████
--
--   Se generó LEYENDO la base de producción y se comparó contra el catálogo objeto por
--   objeto —tablas, columnas, tipos, constraints, índices, políticas, funciones,
--   triggers, buckets y catálogo—, con CERO diferencias. Pero COMPARAR NO ES VERIFICAR:
--   ese diff prueba que los objetos están y se llaman igual, NO que el archivo corra ni
--   que haga lo mismo.
--
--   ⚠ EL RIESGO CONCRETO ESTÁ EN LAS POLÍTICAS DE SEGURIDAD (§8). Postgres NORMALIZA Y
--     REESCRIBE las expresiones de RLS al guardarlas, así que lo que está escrito acá no
--     es lo que escribió nadie: es texto RECONSTRUIDO por el parser, copiado de la base
--     y además REFORMATEADO para que se lea (saltos de línea, indentación, algún
--     paréntesis redundante quitado). Si en alguna de las 72 políticas ese reformateo
--     corrió la precedencia de un AND frente a un OR, NADA LO DELATA: la política
--     existe, se llama igual, pasa cualquier diff de nombres… y AUTORIZA DISTINTO.
--     Un cambio de precedencia NO SE DETECTA LEYENDO.
--
--   PARA DARLO POR VERIFICADO hacen falta dos pasos, en orden y sin saltear:
--     1. Correrlo entero sobre un proyecto Supabase NUEVO Y VACÍO, sin errores — y una
--        SEGUNDA VEZ SEGUIDA, para probar que es idempotente.
--     2. Comparar AUTOMÁTICAMENTE el catálogo de esa base contra el de producción,
--        incluyendo las expresiones CRUDAS de las políticas (`pg_policies.qual` y
--        `.with_check`) y las definiciones CRUDAS de las funciones
--        (`pg_get_functiondef`). Postgres normaliza las dos bases igual, así que si las
--        expresiones son equivalentes el texto sale idéntico y el diff da vacío.
--        ⚠ SIN LEER NADA A OJO: leer es exactamente lo que no detecta el problema de
--        arriba.
--
--   HASTA QUE ESOS DOS PASOS ESTÉN HECHOS, un entorno levantado con este baseline NO
--   DEBE CONSIDERARSE EQUIVALENTE A PRODUCCIÓN.
--
--   ── Detalle completo: `_historico/README.md`, en el aviso de su encabezado.
-- ███████████████████████████████████████████████████████████████████████████████
--
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- 000_baseline.sql — BASELINE CONSOLIDADO DEL ESQUEMA DE AMAUTA
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- QUÉ ES
--   Un archivo único que, corrido sobre un proyecto Supabase NUEVO Y VACÍO, produce
--   el esquema que hoy tiene producción. Reemplaza a la secuencia 001–048 como punto
--   de partida — la 048 (drop de `turnos.color`) YA ESTÁ INCORPORADA acá, así que un
--   entorno nuevo NO tiene que correrla aparte.
--   Las 49 migraciones históricas se conservan en `_historico/` (ver su
--   README): son el registro de las decisiones del proyecto, no un script ejecutable.
--
-- ⚠ NO SE APLICA A PRODUCCIÓN. Producción ya tiene este esquema. Este archivo existe
--   para entornos NUEVOS (un clon de desarrollo, un staging, una reinstalación).
--
-- CÓMO SE GENERÓ
--   LEYENDO LA BASE VIVA (pg_catalog: pg_class, pg_attribute, pg_constraint, pg_index,
--   pg_policies, pg_proc, pg_trigger, pg_publication, storage.buckets), NO transcribiendo
--   las migraciones. Ese es el punto: la transcripción manual es lo que produjo el drift
--   que este archivo cierra. Donde la base y las migraciones difieran, MANDA LA BASE.
--
-- ORDEN INTERNO (importa: el archivo corre de arriba abajo sin errores de dependencia)
--   §1  Extensiones
--   §2  Tipos ENUM
--   §3  Función de trigger sin dependencias (set_updated_at)
--   §4  Tablas, en orden de dependencia de FK, con sus constraints y comentarios
--   §5  Funciones que leen tablas (helpers de RLS, triggers, RPC)
--   §6  Índices
--   §7  Triggers
--   §8  RLS: habilitación y políticas
--   §9  Storage: buckets y políticas sobre storage.objects
--   §10 Trigger sobre auth.users
--   §11 Realtime: publicación e identidad de réplica
--   §12 Permisos de ejecución sobre funciones de acceso restringido
--   §13 Carga inicial del catálogo
--
--   ⚠ Las funciones `LANGUAGE sql` SÍ se validan al crearse (a diferencia de las
--     plpgsql, cuyo cuerpo no se parsea). `get_medico_id`, `get_user_role`,
--     `get_user_medico_id` y las dos `check_asistente_*` leen `public.profiles`, así
--     que van DESPUÉS de las tablas (§5), no antes. Y las políticas del §8 van después
--     del §5 porque las invocan.
--
-- IDEMPOTENCIA
--   Donde tiene sentido: `IF NOT EXISTS` en tablas, índices y extensiones;
--   `CREATE OR REPLACE` en funciones; `DROP … IF EXISTS` + `CREATE` en políticas y
--   triggers (no existe `CREATE POLICY IF NOT EXISTS`); `ON CONFLICT DO NOTHING` en
--   el catálogo; bloques `DO` para los tipos ENUM y la publicación de Realtime.
--   ⚠ Los constraints van con NOMBRE EXPLÍCITO, incluso los que hoy tienen nombre
--     autogenerado por Postgres, y con el nombre que hoy tiene la base viva: así el
--     nombre deja de depender de cómo los bautizó Postgres y un `DROP CONSTRAINT`
--     futuro apunta a algo estable. (Es lo que hizo tropezar a las migraciones 034 y
--     043, que dropean por nombre autogenerado y sin `IF EXISTS`.)
--
-- LO QUE NO INCLUYE
--   Datos de las tablas de negocio. Solo estructura + el catálogo `obras_sociales`.
--
-- ═══════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════
-- §1 · EXTENSIONES
-- ═══════════════════════════════════════════════════════════════════════════════
-- En el esquema `extensions`, que es donde Supabase las instala por defecto. Importa:
-- varias tablas usan `extensions.uuid_generate_v4()` como DEFAULT con el esquema
-- CALIFICADO, así que la extensión tiene que estar exactamente ahí.
-- (`pgcrypto` aporta `gen_random_uuid()`, el DEFAULT de las tablas más nuevas —
--  consultas, notas, notificaciones, mensajes_internos. La convivencia de las dos
--  formas es histórica y se reproduce tal cual está en la base.)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto   WITH SCHEMA extensions;


-- ═══════════════════════════════════════════════════════════════════════════════
-- §2 · TIPOS ENUM
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠ Son ENUM de verdad en la base, no TEXT con CHECK.
--   El orden de los valores es el `enumsortorder` real: importa para `ORDER BY` sobre
--   estas columnas y para agregar valores nuevos (`ALTER TYPE … ADD VALUE … BEFORE/AFTER`).
-- No existe `CREATE TYPE IF NOT EXISTS`: van en bloques DO.

DO $$ BEGIN
  CREATE TYPE public.turno_estado AS ENUM (
    'pendiente', 'confirmado', 'presente', 'ausente',
    'cancelado', 'reprogramado', 'pendiente_confirmar'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ⚠ Cuáles de estos estados OCUPAN una franja de la agenda NO se decide acá: el
--   criterio único vive en `src/lib/agenda/solapamiento.ts`, como un Record exhaustivo
--   que deja de compilar si se suma un valor al ENUM sin decidir si ocupa.
--   Ver CLAUDE.md → nota técnica 23.

DO $$ BEGIN
  CREATE TYPE public.certificado_tipo AS ENUM (
    'aptitud_fisica', 'reposo', 'diagnostico', 'libre_deuda', 'otro'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.difusion_estado AS ENUM (
    'borrador', 'listo', 'enviado', 'archivado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.difusion_canal AS ENUM ('email', 'whatsapp', 'ambos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ⚠ `whatsapp` y `ambos` existen en el tipo, pero el canal WhatsApp NO está
--   implementado: la app solo envía por email. Valor previsto, no capacidad disponible.


-- ═══════════════════════════════════════════════════════════════════════════════
-- §3 · FUNCIÓN DE TRIGGER SIN DEPENDENCIAS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Toca `updated_at` en cada UPDATE. La usan 13 triggers BEFORE UPDATE (§7).
-- ⚠ Es la ÚNICA función del esquema que es SECURITY INVOKER y sin `search_path` fijo,
--   y está bien así: no lee ninguna tabla —solo escribe un campo de NEW—, así que no
--   hay superficie de search_path que fijar. La migración 029 dropeó su duplicada
--   (`update_updated_at_column`) y unificó todos los triggers en ésta.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- §4 · TABLAS
-- ═══════════════════════════════════════════════════════════════════════════════
-- En orden de dependencia de FK. Todos los constraints con nombre explícito.
-- 21 tablas · 286 columnas · 21 PK · 7 UNIQUE · 12 CHECK · 43 FK.


-- ── obras_sociales ────────────────────────────────────────────────────────────
-- Catálogo de coberturas, de lectura pública para cualquier usuario autenticado.
-- NO tiene tenant: es compartido por toda la instalación.
--
-- ⚠ NO TIENE —NI DEBE TENER— UNA FILA PARA "PARTICULAR / SIN OBRA SOCIAL".
--   Un paciente particular se modela como AUSENCIA de dato: `obra_social_id IS NULL`
--   Y `obra_social_otro` nulo o en blanco. El catálogo enumera coberturas, y "no tener
--   cobertura" no es una cobertura. La fila homónima existió (la sembraba la 001) y la
--   eliminó la migración 045, después de reapuntar a NULL los pacientes que la usaban.
--   El literal de presentación vive UNA vez, en `SIN_OBRA_SOCIAL_LABEL`
--   (`src/lib/pacientes/obra-social.ts`), y se aplica en cada CONSUMIDOR, nunca dentro
--   de `resolverObraSocial`. Ver CLAUDE.md → nota técnica 28.
--   Consecuencia visible en el §13: el catálogo tiene un HUECO en el id 13.
CREATE TABLE IF NOT EXISTS public.obras_sociales (
  id     SERIAL,
  nombre TEXT NOT NULL,
  CONSTRAINT obras_sociales_pkey       PRIMARY KEY (id),
  CONSTRAINT obras_sociales_nombre_key UNIQUE (nombre)
);


-- ── profiles ──────────────────────────────────────────────────────────────────
-- Extiende `auth.users`. Es la tabla de USUARIOS DEL SISTEMA y NO pertenece a ningún
-- tenant: acá viven tanto el médico titular (role='medico', medico_id NULL, su propio
-- `id` ES el tenant key) como los asistentes (role='asistente', medico_id = UUID del
-- médico). La fila la crea el trigger `on_auth_user_created` (§10).
CREATE TABLE IF NOT EXISTS public.profiles (
  id                   UUID NOT NULL,
  full_name            TEXT NOT NULL,
  role                 TEXT NOT NULL DEFAULT 'asistente',
  avatar_url           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  medico_id            UUID,
  firma_url            TEXT,

  -- Permisos legacy del Bloque 2, reemplazados por los 12 granulares de más abajo.
  -- Se conservan por compatibilidad; ninguna política ni endpoint los lee.
  puede_ver_historias  BOOLEAN DEFAULT false,
  puede_editar_agenda  BOOLEAN DEFAULT false,

  -- Deprecada: usar `matriculas` (JSONB). Ver el ⚠ de más abajo.
  matricula            TEXT,
  matriculas           JSONB DEFAULT '[]'::jsonb,
  titulo               TEXT,
  logo_url             TEXT,

  -- Los 12 permisos granulares (migración 015). Default FALSE = fail-closed.
  -- ⚠ La columna se llama `editar_pacientes`, NO `gestionar_pacientes`.
  ver_pacientes        BOOLEAN NOT NULL DEFAULT false,
  editar_pacientes     BOOLEAN NOT NULL DEFAULT false,
  ver_historia_clinica BOOLEAN NOT NULL DEFAULT false,
  crear_consultas      BOOLEAN NOT NULL DEFAULT false,
  finalizar_consultas  BOOLEAN NOT NULL DEFAULT false,
  ver_turnos           BOOLEAN NOT NULL DEFAULT false,
  gestionar_turnos     BOOLEAN NOT NULL DEFAULT false,
  ver_pedidos          BOOLEAN NOT NULL DEFAULT false,
  crear_pedidos        BOOLEAN NOT NULL DEFAULT false,
  ver_certificados     BOOLEAN NOT NULL DEFAULT false,
  crear_certificados   BOOLEAN NOT NULL DEFAULT false,
  acceso_mensajeria    BOOLEAN NOT NULL DEFAULT false,

  dni                  TEXT,

  CONSTRAINT profiles_pkey       PRIMARY KEY (id),
  CONSTRAINT profiles_dni_key    UNIQUE (dni),
  CONSTRAINT profiles_role_check CHECK (role = ANY (ARRAY['medico'::text, 'asistente'::text])),
  CONSTRAINT profiles_id_fkey        FOREIGN KEY (id)        REFERENCES auth.users(id)      ON DELETE CASCADE,
  CONSTRAINT profiles_medico_id_fkey FOREIGN KEY (medico_id) REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- ⚠ `profiles_dni_key` es UNIQUE **GLOBAL**, y eso es DELIBERADO: acá el DNI identifica
--   al DUEÑO DE LA CUENTA en toda la instalación, no a un tercero. Contrastar con
--   `pacientes_creado_por_dni_key`, que es UNIQUE **POR TENANT** por el motivo opuesto.
--   No unificarlas. La columna es nullable y en un índice único los NULL no se comparan
--   entre sí, así que conviven los perfiles sin DNI — pero por eso mismo vacío se guarda
--   NULL y nunca `''` (las cadenas vacías SÍ colisionan). Migración 044.
--   Un paciente y un profesional PUEDEN compartir DNI: son tablas distintas y no hay
--   —ni debe haber— chequeo cruzado. Ver CLAUDE.md → nota técnica 27.
--
-- ⚠ Y por la misma nota: NO agregar un UNIQUE sobre el número de matrícula. En Argentina
--   los números se repiten entre jurisdicciones y un profesional puede tener varias a la
--   vez: por eso `matriculas` es un array JSONB [{tipo, numero}] y no una columna escalar.
--   Un UNIQUE sobre el número solo rechazaría altas válidas. Está cerrado como DESCARTADO
--   en PENDIENTES.md.

COMMENT ON COLUMN public.profiles.firma_url            IS 'Firma digitalizada del médico (base64)';
COMMENT ON COLUMN public.profiles.puede_ver_historias  IS 'Permiso del asistente para ver historias clínicas';
COMMENT ON COLUMN public.profiles.puede_editar_agenda  IS 'Permiso del asistente para modificar la agenda';
COMMENT ON COLUMN public.profiles.matricula            IS 'Matrícula médica provincial o nacional (ej: MN 123456)';
COMMENT ON COLUMN public.profiles.ver_pacientes        IS 'Asistente: puede ver el listado de pacientes';
COMMENT ON COLUMN public.profiles.editar_pacientes     IS 'Asistente: puede crear y modificar pacientes';
COMMENT ON COLUMN public.profiles.ver_historia_clinica IS 'Asistente: puede ver la historia clínica y consultas';
COMMENT ON COLUMN public.profiles.crear_consultas      IS 'Asistente: puede crear nuevas consultas en borrador';
COMMENT ON COLUMN public.profiles.finalizar_consultas  IS 'Asistente: puede finalizar consultas (borrador → finalizada)';
COMMENT ON COLUMN public.profiles.ver_turnos           IS 'Asistente: puede ver la agenda de turnos';
COMMENT ON COLUMN public.profiles.gestionar_turnos     IS 'Asistente: puede crear, editar y cancelar turnos';
COMMENT ON COLUMN public.profiles.ver_pedidos          IS 'Asistente: puede ver pedidos de estudios';
COMMENT ON COLUMN public.profiles.crear_pedidos        IS 'Asistente: puede crear pedidos de estudios';
COMMENT ON COLUMN public.profiles.ver_certificados     IS 'Asistente: puede ver certificados médicos';
COMMENT ON COLUMN public.profiles.crear_certificados   IS 'Asistente: puede crear certificados médicos';
COMMENT ON COLUMN public.profiles.acceso_mensajeria    IS 'Asistente: acceso al módulo de mensajería (preparado para uso futuro)';
COMMENT ON COLUMN public.profiles.dni                  IS 'DNI del profesional (médico o asistente). OPCIONAL: la ley argentina no lo exige para historia clínica ni certificados — el identificador legal del ejercicio es la matrícula (profiles.matriculas). Se carga en la edición de perfil, nunca en el registro. ⚠ NO es el DNI del paciente (ver pacientes.dni). Migración 044.';


-- ── pacientes ─────────────────────────────────────────────────────────────────
-- ⚠ ES LA ÚNICA TABLA DE NEGOCIO CUYA CLAVE DE TENANT NO SE LLAMA `medico_id`: acá el
--   tenant es `creado_por`. Es histórico (nació con la 001, antes de que el resto
--   estandarizara `medico_id`) y no se renombró porque la columna aparece en el `USING`
--   de todas las políticas que cuelgan de pacientes —historia_clinica, estudios,
--   evoluciones, pedidos, certificados, recetas la referencian vía EXISTS—. Renombrarla
--   sería reescribir una docena de políticas para ganar simetría de nombres.
CREATE TABLE IF NOT EXISTS public.pacientes (
  id               UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
  dni              TEXT NOT NULL,
  nombre_completo  TEXT NOT NULL,
  fecha_nacimiento DATE NOT NULL,
  sexo             TEXT NOT NULL,
  telefono         TEXT,
  email            TEXT,
  provincia        TEXT,
  ciudad           TEXT,
  obra_social_id   INTEGER,
  obra_social_otro TEXT,
  numero_afiliado  TEXT,
  creado_por       UUID NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  archivado_at     TIMESTAMPTZ,
  CONSTRAINT pacientes_pkey                PRIMARY KEY (id),
  CONSTRAINT pacientes_creado_por_dni_key  UNIQUE (creado_por, dni),
  CONSTRAINT pacientes_sexo_check          CHECK (sexo = ANY (ARRAY['masculino'::text, 'femenino'::text, 'otro'::text])),
  CONSTRAINT pacientes_creado_por_fkey     FOREIGN KEY (creado_por)     REFERENCES public.profiles(id),
  CONSTRAINT pacientes_obra_social_id_fkey FOREIGN KEY (obra_social_id) REFERENCES public.obras_sociales(id)
);

-- ⚠ `pacientes_creado_por_dni_key` es UNIQUE **POR TENANT**, no global — al revés que
--   `profiles_dni_key`. `pacientes` es multi-tenant y el DNI describe a un TERCERO
--   registrado por un médico: la misma persona puede ser paciente de dos consultorios
--   sin relación entre sí. La constraint global original (`pacientes_dni_key`) era un
--   bug de modelo: el primer médico que cargaba un DNI se lo reservaba para toda la
--   instalación. Migración 043. Ver CLAUDE.md → nota técnica 27.
--
-- ⚠ `archivado_at`: los pacientes SE ARCHIVAN, NO SE BORRAN (Ley 26.529, conservación
--   de la HC). El borrado físico es la excepción y solo aplica a pacientes sin ninguna
--   actuación; el criterio exacto vive en `DELETE /api/pacientes/[id]`, no en la base.
--   Regla de negocio 9.


-- ── historia_clinica ──────────────────────────────────────────────────────────
-- ⚠ TABLA DORMIDA. Es el MODELO VIEJO de HC (un documento único de antecedentes, 1:1
--   con el paciente). LA APP YA NO LA LEE NI LA ESCRIBE desde el Grupo 2: se dieron de
--   baja el endpoint POST /api/pacientes/[id]/historia y el insert de fila vacía del
--   alta de pacientes. La unidad de actuación clínica hoy es `consultas`.
--   NO SE DROPEÓ —y no hay que dropearla— por la Ley 26.529: conserva filas históricas
--   que deben preservarse. Se recrea acá para que un entorno nuevo sea idéntico a
--   producción, aunque nazca vacía y así se quede.
CREATE TABLE IF NOT EXISTS public.historia_clinica (
  id                        UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
  paciente_id               UUID NOT NULL,
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
  proximo_control           TIMESTAMPTZ,
  peso_inicial              NUMERIC(5,2),
  talla                     NUMERIC(5,2),
  perimetro_cintura         NUMERIC(5,2),
  creado_por                UUID NOT NULL,
  updated_by                UUID,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT historia_clinica_pkey             PRIMARY KEY (id),
  CONSTRAINT historia_clinica_paciente_id_key  UNIQUE (paciente_id),
  CONSTRAINT historia_clinica_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE,
  CONSTRAINT historia_clinica_creado_por_fkey  FOREIGN KEY (creado_por)  REFERENCES public.profiles(id),
  CONSTRAINT historia_clinica_updated_by_fkey  FOREIGN KEY (updated_by)  REFERENCES public.profiles(id)
);


-- ── consultas ─────────────────────────────────────────────────────────────────
-- Consultas cronológicas de HC (Bloque 1, diabetología). Es la UNIDAD DE ACTUACIÓN
-- CLÍNICA del modelo vigente.
CREATE TABLE IF NOT EXISTS public.consultas (
  id                     UUID NOT NULL DEFAULT gen_random_uuid(),
  paciente_id            UUID NOT NULL,
  medico_id              UUID NOT NULL,
  fecha_hora             TIMESTAMPTZ NOT NULL DEFAULT now(),
  motivo_consulta        TEXT,
  anamnesis              TEXT,
  peso_kg                NUMERIC(5,2),
  talla_cm               NUMERIC(5,1),
  ta_sistolica           INTEGER,
  ta_diastolica          INTEGER,
  frecuencia_cardiaca    INTEGER,
  temperatura            NUMERIC(4,1),
  glucemia_ayunas        NUMERIC(6,2),
  glucemia_postprandial  NUMERIC(6,2),
  hba1c                  NUMERIC(4,2),
  trigliceridos          NUMERIC(6,2),
  colesterol_ldl         NUMERIC(6,2),
  colesterol_hdl         NUMERIC(6,2),
  diagnostico            TEXT,
  plan_terapeutico       TEXT,
  medicacion_actual      TEXT,
  observaciones          TEXT,
  -- ⚠ TIMESTAMPTZ, no DATE. Era DATE y descartaba la hora (todo se agendaba a las
  --   09:00); la migración 041 la convirtió. El formulario ancla la hora de pared
  --   argentina con `parseFechaHoraAR` — ver CLAUDE.md → nota técnica 25.
  proximo_turno_sugerido TIMESTAMPTZ,
  estado                 TEXT NOT NULL DEFAULT 'borrador',
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now(),
  campos_extra           JSONB NOT NULL DEFAULT '[]'::jsonb,
  creado_por             UUID,
  CONSTRAINT consultas_pkey             PRIMARY KEY (id),
  CONSTRAINT consultas_estado_check     CHECK (estado = ANY (ARRAY['borrador'::text, 'finalizada'::text])),
  CONSTRAINT consultas_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE,
  CONSTRAINT consultas_medico_id_fkey   FOREIGN KEY (medico_id)   REFERENCES public.profiles(id),
  CONSTRAINT consultas_creado_por_fkey  FOREIGN KEY (creado_por)  REFERENCES public.profiles(id)
);

-- ⚠ `medico_id` es el TENANT; `creado_por` es el AUTOR. No son lo mismo y la distinción
--   es la que habilita la regla de descarte de borradores (regla de negocio 13): un
--   borrador lo descarta el médico o EL ASISTENTE QUE LO CREÓ. `creado_por` la agregó la
--   migración 038 y es nullable a propósito — las consultas anteriores la tienen en NULL
--   y por eso solo las descarta el médico.
-- ⚠ `consultas` es la ÚNICA tabla de su familia SIN trigger de auditoría, y de eso
--   depende que descartar un borrador sea "sin rastro": no hay nada que borrar aparte
--   de la fila. Si alguna vez se le agrega auditoría, la regla 13 deja de cumplirse sola.
COMMENT ON COLUMN public.consultas.creado_por IS 'Autor de la consulta (quien la creó). NULL en las anteriores a la migración 038: esas solo las puede descartar el médico. No confundir con medico_id, que es el tenant.';


-- ── estudios ──────────────────────────────────────────────────────────────────
-- Archivos adjuntos por paciente. El binario vive en el bucket privado `estudios`
-- (§9); acá va solo la metadata. `storage_path` sigue el patrón
-- `{medico_id}/{paciente_id}/{uuid}.{ext}`, y ese primer segmento es lo que comparan
-- las políticas de storage.objects contra `get_medico_id()`.
CREATE TABLE IF NOT EXISTS public.estudios (
  id            UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
  paciente_id   UUID NOT NULL,
  nombre        TEXT NOT NULL,
  tipo          TEXT,
  fecha_estudio DATE,
  descripcion   TEXT,
  storage_path  TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  file_size     INTEGER,
  mime_type     TEXT DEFAULT 'application/pdf',
  subido_por    UUID NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT estudios_pkey            PRIMARY KEY (id),
  CONSTRAINT estudios_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE,
  CONSTRAINT estudios_subido_por_fkey  FOREIGN KEY (subido_por)  REFERENCES public.profiles(id)
);


-- ── evoluciones ───────────────────────────────────────────────────────────────
-- Series de laboratorio y antropometría (legacy; alimenta los gráficos de evolución).
CREATE TABLE IF NOT EXISTS public.evoluciones (
  id                  UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
  paciente_id         UUID NOT NULL,
  fecha               DATE NOT NULL DEFAULT CURRENT_DATE,
  peso                NUMERIC(5,2),
  perimetro_cintura   NUMERIC(5,2),
  hba1c               NUMERIC(4,2),
  glucemia_ayunas     NUMERIC(5,1),
  insulina_basal      NUMERIC(6,2),
  homa_ir             NUMERIC(5,2),
  colesterol_total    NUMERIC(5,1),
  hdl                 NUMERIC(5,1),
  ldl                 NUMERIC(5,1),
  trigliceridos       NUMERIC(5,1),
  got_ast             NUMERIC(6,2),
  gpt_alt             NUMERIC(6,2),
  ggt                 NUMERIC(6,2),
  fosfatasa_alcalina  NUMERIC(6,2),
  tension_sistolica   INTEGER,
  tension_diastolica  INTEGER,
  frecuencia_cardiaca INTEGER,
  observaciones       TEXT,
  registrado_por      UUID NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT evoluciones_pkey                PRIMARY KEY (id),
  CONSTRAINT evoluciones_paciente_id_fkey    FOREIGN KEY (paciente_id)    REFERENCES public.pacientes(id) ON DELETE CASCADE,
  CONSTRAINT evoluciones_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.profiles(id)
);


-- ── turnos ────────────────────────────────────────────────────────────────────
-- Agenda. `consulta_id` liga el turno a la consulta que lo originó (origen='desde_hc').
-- ⚠ SIN columna `color`: la dropeó la migración 048 (ya aplicada a producción). Era
--   una columna sin lectores — el color del evento sale de `categoria`. Este baseline
--   refleja el estado POSTERIOR a esa migración, así que no debe recrearla.
CREATE TABLE IF NOT EXISTS public.turnos (
  id                    UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
  paciente_id           UUID,
  paciente_nombre_libre TEXT,
  fecha_inicio          TIMESTAMPTZ NOT NULL,
  fecha_fin             TIMESTAMPTZ NOT NULL,
  motivo                TEXT,
  notas                 TEXT,
  estado                public.turno_estado NOT NULL DEFAULT 'pendiente'::public.turno_estado,
  recordatorio_enviado  BOOLEAN DEFAULT false,
  agendado_por          UUID NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  medico_id             UUID NOT NULL,
  categoria             TEXT NOT NULL DEFAULT 'turno_medico',
  origen                TEXT NOT NULL DEFAULT 'manual',
  consulta_id           UUID,
  CONSTRAINT turnos_pkey        PRIMARY KEY (id),
  CONSTRAINT check_turnos_categoria CHECK (categoria = ANY (ARRAY['turno_medico'::text, 'curso'::text, 'personal'::text, 'administrativo'::text, 'recordatorio'::text])),
  CONSTRAINT turnos_origen_check    CHECK (origen = ANY (ARRAY['manual'::text, 'desde_hc'::text])),
  -- Solo el turno médico exige paciente: un curso o un bloque personal no tienen.
  CONSTRAINT check_paciente_id_required_for_turno_medico CHECK ((categoria <> 'turno_medico'::text) OR (paciente_id IS NOT NULL)),
  CONSTRAINT turnos_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE SET NULL,
  CONSTRAINT turnos_agendado_por_fkey FOREIGN KEY (agendado_por) REFERENCES public.profiles(id),
  CONSTRAINT turnos_medico_id_fkey    FOREIGN KEY (medico_id)    REFERENCES public.profiles(id),
  CONSTRAINT turnos_consulta_id_fkey  FOREIGN KEY (consulta_id)  REFERENCES public.consultas(id) ON DELETE SET NULL
);

-- ⚠ "Un turno por consulta" lo garantiza la BASE, con el índice único PARCIAL
--   `turnos_consulta_id_unico` (§6), no el código. La guarda por `consulta_id` que hay
--   en el endpoint pasa por `turnos_select` y por lo tanto depende de los permisos de
--   lectura de la agenda; el índice no depende de permisos. Migración 038.
-- ⚠ `origen='desde_hc'` NO es un valor muerto: sobrevivió a la baja del modelo viejo de
--   HC porque lo usa el flujo vivo de consultas. Y el turno se crea SOLO AL FINALIZAR
--   la consulta, nunca al guardar un borrador (nota técnica 22).


-- ── bloqueos_agenda ───────────────────────────────────────────────────────────
-- Bloqueos de horario del médico. Junto con `turnos` define qué franjas están ocupadas;
-- el criterio único de solapamiento vive en `src/lib/agenda/solapamiento.ts` y consulta
-- LAS DOS tablas (nota técnica 23).
CREATE TABLE IF NOT EXISTS public.bloqueos_agenda (
  id              UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
  fecha_inicio    TIMESTAMPTZ NOT NULL,
  fecha_fin       TIMESTAMPTZ NOT NULL,
  motivo          TEXT NOT NULL DEFAULT 'No disponible',
  es_recurrente   BOOLEAN DEFAULT false,
  recurrencia_fin DATE,
  dias_semana     INTEGER[],
  creado_por      UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  medico_id       UUID NOT NULL,
  -- La agregó la migración 036, compañera de la 033: recién desde que los bloqueos son
  -- EDITABLES tiene sentido registrar cuándo se modificaron.
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bloqueos_agenda_pkey            PRIMARY KEY (id),
  CONSTRAINT bloqueos_agenda_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.profiles(id),
  CONSTRAINT bloqueos_agenda_medico_id_fkey  FOREIGN KEY (medico_id)  REFERENCES public.profiles(id)
);


-- ── turnos_audit_log ──────────────────────────────────────────────────────────
-- Log de cambios de turnos. Lo escribe el trigger `turno_audit_trigger` (§7), que es
-- SECURITY DEFINER y por eso NO necesita política de INSERT (la 014 la dropeó).
CREATE TABLE IF NOT EXISTS public.turnos_audit_log (
  id         UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
  -- ⚠ NULLABLE y con `ON DELETE SET NULL`, las dos cosas a propósito (migración 040):
  --   antes era `ON DELETE CASCADE`, o sea que borrar un turno se llevaba puesto TODO
  --   su historial de auditoría. Y la fila de acción 'eliminado' NACE con turno_id NULL,
  --   porque en un trigger AFTER DELETE el turno ya no existe y un INSERT que lo
  --   referenciara violaría la FK y abortaría el borrado entero. El id del turno queda
  --   dentro de `detalle`.
  turno_id   UUID,
  usuario_id UUID NOT NULL,
  accion     TEXT NOT NULL,
  detalle    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- ⚠ DESNORMALIZADO a propósito: es el tenant real de la fila, y gracias a él
  --   `audit_select` ya NO hace JOIN al turno — algo que dejó de funcionar cuando el
  --   turno puede no existir. Migración 040.
  --   NO tiene FK a profiles: así está en la base viva y así se reproduce.
  medico_id  UUID NOT NULL,
  CONSTRAINT turnos_audit_log_pkey            PRIMARY KEY (id),
  CONSTRAINT turnos_audit_log_turno_id_fkey   FOREIGN KEY (turno_id)   REFERENCES public.turnos(id) ON DELETE SET NULL,
  CONSTRAINT turnos_audit_log_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.profiles(id)
);


-- ── pedidos ───────────────────────────────────────────────────────────────────
-- Pedidos de estudios. Los campos `paciente_*` y `obra_social_nombre` son un SNAPSHOT
-- del paciente al emitir, no un join: el documento tiene que ser fiel al momento en que
-- se firmó (regla de negocio 5).
CREATE TABLE IF NOT EXISTS public.pedidos (
  id                   UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
  paciente_id          UUID NOT NULL,
  paciente_nombre      TEXT NOT NULL,
  paciente_dni         TEXT NOT NULL,
  paciente_dob         DATE NOT NULL,
  obra_social_nombre   TEXT,
  numero_afiliado      TEXT,
  diagnostico          TEXT NOT NULL,
  estudios_pedidos     TEXT NOT NULL,
  fecha_pedido         DATE NOT NULL DEFAULT CURRENT_DATE,
  indicaciones         TEXT,
  -- Ruta del PDF CONGELADO en el bucket privado `documentos` (§9). Nullable: el
  -- congelado es best-effort, un Storage caído no impide emitir y el PDF se regenera
  -- al vuelo desde `emisor_snapshot`.
  pdf_path             TEXT,
  pdf_generado_at      TIMESTAMPTZ,
  firmado_por          UUID NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  codigo_verificacion  TEXT NOT NULL DEFAULT upper(SUBSTRING(md5((random())::text) FROM 1 FOR 12)),
  estado               TEXT NOT NULL DEFAULT 'emitido',
  emisor_snapshot      JSONB,
  CONSTRAINT pedidos_pkey                    PRIMARY KEY (id),
  CONSTRAINT pedidos_codigo_verificacion_key UNIQUE (codigo_verificacion),
  CONSTRAINT pedidos_estado_check            CHECK (estado = ANY (ARRAY['emitido'::text, 'revocado'::text])),
  -- ⚠ ON DELETE RESTRICT, no CASCADE: un documento emitido no puede desaparecer porque
  --   se borre el paciente. Es la contracara en la base de la regla 9.
  CONSTRAINT pedidos_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE RESTRICT,
  CONSTRAINT pedidos_firmado_por_fkey FOREIGN KEY (firmado_por) REFERENCES public.profiles(id)
);

-- ⚠ NO HAY POLÍTICA DE DELETE para pedidos ni certificados, y NO es un olvido: los
--   documentos NO SE BORRAN, solo se anulan (`estado='revocado'`). La migración 025
--   dropeó las dos políticas de DELETE que existían. El estado vive en la base, no en
--   el PDF congelado: anular nunca toca el objeto de Storage. Regla de negocio 5.
COMMENT ON COLUMN public.pedidos.emisor_snapshot IS 'Foto de los datos del médico firmante al emitir (full_name, titulo, matriculas, firma_url, logo_url). El preview y la regeneración del PDF leen de acá, no de profiles, para que el documento sea fiel e inmutable. Nullable; la app la escribe siempre al emitir.';


-- ── certificados ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.certificados (
  id                   UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
  paciente_id          UUID NOT NULL,
  paciente_nombre      TEXT NOT NULL,
  paciente_dni         TEXT NOT NULL,
  paciente_dob         DATE NOT NULL,
  obra_social_nombre   TEXT,
  numero_afiliado      TEXT,
  -- ⚠ ENUM y NULLABLE.
  tipo                 public.certificado_tipo,
  tipo_descripcion     TEXT,
  contenido            TEXT NOT NULL,
  dias_reposo          INTEGER,
  fecha_inicio_reposo  DATE,
  fecha_certificado    DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Si `valido_hasta < hoy` la UI muestra "expirado", pero eso es SOLO DISPLAY: no
  -- cambia `estado`, que sigue siendo 'emitido'. Regla de negocio 5.
  valido_hasta         DATE,
  pdf_path             TEXT,
  pdf_generado_at      TIMESTAMPTZ,
  firmado_por          UUID NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  codigo_verificacion  TEXT NOT NULL DEFAULT upper(SUBSTRING(md5((random())::text) FROM 1 FOR 12)),
  estado               TEXT NOT NULL DEFAULT 'emitido',
  emisor_snapshot      JSONB,
  CONSTRAINT certificados_pkey                    PRIMARY KEY (id),
  CONSTRAINT certificados_codigo_verificacion_key UNIQUE (codigo_verificacion),
  CONSTRAINT certificados_estado_check            CHECK (estado = ANY (ARRAY['emitido'::text, 'revocado'::text])),
  CONSTRAINT certificados_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE RESTRICT,
  CONSTRAINT certificados_firmado_por_fkey FOREIGN KEY (firmado_por) REFERENCES public.profiles(id)
);

COMMENT ON COLUMN public.certificados.emisor_snapshot IS 'Foto de los datos del médico firmante al emitir (full_name, titulo, matriculas, firma_url, logo_url). El preview y la regeneración del PDF leen de acá, no de profiles, para que el documento sea fiel e inmutable. Nullable; la app la escribe siempre al emitir.';


-- ── recetas ───────────────────────────────────────────────────────────────────
-- ⚠ ESTRUCTURA LISTA, EMISIÓN BLOQUEADA por certificación ANMAT (regla de negocio 7).
--   Solo el médico las ve; la creación está deshabilitada en la app.
--   ⚠ NO tiene `emisor_snapshot` ni `codigo_verificacion`, a diferencia de pedidos y
--     certificados: habrá que sumárselos cuando se habilite la emisión.
CREATE TABLE IF NOT EXISTS public.recetas (
  id                 UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
  paciente_id        UUID NOT NULL,
  paciente_nombre    TEXT NOT NULL,
  paciente_dni       TEXT NOT NULL,
  paciente_dob       DATE NOT NULL,
  obra_social_nombre TEXT,
  numero_afiliado    TEXT,
  diagnostico        TEXT NOT NULL,
  medicacion         TEXT NOT NULL,
  fecha_receta       DATE NOT NULL DEFAULT CURRENT_DATE,
  -- ⚠ SIN DEFAULT. Ver el bloque de abajo: la base viva tiene acá un default que
  --   NO ES RE-EMITIBLE POR DDL.
  fecha_vencimiento  DATE,
  numero_receta      TEXT,
  firma_digital_ref  TEXT,
  pdf_path           TEXT,
  pdf_generado_at    TIMESTAMPTZ,
  firmado_por        UUID NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recetas_pkey              PRIMARY KEY (id),
  CONSTRAINT recetas_numero_receta_key UNIQUE (numero_receta),
  CONSTRAINT recetas_paciente_id_fkey  FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE RESTRICT,
  CONSTRAINT recetas_firmado_por_fkey  FOREIGN KEY (firmado_por) REFERENCES public.profiles(id)
);

-- ⚠⚠ DIVERGENCIA DELIBERADA Y ÚNICA DE ESTE BASELINE — LEER ANTES DE "ARREGLARLA".
--   La base viva tiene en `recetas.fecha_vencimiento` un DEFAULT que dice
--   `(fecha_receta + '30 days'::interval)`: un default que REFERENCIA OTRA COLUMNA de
--   la misma fila. Está verificado en el árbol de expresión (`pg_attrdef.adbin` trae un
--   nodo `VAR :varattno 10`), no es una impresión de `pg_get_expr`.
--
--   Postgres NO PERMITE crear eso: `ALTER TABLE … SET DEFAULT` con una referencia a
--   columna falla con *"cannot use column reference in DEFAULT expression"*. O sea que
--   ese default NO SE PUEDE RE-EMITIR CON DDL, y por lo tanto NO PUEDE ESTAR EN UN
--   BASELINE que tiene que correr de punta a punta. Es, además, un CUARTO caso de
--   cambio hecho fuera de toda migración: la 009 crea la columna sin default alguno.
--
--   Qué hace este baseline: deja la columna SIN DEFAULT, que es exactamente lo que dice
--   la migración 009. Lo descartado a propósito:
--     · `CURRENT_DATE + 30 days` — NO es equivalente: difiere en cuanto alguien inserta
--       una receta con `fecha_receta` explícita distinta de hoy. Sería inventar una
--       semántica que ni la base ni la migración tienen.
--     · Un trigger BEFORE INSERT que calcule el valor — sería crear en el entorno nuevo
--       un objeto que producción NO tiene. Peor que la diferencia que arregla.
--
--   Impacto hoy: NULO. La emisión de recetas está bloqueada por ANMAT (regla 7), así
--   que nadie inserta filas en esta tabla y el default no se evalúa nunca. Cuando se
--   habilite la emisión hay que decidir esto explícitamente — junto con `emisor_snapshot`
--   y `codigo_verificacion`, que a esta tabla también le faltan.


-- ── difusion_posts ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.difusion_posts (
  id           UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
  titulo       TEXT NOT NULL,
  contenido    TEXT NOT NULL,
  estado       public.difusion_estado NOT NULL DEFAULT 'borrador'::public.difusion_estado,
  canal        public.difusion_canal DEFAULT 'email'::public.difusion_canal,
  asunto_email TEXT,
  imagen_path  TEXT,
  creado_por   UUID NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  medico_id    UUID NOT NULL,
  CONSTRAINT difusion_posts_pkey            PRIMARY KEY (id),
  CONSTRAINT difusion_posts_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.profiles(id),
  CONSTRAINT difusion_posts_medico_id_fkey  FOREIGN KEY (medico_id)  REFERENCES public.profiles(id)
);

-- ⚠ `imagen_path` apunta a un bucket `difusion` que TODAVÍA NO EXISTE. No es un
--   descuido de este baseline: tampoco existe en producción (§9 crea solo los dos que
--   sí están: `estudios` y `documentos`).


-- ── difusion_envios ───────────────────────────────────────────────────────────
-- Log de envíos: UNA FILA POR DESTINATARIO, la escribe POST /api/difusion/enviar.
-- Es también el contador del tope diario de 100 emails por tenant (regla 12).
CREATE TABLE IF NOT EXISTS public.difusion_envios (
  id            UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
  post_id       UUID NOT NULL,
  paciente_id   UUID,
  email_destino TEXT,
  tel_destino   TEXT,
  canal         public.difusion_canal NOT NULL,
  enviado_ok    BOOLEAN DEFAULT false,
  error_msg     TEXT,
  enviado_at    TIMESTAMPTZ,
  enviado_por   UUID NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT difusion_envios_pkey             PRIMARY KEY (id),
  CONSTRAINT difusion_envios_post_id_fkey     FOREIGN KEY (post_id)     REFERENCES public.difusion_posts(id) ON DELETE CASCADE,
  -- ⚠ SET NULL, no CASCADE: el historial de a quién se le mandó qué sobrevive al
  --   borrado del paciente.
  CONSTRAINT difusion_envios_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE SET NULL,
  CONSTRAINT difusion_envios_enviado_por_fkey FOREIGN KEY (enviado_por) REFERENCES public.profiles(id)
);


-- ── solicitudes_asistente ─────────────────────────────────────────────────────
-- Workflow de vinculación de un asistente a un médico (onboarding).
CREATE TABLE IF NOT EXISTS public.solicitudes_asistente (
  id             UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
  solicitante_id UUID NOT NULL,
  medico_id      UUID NOT NULL,
  estado         TEXT NOT NULL DEFAULT 'pendiente',
  mensaje        TEXT,
  respondido_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- ⚠ La columna existe pero NO tiene trigger que la mantenga (así está en la base
  --   viva). La escribe la app cuando responde la solicitud, no `set_updated_at()`.
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT solicitudes_asistente_pkey           PRIMARY KEY (id),
  CONSTRAINT solicitudes_asistente_estado_check   CHECK (estado = ANY (ARRAY['pendiente'::text, 'aprobada'::text, 'rechazada'::text])),
  CONSTRAINT solicitudes_asistente_solicitante_id_fkey FOREIGN KEY (solicitante_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT solicitudes_asistente_medico_id_fkey      FOREIGN KEY (medico_id)      REFERENCES public.profiles(id) ON DELETE CASCADE
);

-- ⚠ LA UNICIDAD DE ESTA TABLA NO ES UNA CONSTRAINT: es un ÍNDICE ÚNICO PARCIAL
--   (`solicitudes_asistente_solicitante_medico_pendiente_key`, §6). Tiene que ser un
--   índice y no un UNIQUE porque Postgres NO admite constraints UNIQUE parciales.
--   El motivo del parcial: con la constraint TOTAL original, la solicitud vieja
--   (aprobada/rechazada) bloqueaba una solicitud nueva PARA SIEMPRE, así que un
--   asistente desvinculado no podía volver a pedir vinculación. Migración 034.


-- ── notas ─────────────────────────────────────────────────────────────────────
-- Notas personales. ⚠ Su tenant NO es el médico: es `user_id`. Cada usuario ve solo
-- las propias, incluido el titular respecto de las de sus asistentes.
CREATE TABLE IF NOT EXISTS public.notas (
  id         UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  titulo     TEXT NOT NULL,
  cuerpo     TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notas_pkey         PRIMARY KEY (id),
  CONSTRAINT notas_titulo_check CHECK ((char_length(titulo) >= 1) AND (char_length(titulo) <= 200)),
  CONSTRAINT notas_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);


-- ── mensajes_internos ─────────────────────────────────────────────────────────
-- Mensajería interna (individual y grupal). Un hilo es una raíz (parent_id IS NULL)
-- más sus respuestas; la app solo admite DOS niveles.
CREATE TABLE IF NOT EXISTS public.mensajes_internos (
  id                  UUID NOT NULL DEFAULT gen_random_uuid(),
  medico_id           UUID NOT NULL,
  remitente_id        UUID NOT NULL,
  destinatario_id     UUID,
  es_grupal           BOOLEAN NOT NULL DEFAULT false,
  asunto              TEXT NOT NULL,
  cuerpo              TEXT NOT NULL DEFAULT '',
  leido               BOOLEAN NOT NULL DEFAULT false,
  leido_at            TIMESTAMPTZ,
  parent_id           UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultima_actividad_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mensajes_internos_pkey          PRIMARY KEY (id),
  CONSTRAINT mensajes_internos_asunto_check  CHECK ((char_length(asunto) >= 1) AND (char_length(asunto) <= 200)),
  -- Un mensaje individual exige destinatario; uno grupal no.
  CONSTRAINT mensajes_destinatario_check     CHECK ((es_grupal = true) OR (destinatario_id IS NOT NULL)),
  -- ⚠ Estas tres FK apuntan a auth.users, NO a profiles (así está en la base viva).
  CONSTRAINT mensajes_internos_medico_id_fkey       FOREIGN KEY (medico_id)       REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT mensajes_internos_remitente_id_fkey    FOREIGN KEY (remitente_id)    REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT mensajes_internos_destinatario_id_fkey FOREIGN KEY (destinatario_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  -- SET NULL, no CASCADE: borrar la raíz no borra las respuestas.
  CONSTRAINT mensajes_internos_parent_id_fkey       FOREIGN KEY (parent_id)       REFERENCES public.mensajes_internos(id) ON DELETE SET NULL
);

-- ⚠ `ultima_actividad_at` es una columna DENORMALIZADA y NO se llama `updated_at` A
--   PROPÓSITO: en las otras 13 tablas ese nombre significa "cuándo se modificó ESTA
--   fila" y lo mantiene `set_updated_at()`. Acá significa "cuándo pasó algo en el HILO"
--   —la raíz no se modificó, se le agregó un hijo—, y el nombre convencional invitaría a
--   colgarle el trigger genérico, que haría lo incorrecto. La mantiene
--   `mensajes_actividad_trigger` (§7). Migración 047, CLAUDE.md → nota técnica 30.
COMMENT ON COLUMN public.mensajes_internos.ultima_actividad_at IS 'Fecha del último mensaje del HILO. Solo es significativa en los mensajes RAÍZ (parent_id IS NULL), que son los que lista la bandeja: en una respuesta vale su propio created_at y NO SE LEE NUNCA. La mantiene el trigger mensajes_actividad_trigger, que la sube al insertar una respuesta. No se recalcula al borrar (ver migración 047).';


-- ── mensajes_lecturas ─────────────────────────────────────────────────────────
-- Quién leyó qué mensaje GRUPAL. La fila es solo la PK: no hay nada que actualizar.
-- ⚠ NO TIENE POLÍTICA DE UPDATE, y por eso los upserts de la app van con
--   `ignoreDuplicates: true` (ON CONFLICT DO NOTHING): con el default (DO UPDATE)
--   marcar dos veces el mismo mensaje grupal FALLA por RLS. Ver nota técnica 19.
-- ⚠ Quedó fuera del endurecimiento de la migración 046 a propósito: no tiene columna de
--   tenant y sus dos políticas ya acotan a `user_id = auth.uid()`, así que no hay fuga.
--   Aplicarle el criterio exigiría un EXISTS contra mensajes_internos; se decide aparte.
CREATE TABLE IF NOT EXISTS public.mensajes_lecturas (
  mensaje_id UUID NOT NULL,
  user_id    UUID NOT NULL,
  leido_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mensajes_lecturas_pkey            PRIMARY KEY (mensaje_id, user_id),
  CONSTRAINT mensajes_lecturas_mensaje_id_fkey FOREIGN KEY (mensaje_id) REFERENCES public.mensajes_internos(id) ON DELETE CASCADE,
  CONSTRAINT mensajes_lecturas_user_id_fkey    FOREIGN KEY (user_id)    REFERENCES auth.users(id) ON DELETE CASCADE
);


-- ── notificaciones ────────────────────────────────────────────────────────────
-- Avisos del sistema PARA EL MÉDICO (turno agendado por un asistente, recordatorio
-- enviado). ⚠ Solo los lee el titular: `notificaciones_select` compara contra
-- `auth.uid()`, no contra `get_medico_id()`, así que para un asistente la consulta
-- devuelve siempre vacío. Por eso `leerNotificacionesSistema` corta con [] si el rol no
-- es médico ANTES de tocar la tabla. Ver CLAUDE.md → nota técnica 19.
-- ⚠ `tipo` es TEXT LIBRE: no tiene CHECK en la base. El universo de valores lo fija
--   `NotificacionTipo` en `src/types/notificacion.ts`, no el esquema.
CREATE TABLE IF NOT EXISTS public.notificaciones (
  id         UUID NOT NULL DEFAULT gen_random_uuid(),
  medico_id  UUID NOT NULL,
  titulo     TEXT NOT NULL,
  mensaje    TEXT NOT NULL,
  tipo       TEXT NOT NULL,
  leida      BOOLEAN DEFAULT false,
  payload    JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT notificaciones_pkey            PRIMARY KEY (id),
  CONSTRAINT notificaciones_medico_id_fkey  FOREIGN KEY (medico_id) REFERENCES public.profiles(id)
);


-- ── rate_limits ───────────────────────────────────────────────────────────────
-- Conteo persistente del rate limiter (migración 031). Antes vivía en un Map en la
-- memoria del proceso, lo que en Vercel serverless significa que no se compartía entre
-- instancias: EL LOGIN NO TENÍA PROTECCIÓN REAL DE FUERZA BRUTA.
-- ⚠ RLS HABILITADA Y CERO POLÍTICAS, a propósito: no se accede nunca por PostgREST.
--   El único camino es `check_rate_limit()`, SECURITY DEFINER con EXECUTE restringido a
--   service_role/postgres (§12). Los GRANT por defecto de Supabase a anon/authenticated
--   quedan neutralizados por la RLS sin políticas.
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key          TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT rate_limits_pkey PRIMARY KEY (key, window_start)
);


-- ═══════════════════════════════════════════════════════════════════════════════
-- §5 · FUNCIONES QUE LEEN TABLAS
-- ═══════════════════════════════════════════════════════════════════════════════
-- Van DESPUÉS del §4 porque las `LANGUAGE sql` se validan al crearse y leen
-- `public.profiles`. Y ANTES del §8 porque las políticas las invocan.
--
-- ⚠ POR QUÉ CASI TODAS SON `SECURITY DEFINER` CON `SET search_path = public`:
--   1. SECURITY DEFINER — porque leen `public.profiles`, que tiene RLS. Una función
--      invoker que consultara profiles desde una política DE profiles entraría en
--      RECURSIÓN INFINITA de RLS (es el bug que originó estos helpers, migraciones
--      013/014/019/021). Al correr como el owner, saltean RLS y cortan el ciclo.
--   2. `SET search_path` — porque una SECURITY DEFINER sin search_path fijo es
--      secuestrable: quien controle el search_path de la sesión puede anteponer un
--      esquema con una `profiles` propia. La 025 lo fijó en `verificar_documento` y
--      `log_turno_cambio`; la 046 cerró la última que faltaba, `get_medico_id()`,
--      justamente la MÁS USADA (cuelgan de ella casi todas las políticas multi-tenant).
--   La única excepción es `set_updated_at()` (§3), que no lee ninguna tabla.

-- Resuelve el tenant del usuario de la sesión: su propio id si es médico, su
-- `medico_id` si es asistente. Es el corazón del aislamiento multi-tenant.
CREATE OR REPLACE FUNCTION public.get_medico_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN role = 'medico'    THEN id
    WHEN role = 'asistente' THEN medico_id
    ELSE NULL
  END
  FROM public.profiles WHERE id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.get_user_role(user_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT role FROM public.profiles WHERE id = user_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_medico_id(user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT medico_id FROM public.profiles WHERE id = user_id;
$function$;

-- Autorización granular. ⚠ DEVUELVE TRUE PARA role='medico' SIN MIRAR LA COLUMNA: el
-- titular tiene acceso total (regla de negocio 2), y ése es el motivo por el que las
-- políticas pueden pedir un permiso sin agregarle una rama "o es el médico".
-- ⚠ El IF/ELSIF explícito es DELIBERADO y no hay que "simplificarlo" con SQL dinámico
--   (`EXECUTE format('SELECT %I …', permiso)`): el nombre del permiso llega como
--   parámetro y armar SQL con él abriría inyección en una función SECURITY DEFINER.
--   Un permiso desconocido cae en el ELSE y devuelve FALSE (fail-closed), igual que el
--   COALESCE final.
CREATE OR REPLACE FUNCTION public.check_permiso(user_id uuid, permiso text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_result boolean;
BEGIN
  -- Obtener el rol del usuario (evita recursión RLS al ser SECURITY DEFINER)
  SELECT role INTO v_role FROM public.profiles WHERE id = user_id;

  -- Médico siempre tiene acceso total
  IF v_role = 'medico' THEN
    RETURN TRUE;
  END IF;

  -- Para asistentes: verificar el permiso específico
  -- Usamos IF/ELSIF explícito para evitar SQL dinámico (seguridad)
  IF permiso = 'ver_pacientes' THEN
    SELECT ver_pacientes        INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'editar_pacientes' THEN
    SELECT editar_pacientes     INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'ver_historia_clinica' THEN
    SELECT ver_historia_clinica INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'crear_consultas' THEN
    SELECT crear_consultas      INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'finalizar_consultas' THEN
    SELECT finalizar_consultas  INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'ver_turnos' THEN
    SELECT ver_turnos           INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'gestionar_turnos' THEN
    SELECT gestionar_turnos     INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'ver_pedidos' THEN
    SELECT ver_pedidos          INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'crear_pedidos' THEN
    SELECT crear_pedidos        INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'ver_certificados' THEN
    SELECT ver_certificados     INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'crear_certificados' THEN
    SELECT crear_certificados   INTO v_result FROM public.profiles WHERE id = user_id;
  ELSIF permiso = 'acceso_mensajeria' THEN
    SELECT acceso_mensajeria    INTO v_result FROM public.profiles WHERE id = user_id;
  ELSE
    RETURN FALSE;
  END IF;

  RETURN COALESCE(v_result, FALSE);
END;
$function$;

-- ⚠ Estas dos son WRAPPERS LEGACY sobre check_permiso, sobrevivientes del Bloque 2.
--   NINGUNA POLÍTICA DE ESTE ESQUEMA LAS USA. Se conservan porque existen en la base
--   viva y el baseline reproduce la base, no lo que convendría que hubiera.
--   Ojo con `check_asistente_editar_agenda`: EL NOMBRE MIENTE — chequea `ver_turnos`,
--   no `gestionar_turnos`. Si alguna vez se la conecta a algo, revisar eso primero.
CREATE OR REPLACE FUNCTION public.check_asistente_ver_hc(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.check_permiso(user_id, 'ver_historia_clinica');
$function$;

CREATE OR REPLACE FUNCTION public.check_asistente_editar_agenda(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.check_permiso(user_id, 'ver_turnos');
$function$;


-- Crea la fila de `profiles` al registrarse un usuario. La dispara el trigger sobre
-- auth.users (§10). SECURITY DEFINER porque corre en el contexto del registro, sin
-- sesión que pase la RLS de profiles.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;


-- Auditoría de turnos. SECURITY DEFINER: escribe en `turnos_audit_log`, que no tiene
-- política de INSERT (la 014 la dropeó justamente porque el trigger no la necesita).
CREATE OR REPLACE FUNCTION public.log_turno_cambio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    -- existe, y un INSERT que lo referencie viola la FK y aborta el borrado entero
    -- (ver el encabezado). El id del turno queda igual dentro de `detalle`.
    INSERT INTO public.turnos_audit_log (turno_id, medico_id, usuario_id, accion, detalle)
    VALUES (
      NULL,
      OLD.medico_id,
      -- Red de seguridad: si el borrado lo hace el admin client (service_role, sin
      -- sesión), `auth.uid()` es NULL y `usuario_id` es NOT NULL → el INSERT fallaría
      -- y se llevaría puesto el DELETE. Cae en quien agendó el turno. Mismo patrón que
      -- ya usa la rama UPDATE. ⚠ Atribuye el borrado a quien AGENDÓ, no a quien borró:
      -- la raíz pendiente es que POST /api/pacientes/[id]/historia deje de borrar con
      -- admin client (ver PENDIENTES.md).
      COALESCE(auth.uid(), OLD.agendado_por),
      'eliminado',
      to_jsonb(OLD)
    );
    -- En un trigger AFTER el valor de retorno se ignora, pero por corrección la rama
    -- DELETE devuelve OLD (NEW no existe en un DELETE).
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;


-- Sube `ultima_actividad_at` de la RAÍZ al insertar una respuesta. Migración 047.
--
-- ⚠⚠ ES `SECURITY DEFINER` Y ESO DEPENDE DE QUE `mensajes_internos` NO TENGA
--   `FORCE ROW LEVEL SECURITY`. La única política de UPDATE de esa tabla
--   (`mensajes_marcar_leido`) bloquearía este UPDATE en DOS de los TRES casos: raíz
--   grupal (`NOT es_grupal` da FALSE) y raíz individual respondida por su remitente
--   original. SECURITY DEFINER lo hace correr como el owner, que bypassa RLS — PERO
--   SOLO SI LA TABLA NO LA TIENE FORZADA. Hoy ninguna tabla del esquema declara FORCE.
--   Si alguna vez se activa sobre esta tabla, EL TRIGGER DEJA DE ACTUALIZAR LA RAÍZ EN
--   SILENCIO (un UPDATE que no pasa el USING afecta 0 filas y NO da error) y el orden de
--   la bandeja se congela sin que nadie lo note. No hay forma de que la base avise.
--
-- ⚠ El trigger es `AFTER INSERT` y SOLO INSERT (§7): agregarle `OR UPDATE` introduciría
--   recursión. Y no tiene rama de DELETE por DECISIÓN DE PRODUCTO: borrar la última
--   respuesta no recalcula, para que la lista no se reordene bajo el cursor del usuario.
CREATE OR REPLACE FUNCTION public.bump_actividad_hilo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.mensajes_internos
  SET    ultima_actividad_at = NEW.created_at
  WHERE  id                  = NEW.parent_id
    AND  medico_id           = NEW.medico_id
    AND  ultima_actividad_at < NEW.created_at;

  RETURN NEW;
END;
$function$;


-- Rate limiter persistente. Migración 031. EXECUTE restringido en el §12.
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_key text, p_limit integer, p_window_secs integer)
RETURNS TABLE(allowed boolean, retry_after_secs integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count        INT;
BEGIN
  -- Alinear el inicio de ventana: floor(epoch / ventana) * ventana.
  -- Todas las requests de la misma ventana caen en la misma fila.
  v_window_start := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_secs) * p_window_secs
  );

  -- Conteo ATÓMICO: insertar-o-incrementar en un solo statement.
  -- Evita el TOCTOU de SELECT-luego-INSERT, donde dos requests concurrentes
  -- leerían ambas un valor bajo el límite y ambas pasarían.
  INSERT INTO public.rate_limits (key, window_start, count)
  VALUES (p_key, v_window_start, 1)
  ON CONFLICT (key, window_start)
  DO UPDATE SET count = public.rate_limits.count + 1
  RETURNING count INTO v_count;

  IF v_count > p_limit THEN
    -- Bloqueado: devolver segundos hasta el fin de la ventana actual.
    allowed := FALSE;
    retry_after_secs := GREATEST(
      1,
      CEIL(extract(epoch FROM (v_window_start + make_interval(secs => p_window_secs) - now())))::INT
    );
  ELSE
    allowed := TRUE;
    retry_after_secs := 0;
  END IF;

  RETURN NEXT;
END;
$function$;


-- Verificación PÚBLICA de un documento por su código de QR (`/verificar/[codigo]`).
-- ⚠ NO EXPONE DNI COMPLETO NI CONTENIDO CLÍNICO: devuelve el DNI enmascarado y nada
--   del cuerpo del certificado o del pedido. La migración 025 la endureció después de
--   que la versión original devolviera datos sensibles a una ruta sin login.
-- ⚠ Su EXECUTE está restringido a service_role/postgres (§12): la página pública la
--   llama desde el servidor con el admin client, NUNCA desde el navegador.
CREATE OR REPLACE FUNCTION public.verificar_documento(codigo text)
RETURNS TABLE(id uuid, tipo_documento text, fecha_emision date, medico_nombre text, medico_titulo text, medico_matriculas jsonb, paciente_nombre text, paciente_dni_masked text, estado text, valido_hasta date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- §6 · ÍNDICES
-- ═══════════════════════════════════════════════════════════════════════════════
-- Los 50 índices que NO respaldan una PK ni un UNIQUE (esos ya los creó el §4 junto con
-- su constraint). CINCO son PARCIALES y están marcados: dos de ellos son la unicidad
-- real de su tabla y no se pueden expresar como constraint.

-- profiles
CREATE INDEX IF NOT EXISTS idx_profiles_medico ON public.profiles USING btree (medico_id);

-- pacientes
-- ⚠ `idx_pacientes_dni` NO es redundante con `pacientes_creado_por_dni_key`: el índice
--   de la constraint es (creado_por, dni) y NO sirve para buscar por `dni` solo, que no
--   es su prefijo izquierdo. Al pasar el UNIQUE a por-tenant (043) este índice se
--   conservó justamente por eso.
CREATE INDEX IF NOT EXISTS idx_pacientes_dni         ON public.pacientes USING btree (dni);
CREATE INDEX IF NOT EXISTS idx_pacientes_nombre      ON public.pacientes USING btree (nombre_completo);
CREATE INDEX IF NOT EXISTS idx_pacientes_obra_social ON public.pacientes USING btree (obra_social_id);
-- PARCIAL: el listado de /pacientes filtra siempre por no-archivados (regla 9).
CREATE INDEX IF NOT EXISTS idx_pacientes_activos     ON public.pacientes USING btree (creado_por) WHERE (archivado_at IS NULL);

-- historia_clinica
CREATE INDEX IF NOT EXISTS idx_historia_paciente ON public.historia_clinica USING btree (paciente_id);

-- consultas
CREATE INDEX IF NOT EXISTS consultas_paciente_id_idx ON public.consultas USING btree (paciente_id);
CREATE INDEX IF NOT EXISTS consultas_medico_id_idx   ON public.consultas USING btree (medico_id);
CREATE INDEX IF NOT EXISTS consultas_fecha_hora_idx  ON public.consultas USING btree (fecha_hora DESC);

-- estudios
CREATE INDEX IF NOT EXISTS idx_estudios_paciente ON public.estudios USING btree (paciente_id);
CREATE INDEX IF NOT EXISTS idx_estudios_fecha    ON public.estudios USING btree (fecha_estudio);

-- evoluciones
CREATE INDEX IF NOT EXISTS idx_evoluciones_paciente_fecha ON public.evoluciones USING btree (paciente_id, fecha);

-- turnos
CREATE INDEX IF NOT EXISTS idx_turnos_medico   ON public.turnos USING btree (medico_id);
CREATE INDEX IF NOT EXISTS idx_turnos_paciente ON public.turnos USING btree (paciente_id);
CREATE INDEX IF NOT EXISTS idx_turnos_fecha    ON public.turnos USING btree (fecha_inicio);
CREATE INDEX IF NOT EXISTS idx_turnos_rango    ON public.turnos USING btree (fecha_inicio, fecha_fin);
CREATE INDEX IF NOT EXISTS idx_turnos_estado   ON public.turnos USING btree (estado);
-- PARCIAL Y ÚNICO: "un turno por consulta" (migración 038). Es lo que garantiza la
-- regla en la BASE; la guarda equivalente del código depende de permisos de lectura.
-- Va como índice y no como constraint porque Postgres no admite UNIQUE parciales.
CREATE UNIQUE INDEX IF NOT EXISTS turnos_consulta_id_unico ON public.turnos USING btree (consulta_id) WHERE (consulta_id IS NOT NULL);

-- bloqueos_agenda
CREATE INDEX IF NOT EXISTS idx_bloqueos_medico ON public.bloqueos_agenda USING btree (medico_id);

-- turnos_audit_log
CREATE INDEX IF NOT EXISTS idx_audit_turno         ON public.turnos_audit_log USING btree (turno_id);
CREATE INDEX IF NOT EXISTS idx_audit_usuario       ON public.turnos_audit_log USING btree (usuario_id);
CREATE INDEX IF NOT EXISTS idx_turnos_audit_medico ON public.turnos_audit_log USING btree (medico_id);

-- pedidos
CREATE INDEX IF NOT EXISTS idx_pedidos_paciente ON public.pedidos USING btree (paciente_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_fecha    ON public.pedidos USING btree (fecha_pedido);

-- certificados
CREATE INDEX IF NOT EXISTS idx_certificados_paciente ON public.certificados USING btree (paciente_id);
CREATE INDEX IF NOT EXISTS idx_certificados_fecha    ON public.certificados USING btree (fecha_certificado);

-- recetas
CREATE INDEX IF NOT EXISTS idx_recetas_paciente ON public.recetas USING btree (paciente_id);
CREATE INDEX IF NOT EXISTS idx_recetas_fecha    ON public.recetas USING btree (fecha_receta);
CREATE INDEX IF NOT EXISTS idx_recetas_numero   ON public.recetas USING btree (numero_receta);

-- difusion_posts
CREATE INDEX IF NOT EXISTS idx_difusion_medico  ON public.difusion_posts USING btree (medico_id);
CREATE INDEX IF NOT EXISTS idx_difusion_estado  ON public.difusion_posts USING btree (estado);
CREATE INDEX IF NOT EXISTS idx_difusion_created ON public.difusion_posts USING btree (created_at DESC);

-- difusion_envios
CREATE INDEX IF NOT EXISTS idx_envios_post     ON public.difusion_envios USING btree (post_id);
CREATE INDEX IF NOT EXISTS idx_envios_paciente ON public.difusion_envios USING btree (paciente_id);

-- solicitudes_asistente
CREATE INDEX IF NOT EXISTS idx_solicitudes_solicitante ON public.solicitudes_asistente USING btree (solicitante_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_medico      ON public.solicitudes_asistente USING btree (medico_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_estado      ON public.solicitudes_asistente USING btree (estado);
-- PARCIAL Y ÚNICO: es LA unicidad de la tabla (ver el ⚠ en su CREATE TABLE). Migración 034.
CREATE UNIQUE INDEX IF NOT EXISTS solicitudes_asistente_solicitante_medico_pendiente_key
  ON public.solicitudes_asistente USING btree (solicitante_id, medico_id) WHERE (estado = 'pendiente'::text);

-- notas
CREATE INDEX IF NOT EXISTS notas_user_id_idx      ON public.notas USING btree (user_id);
CREATE INDEX IF NOT EXISTS notas_user_created_idx ON public.notas USING btree (user_id, created_at DESC);

-- mensajes_internos
CREATE INDEX IF NOT EXISTS mensajes_remitente_idx     ON public.mensajes_internos USING btree (remitente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mensajes_destinatario_idx  ON public.mensajes_internos USING btree (destinatario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mensajes_medico_grupal_idx ON public.mensajes_internos USING btree (medico_id, es_grupal, created_at DESC);
-- PARCIAL: sirve al WHERE y al ORDER BY de la bandeja de una sola pasada (tenant
-- primero, orden después) y la paginación por keyset lo recorre directo. Migración 047.
CREATE INDEX IF NOT EXISTS mensajes_bandeja_idx ON public.mensajes_internos USING btree (medico_id, ultima_actividad_at DESC) WHERE (parent_id IS NULL);
-- PARCIAL: cierra una carencia PREEXISTENTE — `parent_id` es la columna por la que
-- filtran tres consultas calientes (paso 3 de obtenerBandeja, obtenerHilo y el borrado
-- de respuestas) y ninguno de los índices previos la cubría.
CREATE INDEX IF NOT EXISTS mensajes_parent_idx  ON public.mensajes_internos USING btree (parent_id, created_at) WHERE (parent_id IS NOT NULL);

-- mensajes_lecturas
CREATE INDEX IF NOT EXISTS mensajes_lecturas_user_idx ON public.mensajes_lecturas USING btree (user_id);

-- notificaciones
CREATE INDEX IF NOT EXISTS idx_notificaciones_medico  ON public.notificaciones USING btree (medico_id);
CREATE INDEX IF NOT EXISTS idx_notificaciones_leida   ON public.notificaciones USING btree (medico_id, leida);
CREATE INDEX IF NOT EXISTS idx_notificaciones_created ON public.notificaciones USING btree (created_at DESC);

-- rate_limits
-- Sirve a la limpieza de ventanas viejas, que corre en el cron de recordatorios.
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON public.rate_limits USING btree (window_start);


-- ═══════════════════════════════════════════════════════════════════════════════
-- §7 · TRIGGERS (esquema public)
-- ═══════════════════════════════════════════════════════════════════════════════
-- 14 triggers: 12 de `updated_at`, 1 de auditoría de turnos y 1 de actividad de hilo.
-- ⚠ Tablas que TIENEN `updated_at` y NO tienen trigger, en la base viva:
--     · solicitudes_asistente → la escribe la app al responder la solicitud.
--   Se reproduce esa ausencia tal cual: agregar el trigger sería un cambio de
--   comportamiento, no una prolijidad.

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS pacientes_updated_at ON public.pacientes;
CREATE TRIGGER pacientes_updated_at BEFORE UPDATE ON public.pacientes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS historia_updated_at ON public.historia_clinica;
CREATE TRIGGER historia_updated_at BEFORE UPDATE ON public.historia_clinica
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ⚠ La migración 029 migró este trigger de `update_updated_at_column()` a
--   `set_updated_at()` y dropeó la duplicada. No revivir la vieja.
DROP TRIGGER IF EXISTS consultas_updated_at ON public.consultas;
CREATE TRIGGER consultas_updated_at BEFORE UPDATE ON public.consultas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS evoluciones_updated_at ON public.evoluciones;
CREATE TRIGGER evoluciones_updated_at BEFORE UPDATE ON public.evoluciones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS turnos_updated_at ON public.turnos;
CREATE TRIGGER turnos_updated_at BEFORE UPDATE ON public.turnos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS bloqueos_updated_at ON public.bloqueos_agenda;
CREATE TRIGGER bloqueos_updated_at BEFORE UPDATE ON public.bloqueos_agenda
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS pedidos_updated_at ON public.pedidos;
CREATE TRIGGER pedidos_updated_at BEFORE UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS certificados_updated_at ON public.certificados;
CREATE TRIGGER certificados_updated_at BEFORE UPDATE ON public.certificados
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS recetas_updated_at ON public.recetas;
CREATE TRIGGER recetas_updated_at BEFORE UPDATE ON public.recetas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS difusion_updated_at ON public.difusion_posts;
CREATE TRIGGER difusion_updated_at BEFORE UPDATE ON public.difusion_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_notas_updated_at ON public.notas;
CREATE TRIGGER set_notas_updated_at BEFORE UPDATE ON public.notas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ⚠ AFTER INSERT OR UPDATE OR DELETE, y las TRES cosas importan.
--   · AFTER (no BEFORE): la migración 040 recreó el trigger para cerrar una
--     discrepancia histórica en la que la dirección no coincidía con lo que el cuerpo
--     de la función asumía.
--   · DELETE: hasta la 040 los BORRADOS NO SE AUDITABAN. Hoy sí, con `turno_id` NULL
--     (ver el ⚠ de `turnos_audit_log`).
DROP TRIGGER IF EXISTS turno_audit_trigger ON public.turnos;
CREATE TRIGGER turno_audit_trigger AFTER INSERT OR UPDATE OR DELETE ON public.turnos
  FOR EACH ROW EXECUTE FUNCTION public.log_turno_cambio();

-- ⚠ La cláusula WHEN es parte del diseño: solo dispara para RESPUESTAS. Una raíz nace
--   con `ultima_actividad_at = now()` por su DEFAULT y no necesita el trigger.
--   ⚠ SOLO INSERT: agregarle `OR UPDATE` introduciría recursión (ver §5).
DROP TRIGGER IF EXISTS mensajes_actividad_trigger ON public.mensajes_internos;
CREATE TRIGGER mensajes_actividad_trigger AFTER INSERT ON public.mensajes_internos
  FOR EACH ROW WHEN (new.parent_id IS NOT NULL) EXECUTE FUNCTION public.bump_actividad_hilo();


-- ═══════════════════════════════════════════════════════════════════════════════
-- §8 · RLS: HABILITACIÓN Y POLÍTICAS
-- ═══════════════════════════════════════════════════════════════════════════════
-- 65 políticas sobre 20 tablas. La 21ª (`rate_limits`) tiene RLS y CERO políticas, a
-- propósito (ver su CREATE TABLE).
--
-- ⚠⚠ LAS 65 VAN `TO authenticated`, SIN EXCEPCIÓN. En la base viva NINGUNA está en
--   `{public}`, y esto NO es cosmético: una política en `public` aplica también al rol
--   `anon`, o sea a peticiones SIN SESIÓN contra PostgREST. Hoy no era explotable
--   —cuelgan de `get_medico_id()`, que para `anon` no resuelve—, pero es defensa en
--   profundidad y el estado que producción tiene. La migración 042 lo barrió: 49
--   políticas en 18 tablas pasaron a `authenticated` con `ALTER POLICY … TO`, que cambia
--   SOLO el rol y no toca una sola expresión.
--
-- ⚠ POR QUÉ ACÁ SE RE-EMITE EL TEXTO Y LA 042 NO PODÍA HACERLO:
--   La 042 usó `ALTER POLICY` justamente para NO reescribir expresiones, por dos riesgos
--   que documenta en su encabezado: reintroducir drift (copiar el texto de una migración
--   vieja que ya no coincide con la base) y perder o inventar un `WITH CHECK` (cuando
--   una política de UPDATE no lo declara, Postgres reutiliza el `USING`; agregarlo "por
--   prolijidad" CAMBIA el comportamiento). Un baseline no tiene esa opción: no hay
--   política previa que alterar. La mitigación es la contraria y es la premisa de todo
--   este archivo — el texto de acá abajo se copió DE LA BASE VIVA (`pg_policies.qual` y
--   `.with_check`), no de las migraciones. De las 16 políticas de UPDATE, solo CINCO
--   declaran `WITH CHECK` en producción y son exactamente las cinco que lo llevan acá:
--   evoluciones_update, recetas_update, difusion_update, notas_update_own y
--   mensajes_marcar_leido. Las otras once NO deben llevarlo.

ALTER TABLE public.obras_sociales        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles              ENABLE ROW LEVEL SECURITY;
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
ALTER TABLE public.notificaciones        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits           ENABLE ROW LEVEL SECURITY;

-- ⚠ NINGUNA tabla lleva `FORCE ROW LEVEL SECURITY`, y NO es un olvido: de eso depende
--   que `bump_actividad_hilo()` (SECURITY DEFINER) pueda actualizar la raíz del hilo.
--   Ver el ⚠⚠ de esa función en el §5 antes de activarlo en `mensajes_internos`.


-- ── obras_sociales ────────────────────────────────────────────────────────────
-- Catálogo de lectura para cualquier autenticado. Sin INSERT/UPDATE/DELETE: se
-- administra por migración, no desde la app.
DROP POLICY IF EXISTS obras_sociales_select_all ON public.obras_sociales;
CREATE POLICY obras_sociales_select_all ON public.obras_sociales
  FOR SELECT TO authenticated
  USING (auth.role() = 'authenticated'::text);


-- ── profiles ──────────────────────────────────────────────────────────────────
-- Las cinco ramas del SELECT cubren: uno mismo; el médico (ve todo su tenant); los
-- asistentes del médico; el médico visto por su asistente; y los compañeros de tenant.
-- Las agregaron por partes las migraciones 019 y 021 al ir apareciendo las pantallas.
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (
    (auth.uid() = id)
    OR (get_user_role(auth.uid()) = 'medico'::text)
    OR (medico_id = auth.uid())
    OR (id = get_user_medico_id(auth.uid()))
    OR (medico_id = get_user_medico_id(auth.uid()))
  );

-- ⚠ SOLO EL PERFIL PROPIO. Por eso el médico actualiza los PERMISOS de un asistente con
--   el admin client (service_role, bypass RLS) desde el servidor, y no con el cliente de
--   sesión: esta política no se lo permitiría. Ver CLAUDE.md → nota técnica 5.
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id);

-- ⚠ NO HAY POLÍTICA DE INSERT NI DE DELETE, y es correcto: la fila la crea el trigger
--   `handle_new_user()` (SECURITY DEFINER) y se borra por CASCADE desde auth.users.


-- ── pacientes ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS pacientes_select ON public.pacientes;
CREATE POLICY pacientes_select ON public.pacientes
  FOR SELECT TO authenticated
  USING ((creado_por = get_medico_id()) AND check_permiso(auth.uid(), 'ver_pacientes'::text));

DROP POLICY IF EXISTS pacientes_insert ON public.pacientes;
CREATE POLICY pacientes_insert ON public.pacientes
  FOR INSERT TO authenticated
  WITH CHECK ((creado_por = get_medico_id()) AND check_permiso(auth.uid(), 'editar_pacientes'::text));

DROP POLICY IF EXISTS pacientes_update ON public.pacientes;
CREATE POLICY pacientes_update ON public.pacientes
  FOR UPDATE TO authenticated
  USING ((creado_por = get_medico_id()) AND check_permiso(auth.uid(), 'editar_pacientes'::text));

-- ⚠ SOLO EL MÉDICO BORRA, y compara contra `auth.uid()` —no contra `get_medico_id()`—
--   a propósito: ningún asistente, ni con `editar_pacientes`, puede borrar un paciente.
--   Es la contracara en la base de la regla 9 (Ley 26.529). El endpoint valida el rol
--   además de la RLS, y el criterio de "sin ninguna actuación" vive allá.
DROP POLICY IF EXISTS pacientes_delete ON public.pacientes;
CREATE POLICY pacientes_delete ON public.pacientes
  FOR DELETE TO authenticated
  USING ((creado_por = auth.uid()) AND (get_user_role(auth.uid()) = 'medico'::text));


-- ── historia_clinica ──────────────────────────────────────────────────────────
-- (Tabla dormida; las políticas se conservan igual que la tabla.)
DROP POLICY IF EXISTS historia_select ON public.historia_clinica;
CREATE POLICY historia_select ON public.historia_clinica
  FOR SELECT TO authenticated
  USING (check_permiso(auth.uid(), 'ver_historia_clinica'::text) AND (EXISTS (
    SELECT 1 FROM public.pacientes
     WHERE pacientes.id = historia_clinica.paciente_id AND pacientes.creado_por = get_medico_id())));

DROP POLICY IF EXISTS historia_insert ON public.historia_clinica;
CREATE POLICY historia_insert ON public.historia_clinica
  FOR INSERT TO authenticated
  WITH CHECK (check_permiso(auth.uid(), 'ver_historia_clinica'::text) AND (EXISTS (
    SELECT 1 FROM public.pacientes
     WHERE pacientes.id = historia_clinica.paciente_id AND pacientes.creado_por = get_medico_id())));

DROP POLICY IF EXISTS historia_update ON public.historia_clinica;
CREATE POLICY historia_update ON public.historia_clinica
  FOR UPDATE TO authenticated
  USING (check_permiso(auth.uid(), 'ver_historia_clinica'::text) AND (EXISTS (
    SELECT 1 FROM public.pacientes
     WHERE pacientes.id = historia_clinica.paciente_id AND pacientes.creado_por = get_medico_id())));

-- ⚠ EL BORRADO EXIGE ROL MÉDICO, y ése fue el hallazgo MÁS GRAVE del drift que corrigió
--   la migración 029: la base había sido editada A MANO hacia una versión permisiva en
--   la que un ASISTENTE PODÍA BORRAR HISTORIAS CLÍNICAS que la Ley 26.529 obliga a
--   conservar. No relajar esta política.
DROP POLICY IF EXISTS historia_delete ON public.historia_clinica;
CREATE POLICY historia_delete ON public.historia_clinica
  FOR DELETE TO authenticated
  USING ((get_user_role(auth.uid()) = 'medico'::text) AND (EXISTS (
    SELECT 1 FROM public.pacientes
     WHERE pacientes.id = historia_clinica.paciente_id AND pacientes.creado_por = get_medico_id())));


-- ── consultas ─────────────────────────────────────────────────────────────────
-- ⚠ Estas cuatro exigen permiso desde la migración 025, que además dropeó DOS políticas
--   huérfanas que salteaban los permisos por completo. Fue el primero de los tres casos
--   del mismo hueco (los otros: `estudios` → 026, `mensajes_internos` → 046).
DROP POLICY IF EXISTS consultas_select ON public.consultas;
CREATE POLICY consultas_select ON public.consultas
  FOR SELECT TO authenticated
  USING (check_permiso(auth.uid(), 'ver_historia_clinica'::text) AND (medico_id = get_medico_id()));

DROP POLICY IF EXISTS consultas_insert ON public.consultas;
CREATE POLICY consultas_insert ON public.consultas
  FOR INSERT TO authenticated
  WITH CHECK (check_permiso(auth.uid(), 'crear_consultas'::text) AND (medico_id = get_medico_id()));

DROP POLICY IF EXISTS consultas_update ON public.consultas;
CREATE POLICY consultas_update ON public.consultas
  FOR UPDATE TO authenticated
  USING ((medico_id = get_medico_id()) AND (
       (get_user_role(auth.uid()) = 'medico'::text)
    OR check_permiso(auth.uid(), 'crear_consultas'::text)
    OR check_permiso(auth.uid(), 'finalizar_consultas'::text)));

-- ⚠ TRES CONDICIONES, LAS TRES DELIBERADAS (migración 038, regla de negocio 13):
--   · `estado = 'borrador'` — UNA CONSULTA FINALIZADA NO SE BORRA NUNCA (regla 1), y
--     desde la 038 eso lo GARANTIZA LA BASE, no solo el código.
--   · médico OR autor — un borrador lo descarta el titular o quien lo creó.
--   · `creado_por = auth.uid()` con `creado_por` NULL da NULL, no TRUE: por eso los
--     borradores anteriores a la 038 solo los descarta el médico. Sale de la lógica
--     ternaria de SQL; no hay caso especial escrito en ningún lado.
DROP POLICY IF EXISTS consultas_delete ON public.consultas;
CREATE POLICY consultas_delete ON public.consultas
  FOR DELETE TO authenticated
  USING ((medico_id = get_medico_id())
     AND (estado = 'borrador'::text)
     AND ((get_user_role(auth.uid()) = 'medico'::text) OR (creado_por = auth.uid())));


-- ── estudios ──────────────────────────────────────────────────────────────────
-- Estas cuatro las endureció la migración 026 (antes cualquier asistente del tenant
-- accedía, sin mirar `ver_historia_clinica`).
DROP POLICY IF EXISTS estudios_select ON public.estudios;
CREATE POLICY estudios_select ON public.estudios
  FOR SELECT TO authenticated
  USING (check_permiso(auth.uid(), 'ver_historia_clinica'::text) AND (EXISTS (
    SELECT 1 FROM public.pacientes
     WHERE pacientes.id = estudios.paciente_id AND pacientes.creado_por = get_medico_id())));

DROP POLICY IF EXISTS estudios_insert ON public.estudios;
CREATE POLICY estudios_insert ON public.estudios
  FOR INSERT TO authenticated
  WITH CHECK (check_permiso(auth.uid(), 'ver_historia_clinica'::text) AND (EXISTS (
    SELECT 1 FROM public.pacientes
     WHERE pacientes.id = estudios.paciente_id AND pacientes.creado_por = get_medico_id())));

DROP POLICY IF EXISTS estudios_update ON public.estudios;
CREATE POLICY estudios_update ON public.estudios
  FOR UPDATE TO authenticated
  USING (check_permiso(auth.uid(), 'ver_historia_clinica'::text) AND (EXISTS (
    SELECT 1 FROM public.pacientes
     WHERE pacientes.id = estudios.paciente_id AND pacientes.creado_por = get_medico_id())));

-- ⚠ Borrar es exclusivo del médico (regla 10). Su gemela sobre el binario —
--   `estudios_objects_delete` en el §9 — pide lo mismo: si una se relaja y la otra no,
--   queda metadata sin archivo o archivo sin metadata.
DROP POLICY IF EXISTS estudios_delete ON public.estudios;
CREATE POLICY estudios_delete ON public.estudios
  FOR DELETE TO authenticated
  USING ((get_user_role(auth.uid()) = 'medico'::text) AND (EXISTS (
    SELECT 1 FROM public.pacientes
     WHERE pacientes.id = estudios.paciente_id AND pacientes.creado_por = get_medico_id())));


-- ── evoluciones ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS evoluciones_select ON public.evoluciones;
CREATE POLICY evoluciones_select ON public.evoluciones
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pacientes
     WHERE pacientes.id = evoluciones.paciente_id AND pacientes.creado_por = get_medico_id()));

-- ⚠⚠ ESTA ES UNA DE LAS CUATRO POLÍTICAS DEL HALLAZGO. Ver el bloque al final del §8.
--   Solo pide tenant: cualquier miembro del consultorio puede cargar una evolución.
--   El endurecimiento de la 029 tocó el UPDATE y el DELETE de esta tabla, no el INSERT.
DROP POLICY IF EXISTS evoluciones_insert ON public.evoluciones;
CREATE POLICY evoluciones_insert ON public.evoluciones
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.pacientes
     WHERE pacientes.id = evoluciones.paciente_id AND pacientes.creado_por = get_medico_id()));

-- ⚠ Estas dos exigen rol médico desde la 029 (restauró el chequeo que el drift a mano
--   había quitado). Y son de las CINCO que declaran WITH CHECK — acá idéntico al USING.
DROP POLICY IF EXISTS evoluciones_update ON public.evoluciones;
CREATE POLICY evoluciones_update ON public.evoluciones
  FOR UPDATE TO authenticated
  USING ((get_user_role(auth.uid()) = 'medico'::text) AND (EXISTS (
    SELECT 1 FROM public.pacientes
     WHERE pacientes.id = evoluciones.paciente_id AND pacientes.creado_por = get_medico_id())))
  WITH CHECK ((get_user_role(auth.uid()) = 'medico'::text) AND (EXISTS (
    SELECT 1 FROM public.pacientes
     WHERE pacientes.id = evoluciones.paciente_id AND pacientes.creado_por = get_medico_id())));

DROP POLICY IF EXISTS evoluciones_delete ON public.evoluciones;
CREATE POLICY evoluciones_delete ON public.evoluciones
  FOR DELETE TO authenticated
  USING ((get_user_role(auth.uid()) = 'medico'::text) AND (EXISTS (
    SELECT 1 FROM public.pacientes
     WHERE pacientes.id = evoluciones.paciente_id AND pacientes.creado_por = get_medico_id())));


-- ── turnos ────────────────────────────────────────────────────────────────────
-- ⚠⚠ EL `OR` DEL SELECT ES DELIBERADO Y CERRÓ UN BUG REAL (migración 039). Los 12
--   permisos son INDEPENDIENTES, así que un asistente con `gestionar_turnos` y SIN
--   `ver_turnos` es configurable desde /perfil. Con un USING que pidiera solo
--   `ver_turnos`, ese asistente ESCRIBÍA TURNOS QUE NO PODÍA LEER — y como el helper de
--   solapamiento consulta con el cliente de SESIÓN, recibía `[]` y daba la franja por
--   LIBRE: FALSOS NEGATIVOS DE SOLAPAMIENTO, turnos encima de otros. Unificar el
--   criterio en un helper no cerró eso; se cerró acá. Ver nota técnica 23.
--   `bloqueos_select` pide exactamente lo mismo (037): las dos tablas de la agenda son
--   idénticas en criterio de lectura, y tienen que seguir siéndolo.
DROP POLICY IF EXISTS turnos_select ON public.turnos;
CREATE POLICY turnos_select ON public.turnos
  FOR SELECT TO authenticated
  USING ((medico_id = get_medico_id())
     AND (check_permiso(auth.uid(), 'ver_turnos'::text) OR check_permiso(auth.uid(), 'gestionar_turnos'::text)));

DROP POLICY IF EXISTS turnos_insert ON public.turnos;
CREATE POLICY turnos_insert ON public.turnos
  FOR INSERT TO authenticated
  WITH CHECK ((medico_id = get_medico_id()) AND check_permiso(auth.uid(), 'gestionar_turnos'::text));

DROP POLICY IF EXISTS turnos_update ON public.turnos;
CREATE POLICY turnos_update ON public.turnos
  FOR UPDATE TO authenticated
  USING ((medico_id = get_medico_id()) AND check_permiso(auth.uid(), 'gestionar_turnos'::text));

-- ⚠ LA AGENDA ES EL ÚNICO DOMINIO DONDE BORRAR NO ESTÁ RESERVADO AL MÉDICO:
--   `gestionar_turnos` INCLUYE BORRAR (migración 033). Contrastar con pacientes
--   (regla 9), estudios (regla 10) y documentos (regla 5), donde sí lo está.
--   Antes de la 033 el borrado era solo-médico EN LA BASE aunque los endpoints ya
--   dejaban pasar al asistente: esa discrepancia le devolvía un FALSO ÉXITO (un DELETE
--   que no pasa el USING afecta 0 filas y no da error). De ahí sale la "guarda de 0
--   filas" que hoy llevan varios endpoints.
DROP POLICY IF EXISTS turnos_delete ON public.turnos;
CREATE POLICY turnos_delete ON public.turnos
  FOR DELETE TO authenticated
  USING ((medico_id = get_medico_id()) AND check_permiso(auth.uid(), 'gestionar_turnos'::text));


-- ── bloqueos_agenda ───────────────────────────────────────────────────────────
-- Mismo criterio que `turnos`, y tiene que quedar así (ver el ⚠⚠ de turnos_select).
DROP POLICY IF EXISTS bloqueos_select ON public.bloqueos_agenda;
CREATE POLICY bloqueos_select ON public.bloqueos_agenda
  FOR SELECT TO authenticated
  USING ((medico_id = get_medico_id())
     AND (check_permiso(auth.uid(), 'ver_turnos'::text) OR check_permiso(auth.uid(), 'gestionar_turnos'::text)));

DROP POLICY IF EXISTS bloqueos_insert ON public.bloqueos_agenda;
CREATE POLICY bloqueos_insert ON public.bloqueos_agenda
  FOR INSERT TO authenticated
  WITH CHECK ((medico_id = get_medico_id()) AND check_permiso(auth.uid(), 'gestionar_turnos'::text));

-- ⚠ Esta política NUNCA HABÍA EXISTIDO: la creó la migración 033. Hasta entonces los
--   bloqueos no se podían editar por RLS aunque la UI lo ofreciera.
DROP POLICY IF EXISTS bloqueos_update ON public.bloqueos_agenda;
CREATE POLICY bloqueos_update ON public.bloqueos_agenda
  FOR UPDATE TO authenticated
  USING ((medico_id = get_medico_id()) AND check_permiso(auth.uid(), 'gestionar_turnos'::text));

DROP POLICY IF EXISTS bloqueos_delete ON public.bloqueos_agenda;
CREATE POLICY bloqueos_delete ON public.bloqueos_agenda
  FOR DELETE TO authenticated
  USING ((medico_id = get_medico_id()) AND check_permiso(auth.uid(), 'gestionar_turnos'::text));


-- ── turnos_audit_log ──────────────────────────────────────────────────────────
-- ⚠ SOLO SELECT, y SIN JOIN AL TURNO. Las dos cosas son de la migración 040: el
--   `medico_id` desnormalizado permitió sacar el JOIN, que dejaba de funcionar en cuanto
--   el turno auditado ya no existe (que es justo el caso de la acción 'eliminado').
-- ⚠ NO HAY POLÍTICA DE INSERT: la dropeó la 014 porque el trigger que escribe acá es
--   SECURITY DEFINER y no la necesita. No "restaurarla".
DROP POLICY IF EXISTS audit_select ON public.turnos_audit_log;
CREATE POLICY audit_select ON public.turnos_audit_log
  FOR SELECT TO authenticated
  USING (medico_id = get_medico_id());


-- ── pedidos ───────────────────────────────────────────────────────────────────
-- ⚠ TRES políticas, sin DELETE: los documentos no se borran, solo se anulan (regla 5).
--   La 025 dropeó el DELETE que existía. El UPDATE es el que permite anular.
DROP POLICY IF EXISTS pedidos_select ON public.pedidos;
CREATE POLICY pedidos_select ON public.pedidos
  FOR SELECT TO authenticated
  USING (check_permiso(auth.uid(), 'ver_pedidos'::text) AND (EXISTS (
    SELECT 1 FROM public.pacientes
     WHERE pacientes.id = pedidos.paciente_id AND pacientes.creado_por = get_medico_id())));

DROP POLICY IF EXISTS pedidos_insert ON public.pedidos;
CREATE POLICY pedidos_insert ON public.pedidos
  FOR INSERT TO authenticated
  WITH CHECK (check_permiso(auth.uid(), 'crear_pedidos'::text) AND (EXISTS (
    SELECT 1 FROM public.pacientes
     WHERE pacientes.id = pedidos.paciente_id AND pacientes.creado_por = get_medico_id())));

DROP POLICY IF EXISTS pedidos_update ON public.pedidos;
CREATE POLICY pedidos_update ON public.pedidos
  FOR UPDATE TO authenticated
  USING (check_permiso(auth.uid(), 'crear_pedidos'::text) AND (EXISTS (
    SELECT 1 FROM public.pacientes
     WHERE pacientes.id = pedidos.paciente_id AND pacientes.creado_por = get_medico_id())));


-- ── certificados ──────────────────────────────────────────────────────────────
-- Mismo criterio que pedidos, con su par de permisos. También sin DELETE.
DROP POLICY IF EXISTS certificados_select ON public.certificados;
CREATE POLICY certificados_select ON public.certificados
  FOR SELECT TO authenticated
  USING (check_permiso(auth.uid(), 'ver_certificados'::text) AND (EXISTS (
    SELECT 1 FROM public.pacientes
     WHERE pacientes.id = certificados.paciente_id AND pacientes.creado_por = get_medico_id())));

DROP POLICY IF EXISTS certificados_insert ON public.certificados;
CREATE POLICY certificados_insert ON public.certificados
  FOR INSERT TO authenticated
  WITH CHECK (check_permiso(auth.uid(), 'crear_certificados'::text) AND (EXISTS (
    SELECT 1 FROM public.pacientes
     WHERE pacientes.id = certificados.paciente_id AND pacientes.creado_por = get_medico_id())));

DROP POLICY IF EXISTS certificados_update ON public.certificados;
CREATE POLICY certificados_update ON public.certificados
  FOR UPDATE TO authenticated
  USING (check_permiso(auth.uid(), 'crear_certificados'::text) AND (EXISTS (
    SELECT 1 FROM public.pacientes
     WHERE pacientes.id = certificados.paciente_id AND pacientes.creado_por = get_medico_id())));


-- ── recetas ───────────────────────────────────────────────────────────────────
-- ⚠ Regla de negocio 7: SOLO EL MÉDICO. Las tres de escritura exigen rol médico, y ese
--   chequeo lo RESTAURÓ la migración 029 (el drift a mano lo había quitado en las tres).
--   El SELECT pide solo tenant porque la app ya no muestra la sección a los asistentes.
DROP POLICY IF EXISTS recetas_select ON public.recetas;
CREATE POLICY recetas_select ON public.recetas
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pacientes
     WHERE pacientes.id = recetas.paciente_id AND pacientes.creado_por = get_medico_id()));

DROP POLICY IF EXISTS recetas_insert ON public.recetas;
CREATE POLICY recetas_insert ON public.recetas
  FOR INSERT TO authenticated
  WITH CHECK ((get_user_role(auth.uid()) = 'medico'::text) AND (EXISTS (
    SELECT 1 FROM public.pacientes
     WHERE pacientes.id = recetas.paciente_id AND pacientes.creado_por = get_medico_id())));

DROP POLICY IF EXISTS recetas_update ON public.recetas;
CREATE POLICY recetas_update ON public.recetas
  FOR UPDATE TO authenticated
  USING ((get_user_role(auth.uid()) = 'medico'::text) AND (EXISTS (
    SELECT 1 FROM public.pacientes
     WHERE pacientes.id = recetas.paciente_id AND pacientes.creado_por = get_medico_id())))
  WITH CHECK ((get_user_role(auth.uid()) = 'medico'::text) AND (EXISTS (
    SELECT 1 FROM public.pacientes
     WHERE pacientes.id = recetas.paciente_id AND pacientes.creado_por = get_medico_id())));

DROP POLICY IF EXISTS recetas_delete ON public.recetas;
CREATE POLICY recetas_delete ON public.recetas
  FOR DELETE TO authenticated
  USING ((get_user_role(auth.uid()) = 'medico'::text) AND (EXISTS (
    SELECT 1 FROM public.pacientes
     WHERE pacientes.id = recetas.paciente_id AND pacientes.creado_por = get_medico_id())));


-- ── difusion_posts ────────────────────────────────────────────────────────────
-- ⚠⚠ LAS CUATRO VALIDAN SOLO EL TENANT, Y ESO ES UNA DECISIÓN DE PRODUCTO, NO UN
--   DESCUIDO: los posts son comunicación del consultorio, no datos clínicos, así que
--   cualquier asistente vinculado puede ver, crear, EDITAR Y ELIMINAR comunicados.
--   `src/app/api/difusion/[id]/route.ts` (PATCH y DELETE) valida exactamente lo mismo.
--   Por eso la 029 NO tocó difusión al corregir el drift del resto. Restringirlo pediría
--   un permiso granular de difusión, que hoy no existe. Ver nota técnica 14.
--   ⚠ El texto de acá abajo sale de la BASE VIVA. La migración 008 define
--     `difusion_update`/`difusion_delete` como SOLO-MÉDICO: copiarla habría sacado en
--     silencio esa capacidad a los asistentes. Manda la base.
-- ⚠⚠ Y TRES DE ESTAS CUATRO SON PARTE DEL HALLAZGO. Ver el bloque al final del §8.
DROP POLICY IF EXISTS difusion_select ON public.difusion_posts;
CREATE POLICY difusion_select ON public.difusion_posts
  FOR SELECT TO authenticated
  USING (medico_id = get_medico_id());

DROP POLICY IF EXISTS difusion_insert ON public.difusion_posts;
CREATE POLICY difusion_insert ON public.difusion_posts
  FOR INSERT TO authenticated
  WITH CHECK (medico_id = get_medico_id());

DROP POLICY IF EXISTS difusion_update ON public.difusion_posts;
CREATE POLICY difusion_update ON public.difusion_posts
  FOR UPDATE TO authenticated
  USING (medico_id = get_medico_id())
  WITH CHECK (medico_id = get_medico_id());

DROP POLICY IF EXISTS difusion_delete ON public.difusion_posts;
CREATE POLICY difusion_delete ON public.difusion_posts
  FOR DELETE TO authenticated
  USING (medico_id = get_medico_id());


-- ── difusion_envios ───────────────────────────────────────────────────────────
-- ⚠ SOLO SELECT E INSERT: el log de envíos es APPEND-ONLY. No se edita ni se borra —
--   es el registro de a quién se le mandó qué, y también el contador del tope diario.
DROP POLICY IF EXISTS envios_select ON public.difusion_envios;
CREATE POLICY envios_select ON public.difusion_envios
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.difusion_posts
     WHERE difusion_posts.id = difusion_envios.post_id AND difusion_posts.medico_id = get_medico_id()));

DROP POLICY IF EXISTS envios_insert ON public.difusion_envios;
CREATE POLICY envios_insert ON public.difusion_envios
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.difusion_posts
     WHERE difusion_posts.id = difusion_envios.post_id AND difusion_posts.medico_id = get_medico_id()));


-- ── solicitudes_asistente ─────────────────────────────────────────────────────
-- ⚠ SIN DELETE: una solicitud respondida es historial y se conserva. Desde la 034 el
--   historial ya no bloquea una solicitud nueva (índice único PARCIAL), así que tampoco
--   hace falta borrarlo.
DROP POLICY IF EXISTS solicitudes_select ON public.solicitudes_asistente;
CREATE POLICY solicitudes_select ON public.solicitudes_asistente
  FOR SELECT TO authenticated
  USING ((solicitante_id = auth.uid()) OR (medico_id = auth.uid()));

-- ⚠ El solicitante todavía NO TIENE TENANT (es un asistente sin vincular): por eso acá
--   se compara contra `auth.uid()` y no contra `get_medico_id()`, que para él daría NULL.
DROP POLICY IF EXISTS solicitudes_insert ON public.solicitudes_asistente;
CREATE POLICY solicitudes_insert ON public.solicitudes_asistente
  FOR INSERT TO authenticated
  WITH CHECK (solicitante_id = auth.uid());

-- Solo el médico destinatario responde (aprueba/rechaza).
DROP POLICY IF EXISTS solicitudes_update ON public.solicitudes_asistente;
CREATE POLICY solicitudes_update ON public.solicitudes_asistente
  FOR UPDATE TO authenticated
  USING (medico_id = auth.uid());


-- ── notas ─────────────────────────────────────────────────────────────────────
-- ⚠ Las cuatro comparan contra `auth.uid()`, NO contra `get_medico_id()`: las notas son
--   PERSONALES, no del tenant. El titular no ve las de sus asistentes.
DROP POLICY IF EXISTS notas_select_own ON public.notas;
CREATE POLICY notas_select_own ON public.notas
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS notas_insert_own ON public.notas;
CREATE POLICY notas_insert_own ON public.notas
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS notas_update_own ON public.notas;
CREATE POLICY notas_update_own ON public.notas
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS notas_delete_own ON public.notas;
CREATE POLICY notas_delete_own ON public.notas
  FOR DELETE TO authenticated USING (user_id = auth.uid());


-- ── mensajes_internos ─────────────────────────────────────────────────────────
-- ⚠ Las CUATRO exigen `acceso_mensajeria` desde la migración 046. Hasta ahí NINGUNA lo
--   miraba: el permiso nació en la 015, DOS migraciones antes que la mensajería (017), y
--   cuando llegó ese "uso futuro" nadie lo cableó a la RLS — un asistente con el permiso
--   en FALSE que le pegara a PostgREST directo leía, escribía y borraba igual. Era el
--   tercer y último caso del mismo hueco en el esquema.
--   La 046 aplicó además el TENANT donde faltaba: `mensajes_ver` lo pedía solo en la
--   rama grupal, así que un mensaje INDIVIDUAL sobrevivía a un cambio de médico.
--   Regla de producto vigente: el tenant manda TAMBIÉN sobre los individuales.
--
-- ⚠⚠ LA ASIMETRÍA ENTRE LEER Y BORRAR ES DELIBERADA — NO "CORREGIRLA".
--   El titular PUEDE BORRAR un mensaje individual entre dos de sus asistentes
--   (`medico_id = auth.uid()` en el DELETE) PERO NO PUEDE LEERLO (el SELECT solo deja
--   ver los individuales a remitente y destinatario). Hasta la 046 era accidental; a
--   partir de la 046 está revisada y elegida: el titular no gana visibilidad sobre las
--   conversaciones privadas entre sus asistentes, pero puede borrarlas porque es el
--   dueño del tenant y el responsable de sus datos. Cambiarlo es una DECISIÓN DE
--   PRODUCTO SOBRE PRIVACIDAD, no una corrección técnica. Ver nota técnica 29.
--   Consecuencia asumida: un `DELETE … RETURNING` exige TAMBIÉN la política de SELECT,
--   así que en ese único caso la fila se borra pero no vuelve, y la guarda de "0 filas"
--   de `eliminarMensaje` reportaría "Mensaje no encontrado" sobre un borrado que sí
--   ocurrió. Hoy es inalcanzable desde la UI. NO se arregla ablandando `mensajes_ver`.
DROP POLICY IF EXISTS mensajes_ver ON public.mensajes_internos;
CREATE POLICY mensajes_ver ON public.mensajes_internos
  FOR SELECT TO authenticated
  USING (check_permiso(auth.uid(), 'acceso_mensajeria'::text)
     AND (medico_id = get_medico_id())
     AND ((remitente_id = auth.uid())
       OR ((NOT es_grupal) AND (destinatario_id = auth.uid()))
       OR es_grupal));

DROP POLICY IF EXISTS mensajes_insertar ON public.mensajes_internos;
CREATE POLICY mensajes_insertar ON public.mensajes_internos
  FOR INSERT TO authenticated
  WITH CHECK (check_permiso(auth.uid(), 'acceso_mensajeria'::text)
          AND (remitente_id = auth.uid())
          AND (medico_id = get_medico_id()));

-- ⚠ Es LA ÚNICA política de UPDATE de esta tabla, y solo cubre marcar leído un mensaje
--   INDIVIDUAL del que uno es destinatario. De ahí que `bump_actividad_hilo()` tenga
--   que ser SECURITY DEFINER (§5): esta política lo bloquearía en dos de los tres casos.
DROP POLICY IF EXISTS mensajes_marcar_leido ON public.mensajes_internos;
CREATE POLICY mensajes_marcar_leido ON public.mensajes_internos
  FOR UPDATE TO authenticated
  USING (check_permiso(auth.uid(), 'acceso_mensajeria'::text)
     AND (medico_id = get_medico_id()) AND (NOT es_grupal) AND (destinatario_id = auth.uid()))
  WITH CHECK (check_permiso(auth.uid(), 'acceso_mensajeria'::text)
          AND (medico_id = get_medico_id()) AND (NOT es_grupal) AND (destinatario_id = auth.uid()));

DROP POLICY IF EXISTS mensajes_borrar ON public.mensajes_internos;
CREATE POLICY mensajes_borrar ON public.mensajes_internos
  FOR DELETE TO authenticated
  USING (check_permiso(auth.uid(), 'acceso_mensajeria'::text)
     AND ((remitente_id = auth.uid()) OR (medico_id = auth.uid())));


-- ── mensajes_lecturas ─────────────────────────────────────────────────────────
-- ⚠ SIN política de UPDATE (ver el ⚠ de su CREATE TABLE) y sin DELETE.
DROP POLICY IF EXISTS lecturas_select_own ON public.mensajes_lecturas;
CREATE POLICY lecturas_select_own ON public.mensajes_lecturas
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS lecturas_insert_own ON public.mensajes_lecturas;
CREATE POLICY lecturas_insert_own ON public.mensajes_lecturas
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());


-- ── notificaciones ────────────────────────────────────────────────────────────
-- ⚠ ASIMETRÍA DELIBERADA: SELECT/UPDATE/DELETE comparan contra `auth.uid()` (solo el
--   TITULAR lee y administra sus avisos) pero el INSERT compara contra `get_medico_id()`
--   — porque quien genera el aviso suele ser el ASISTENTE (agenda un turno y el sistema
--   avisa al médico). Si el INSERT pidiera `auth.uid()`, el asistente no podría
--   generarlo. Ver nota técnica 19.
-- ⚠ La migración 029 dropeó una política SELECT duplicada ("Medicos ven sus propias
--   notificaciones"). No recrearla.
DROP POLICY IF EXISTS notificaciones_select ON public.notificaciones;
CREATE POLICY notificaciones_select ON public.notificaciones
  FOR SELECT TO authenticated USING (medico_id = auth.uid());

DROP POLICY IF EXISTS notificaciones_insert ON public.notificaciones;
CREATE POLICY notificaciones_insert ON public.notificaciones
  FOR INSERT TO authenticated WITH CHECK (medico_id = get_medico_id());

DROP POLICY IF EXISTS notificaciones_update ON public.notificaciones;
CREATE POLICY notificaciones_update ON public.notificaciones
  FOR UPDATE TO authenticated USING (medico_id = auth.uid());

DROP POLICY IF EXISTS notificaciones_delete ON public.notificaciones;
CREATE POLICY notificaciones_delete ON public.notificaciones
  FOR DELETE TO authenticated USING (medico_id = auth.uid());


-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠⚠ NOTA SOBRE CUATRO POLÍTICAS DE ESTE §8 — POR QUÉ EL BASELINE FIJA SU ROL
-- ═══════════════════════════════════════════════════════════════════════════════
--   Las políticas
--       · evoluciones_insert  (public.evoluciones)
--       · difusion_insert     (public.difusion_posts)
--       · difusion_update     (public.difusion_posts)
--       · difusion_delete     (public.difusion_posts)
--   están HOY en el rol `authenticated` en la base viva (verificado en `pg_policies`),
--   PERO NINGUNA MIGRACIÓN DEL HISTORIAL LAS PUSO AHÍ. Nacieron sin cláusula `TO` en las
--   migraciones 004 y 008 —o sea, en `{public}`— y la 042, que fue la que barrió el
--   proyecto entero normalizando roles, LAS SALTEÓ EXPLÍCITAMENTE porque al escribirla
--   YA ESTABAN normalizadas. Su encabezado lo dice con todas las letras: son "4 que se
--   normalizaron A MANO, fuera de toda migración, y que solo se descubren mirando la
--   base".
--
--   Es el TERCER caso confirmado de cambio a mano sin migración que lo registre (los
--   otros dos: la fila de catálogo borrada, y el episodio de RLS editada hacia versiones
--   más permisivas que corrigió la 029). Y es el que tenía consecuencia práctica: EN UN
--   ENTORNO NUEVO CONSTRUIDO CON LAS MIGRACIONES, ESTAS CUATRO QUEDARÍAN EN `{public}`,
--   o sea alcanzables por el rol `anon` — peticiones sin sesión contra PostgREST.
--   No sería explotable de inmediato (las cuatro cuelgan de `get_medico_id()`, que para
--   `anon` devuelve NULL y hace fallar el `=`), pero la diferencia de rol es real y el
--   entorno nuevo NO sería igual a producción.
--
--   Este baseline las fija en `authenticated`, que es lo que la base viva tiene, y las
--   deja al mismo nivel que las otras 61. Con eso el hallazgo queda cerrado: a partir de
--   acá el rol de estas cuatro está VERSIONADO y deja de depender de que alguien lo
--   recuerde.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════
-- §9 · STORAGE: BUCKETS Y POLÍTICAS SOBRE storage.objects
-- ═══════════════════════════════════════════════════════════════════════════════
-- Dos buckets, los dos PRIVADOS. El tercero que la app menciona (`difusion`, para
-- `difusion_posts.imagen_path`) NO EXISTE todavía, tampoco en producción.
--
-- ⚠ El aislamiento por tenant se hace comparando el PRIMER SEGMENTO del path
--   (`storage.foldername(name))[1]`) contra `get_medico_id()`. De ahí que las rutas
--   sean `{medico_id}/…`: el tenant no es metadata del objeto, es el primer directorio.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  -- 10 MB. Adjuntos clínicos por paciente: {medico_id}/{paciente_id}/{uuid}.{ext}
  ('estudios',   'estudios',   false, 10485760, ARRAY['application/pdf','image/jpeg','image/png','image/webp']),
  -- 5 MB, SOLO PDF. PDFs congelados de pedidos y certificados:
  -- {medico_id}/{tipo}/{documento_id}.pdf — ruta determinística, por eso el upsert.
  ('documentos', 'documentos', false,  5242880, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;


-- ── bucket `estudios` (4 políticas, migración 026) ────────────────────────────
DROP POLICY IF EXISTS estudios_objects_select ON storage.objects;
CREATE POLICY estudios_objects_select ON storage.objects
  FOR SELECT TO authenticated
  USING ((bucket_id = 'estudios'::text)
     AND ((storage.foldername(name))[1] = (get_medico_id())::text)
     AND check_permiso(auth.uid(), 'ver_historia_clinica'::text));

DROP POLICY IF EXISTS estudios_objects_insert ON storage.objects;
CREATE POLICY estudios_objects_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'estudios'::text)
          AND ((storage.foldername(name))[1] = (get_medico_id())::text)
          AND check_permiso(auth.uid(), 'ver_historia_clinica'::text));

DROP POLICY IF EXISTS estudios_objects_update ON storage.objects;
CREATE POLICY estudios_objects_update ON storage.objects
  FOR UPDATE TO authenticated
  USING ((bucket_id = 'estudios'::text)
     AND ((storage.foldername(name))[1] = (get_medico_id())::text)
     AND check_permiso(auth.uid(), 'ver_historia_clinica'::text))
  WITH CHECK ((bucket_id = 'estudios'::text)
          AND ((storage.foldername(name))[1] = (get_medico_id())::text)
          AND check_permiso(auth.uid(), 'ver_historia_clinica'::text));

-- ⚠ La ÚNICA de las siete que exige ROL MÉDICO. Es la gemela de `estudios_delete` (§8):
--   borrar un estudio es exclusivo del médico (regla 10), y las dos tienen que pedir lo
--   mismo o queda metadata sin archivo (o al revés).
DROP POLICY IF EXISTS estudios_objects_delete ON storage.objects;
CREATE POLICY estudios_objects_delete ON storage.objects
  FOR DELETE TO authenticated
  USING ((bucket_id = 'estudios'::text)
     AND ((storage.foldername(name))[1] = (get_medico_id())::text)
     AND (get_user_role(auth.uid()) = 'medico'::text));


-- ── bucket `documentos` (3 políticas, migración 027) ──────────────────────────
-- ⚠ SIN POLÍTICA DE DELETE, A PROPÓSITO: los documentos no se borran (regla 5). Es
--   coherente con que `pedidos` y `certificados` tampoco tengan DELETE en el §8.
--   El UPDATE existe porque la ruta es determinística y la escritura va por upsert.
-- ⚠ El par de permisos va con OR: el mismo bucket guarda pedidos y certificados, y
--   quien tiene uno de los dos permisos necesita llegar a su propio documento.
DROP POLICY IF EXISTS documentos_objects_select ON storage.objects;
CREATE POLICY documentos_objects_select ON storage.objects
  FOR SELECT TO authenticated
  USING ((bucket_id = 'documentos'::text)
     AND ((storage.foldername(name))[1] = (get_medico_id())::text)
     AND (check_permiso(auth.uid(), 'ver_pedidos'::text) OR check_permiso(auth.uid(), 'ver_certificados'::text)));

DROP POLICY IF EXISTS documentos_objects_insert ON storage.objects;
CREATE POLICY documentos_objects_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'documentos'::text)
          AND ((storage.foldername(name))[1] = (get_medico_id())::text)
          AND (check_permiso(auth.uid(), 'crear_pedidos'::text) OR check_permiso(auth.uid(), 'crear_certificados'::text)));

DROP POLICY IF EXISTS documentos_objects_update ON storage.objects;
CREATE POLICY documentos_objects_update ON storage.objects
  FOR UPDATE TO authenticated
  USING ((bucket_id = 'documentos'::text)
     AND ((storage.foldername(name))[1] = (get_medico_id())::text)
     AND (check_permiso(auth.uid(), 'crear_pedidos'::text) OR check_permiso(auth.uid(), 'crear_certificados'::text)))
  WITH CHECK ((bucket_id = 'documentos'::text)
          AND ((storage.foldername(name))[1] = (get_medico_id())::text)
          AND (check_permiso(auth.uid(), 'crear_pedidos'::text) OR check_permiso(auth.uid(), 'crear_certificados'::text)));

-- ⚠ APRENDIZAJE OPERATIVO (migración 028): los objetos de Storage NO se borran por SQL.
--   El trigger `storage.protect_objects_delete` bloquea `DELETE FROM storage.objects`.
--   Se borran por la API de Storage o por el Dashboard.


-- ═══════════════════════════════════════════════════════════════════════════════
-- §10 · TRIGGER SOBRE auth.users
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠ Vive FUERA del esquema `public` y es imprescindible: sin él, un usuario que se
--   registra NO OBTIENE FILA EN `profiles` y la app lo manda a un loop de onboarding del
--   que no sale. Es lo primero que hay que verificar si en un entorno nuevo "el registro
--   funciona pero después nada anda".
-- ⚠ Necesita privilegios sobre `auth.users`: correr este archivo como `postgres` (el SQL
--   Editor del dashboard de Supabase lo hace). Con un rol de menor privilegio, ESTE es
--   el statement que va a fallar.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ═══════════════════════════════════════════════════════════════════════════════
-- §11 · REALTIME
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⏸ ESTADO: LA ENTREGA EN VIVO NO FUNCIONA Y EL TRABAJO ESTÁ DIFERIDO. Agotados
--   publicación, replica identity, RLS, GRANTs, persistencia, forma del INSERT y
--   cliente —todo descartado por experimento—, la causa quedó acotada a INFRAESTRUCTURA
--   DEL SERVICIO REALTIME DE SUPABASE, fuera de este repo. Ver PENDIENTES.md → Bloque A.
--   Los dos objetos de acá abajo se conservan igual, y por dos motivos: existen en
--   producción (el baseline reproduce la base) y dejan la tabla en el estado que el
--   filtro del canal necesita el día que el servicio responda.

-- ⚠ REPLICA IDENTITY FULL (migración 032). El canal de Realtime filtra por `medico_id`,
--   que NO ES LA PK: con identidad DEFAULT la fila replicada no lleva esa columna y el
--   filtro no puede evaluarse. La hipótesis de que esto era LA causa quedó REFUTADA
--   (con FULL aplicado el evento sigue sin llegar), pero la migración se conservó porque
--   la condición sigue siendo necesaria.
--   ⚠ Costo asumido: FULL hace que cada UPDATE/DELETE escriba la fila COMPLETA en el
--     WAL. Es aceptable en una tabla de mensajes cortos; no lo sería en una tabla ancha.
ALTER TABLE public.mensajes_internos REPLICA IDENTITY FULL;

-- Publicación (migración 023). Idempotente: en un proyecto Supabase nuevo
-- `supabase_realtime` ya existe, pero puede venir vacía o no existir según la versión.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename  = 'mensajes_internos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mensajes_internos;
  END IF;
END $$;

-- ⚠ `mensajes_internos` es la ÚNICA tabla de `public` publicada. Ninguna otra tabla del
--   esquema está en `supabase_realtime`, y no hay que agregarlas "por las dudas":
--   publicar una tabla con datos clínicos amplía la superficie del canal.


-- ═══════════════════════════════════════════════════════════════════════════════
-- §12 · PERMISOS DE EJECUCIÓN SOBRE FUNCIONES DE ACCESO RESTRINGIDO
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠ EL DEFAULT DE POSTGRES ES `EXECUTE` PARA `PUBLIC`. En Supabase eso significa que
--   CUALQUIER cliente —incluido `anon`, sin sesión— puede invocar una función del
--   esquema `public` por PostgREST (`/rest/v1/rpc/<nombre>`). Para una SECURITY DEFINER
--   eso es exactamente lo que hay que cerrar. Las otras diez funciones del esquema
--   quedan con el default a propósito: o son helpers que las políticas necesitan poder
--   invocar en el contexto del usuario, o son funciones de trigger (no invocables por RPC).

-- `verificar_documento` (migración 025). Sirve a la ruta PÚBLICA /verificar/[codigo],
-- pero la llama el SERVIDOR con el admin client, nunca el navegador. Sin este REVOKE,
-- cualquiera podría enumerar códigos contra el endpoint RPC.
REVOKE ALL ON FUNCTION public.verificar_documento(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verificar_documento(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verificar_documento(text) TO service_role;

-- `check_rate_limit` (migración 031). Es el rate limiter: si un cliente pudiera
-- invocarlo, podría AGOTAR LA VENTANA DE OTRO USUARIO llamándola con su key
-- (`login:<ip>:<email>`) y dejarlo afuera del login. Solo el servidor la llama.
REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;

-- ⚠ La app trata el rate limiter como FAIL-OPEN: si la RPC falla o tarda más de 2 s,
--   PERMITE el request y loguea. Es deliberado — si `rate_limits` no responde, la auth
--   tampoco, y fail-closed convertiría un problema puntual en una caída total del login.

-- ⚠ Los GRANT de TABLA no se emiten acá: los pone Supabase por privilegios por defecto
--   (anon/authenticated/service_role reciben ALL sobre las tablas nuevas de `public`).
--   Un proyecto nuevo los reproduce solo, y quien restringe de verdad es la RLS del §8.


-- ═══════════════════════════════════════════════════════════════════════════════
-- §13 · CARGA INICIAL DEL CATÁLOGO
-- ═══════════════════════════════════════════════════════════════════════════════
-- La ÚNICA tabla con datos en este baseline. Contenido exacto de la base viva: 13 filas.
--
-- ⚠⚠ EL id 13 ESTÁ HUECO A PROPÓSITO Y NO HAY QUE "COMPLETARLO".
--   Era 'Particular / Sin obra social', la fila que sembraba la migración 001 y que la
--   045 ELIMINÓ deliberadamente: un paciente particular se modela como AUSENCIA de dato,
--   no como una cobertura del catálogo. Ver el ⚠ del CREATE TABLE y la nota técnica 28.
--   Los ids van EXPLÍCITOS —y no delegados al SERIAL— justamente para que el hueco se
--   conserve y para que un entorno nuevo tenga los MISMOS ids que producción.
--
-- ⚠ IOSEP (id 14) la agregó la migración 035, después de la 045 en el tiempo pero antes
--   en la numeración: por eso su id es POSTERIOR al hueco.

INSERT INTO public.obras_sociales (id, nombre) VALUES
  ( 1, 'OSDE'),
  ( 2, 'Swiss Medical'),
  ( 3, 'Galeno'),
  ( 4, 'Medifé'),
  ( 5, 'IOMA'),
  ( 6, 'PAMI'),
  ( 7, 'Sancor Salud'),
  ( 8, 'Provincia Salud'),
  ( 9, 'Luis Pasteur'),
  (10, 'Accord Salud'),
  (11, 'Federada Salud'),
  (12, 'UPCN'),
  -- (13) → HUECO. Ver arriba.
  (14, 'IOSEP')
ON CONFLICT (id) DO NOTHING;

-- ⚠ OBLIGATORIO: al insertar con id explícito la secuencia NO avanza, así que sin este
--   setval el próximo INSERT sin id intentaría el 1 y chocaría contra la PK.
SELECT setval('public.obras_sociales_id_seq', (SELECT MAX(id) FROM public.obras_sociales), true);


-- ═══════════════════════════════════════════════════════════════════════════════
-- FIN DEL BASELINE
-- ═══════════════════════════════════════════════════════════════════════════════
-- QUÉ NUMERAR DESPUÉS: las migraciones nuevas siguen desde 049 (la 048 ya está
-- incorporada en este archivo). Este archivo es 000
-- para que ordene ANTES que todo el historial y no colisione con la 001.
--
-- ⚠ ESTE ARCHIVO NO SE APLICÓ NUNCA y la verificación fue por COMPARACIÓN, no por
--   ejecución. El aviso completo —cuál es el riesgo y qué falta para darlo por
--   verificado— está ARRIBA DE TODO, en la cabecera de este mismo archivo. El detalle,
--   en `_historico/README.md`.
-- ═══════════════════════════════════════════════════════════════════════════════
