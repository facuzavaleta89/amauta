-- ============================================================================
-- schema.sql — SNAPSHOT CONSOLIDADO DEL ESQUEMA (Amauta)
-- ============================================================================
-- Este archivo es un SNAPSHOT del estado FINAL del esquema de la base de datos,
-- reconstruido a partir de las migraciones en supabase/migrations/ (001→026).
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
-- exigir check_permiso 'ver_historia_clinica' — ver sección STORAGE al final).
--
-- ⚠ NO reemplaza al sistema de migraciones. Las migraciones reales — la fuente
--   de verdad para aplicar cambios — siguen viviendo en supabase/migrations/.
--   No apliques este archivo directamente sobre una base existente.
--
-- Reconstruido para reflejar la forma ACTUAL de cada tabla (con todas las
-- columnas agregadas en bloques posteriores), no la historia de migraciones.
--
-- ⚠ Verificar: algunos objetos NO tienen migración fuente en supabase/migrations/
--   (fueron aplicados directamente en Supabase). Están marcados con
--   "-- ⚠ SIN MIGRACIÓN FUENTE" y su forma se dedujo de los tipos TS y del uso
--   en el código. Ver PENDIENTES.md → Bloque A.
--     · Tabla `consultas` completa (su columna `campos_extra` sí tiene fuente: migración 022)
--     · Columnas `turnos.categoria`, `turnos.origen`, `turnos.consulta_id`
--     · Columnas `profiles.titulo`, `profiles.matriculas`, `profiles.logo_url`
--     · Tabla `notificaciones` (sin migración fuente; su estructura se verificó
--       contra la base real y se reconstruye — ver su sección más abajo)
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

  -- Identidad profesional del médico (se estampan en los PDF).
  matricula   TEXT,                          -- @deprecated → usar matriculas (jsonb)
  firma_url   TEXT,                           -- Firma digitalizada (base64/URL)
  titulo      TEXT,                           -- ⚠ SIN MIGRACIÓN FUENTE — Dr./Dra./Lic./...
  matriculas  JSONB DEFAULT '[]'::jsonb,      -- ⚠ SIN MIGRACIÓN FUENTE — [{tipo:'MP'|'MN'|'ME', numero}]
  logo_url    TEXT,                           -- ⚠ SIN MIGRACIÓN FUENTE — sello/logo (base64)

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
  acceso_mensajeria     BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_profiles_medico ON public.profiles(medico_id);

-- ── obras_sociales ──────────────────────────────────────────────────────────
-- Catálogo de obras sociales. Lectura pública para autenticados.
-- NOTA: la seed incluye 'Particular / Sin obra social' como registro real.
CREATE TABLE public.obras_sociales (
  id     SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
);

-- ── pacientes ───────────────────────────────────────────────────────────────
-- Pacientes del consultorio. creado_por = UUID del médico dueño (tenant key).
CREATE TABLE public.pacientes (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dni              TEXT NOT NULL UNIQUE,
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
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
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
-- ⚠ SIN MIGRACIÓN FUENTE. Reconstruida desde src/types/consulta.ts + uso en
-- src/app/api/consultas/. Consultas cronológicas del nuevo modelo de HC
-- (Bloque 1), específicas para diabetología. medico_id = tenant key.
CREATE TABLE public.consultas (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paciente_id            UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  medico_id              UUID NOT NULL REFERENCES public.profiles(id),  -- tenant key
  fecha_hora             TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Motivo y anamnesis
  motivo_consulta        TEXT,
  anamnesis              TEXT,
  -- Examen físico
  peso_kg                NUMERIC(5,2),
  talla_cm               NUMERIC(5,2),
  ta_sistolica           INTEGER,
  ta_diastolica          INTEGER,
  frecuencia_cardiaca    INTEGER,
  temperatura            NUMERIC(4,2),
  -- Parámetros metabólicos
  glucemia_ayunas        NUMERIC(5,1),
  glucemia_postprandial  NUMERIC(5,1),
  hba1c                  NUMERIC(4,2),
  trigliceridos          NUMERIC(5,1),
  colesterol_ldl         NUMERIC(5,1),
  colesterol_hdl         NUMERIC(5,1),
  -- Diagnóstico y plan
  diagnostico            TEXT,
  plan_terapeutico       TEXT,
  medicacion_actual      TEXT,
  observaciones          TEXT,
  -- Seguimiento
  proximo_turno_sugerido DATE,
  -- Campos extra ad-hoc por consulta (migración 022): array [{ seccion, nombre, valor }],
  -- seccion ∈ 'examen_fisico' | 'parametros_metabolicos'. Preserva el orden de carga.
  campos_extra           JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Estado: 'finalizada' es inmutable desde la UI
  estado                 TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'finalizada')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_consultas_paciente ON public.consultas(paciente_id);
CREATE INDEX idx_consultas_medico   ON public.consultas(medico_id);

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
-- consulta_id son del Bloque 4 y NO tienen migración fuente.
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
  -- ⚠ SIN MIGRACIÓN FUENTE (Bloque 4):
  categoria     TEXT NOT NULL DEFAULT 'turno_medico'
                CHECK (categoria IN ('turno_medico','curso','personal','administrativo','recordatorio')),
  origen        TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','desde_hc')),
  consulta_id   UUID REFERENCES public.consultas(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_turnos_fecha    ON public.turnos(fecha_inicio);
CREATE INDEX idx_turnos_rango    ON public.turnos(fecha_inicio, fecha_fin);
CREATE INDEX idx_turnos_paciente ON public.turnos(paciente_id);
CREATE INDEX idx_turnos_estado   ON public.turnos(estado);
CREATE INDEX idx_turnos_medico   ON public.turnos(medico_id);

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
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bloqueos_medico ON public.bloqueos_agenda(medico_id);

-- ── turnos_audit_log ────────────────────────────────────────────────────────
-- Log automático (vía trigger) de cambios en turnos.
CREATE TABLE public.turnos_audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  turno_id    UUID NOT NULL REFERENCES public.turnos(id) ON DELETE CASCADE,
  usuario_id  UUID NOT NULL REFERENCES public.profiles(id),
  accion      TEXT NOT NULL,                  -- 'creado' | 'modificado' | 'cancelado' | 'reprogramado'
  detalle     JSONB,                          -- {antes, despues}
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_turno   ON public.turnos_audit_log(turno_id);
CREATE INDEX idx_audit_usuario ON public.turnos_audit_log(usuario_id);

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
  pdf_path           TEXT,
  pdf_generado_at    TIMESTAMPTZ,
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
  pdf_path           TEXT,
  pdf_generado_at    TIMESTAMPTZ,
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
-- Historial de envíos de un post de difusión.
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
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(solicitante_id, medico_id)
);
CREATE INDEX idx_solicitudes_medico      ON public.solicitudes_asistente(medico_id);
CREATE INDEX idx_solicitudes_solicitante ON public.solicitudes_asistente(solicitante_id);
CREATE INDEX idx_solicitudes_estado      ON public.solicitudes_asistente(estado);

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
  CONSTRAINT mensajes_destinatario_check
    CHECK (es_grupal = true OR destinatario_id IS NOT NULL)
);
CREATE INDEX mensajes_destinatario_idx  ON public.mensajes_internos(destinatario_id, created_at DESC);
CREATE INDEX mensajes_remitente_idx     ON public.mensajes_internos(remitente_id, created_at DESC);
CREATE INDEX mensajes_medico_grupal_idx ON public.mensajes_internos(medico_id, es_grupal, created_at DESC);

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
-- ⚠ SIN MIGRACIÓN FUENTE: la tabla se aplicó directo en Supabase (no hay CREATE en
-- supabase/migrations/). La estructura de abajo se VERIFICÓ contra la base real y se
-- reconstruye fielmente. Avisos del sistema para el médico. Referencias en el código:
--   · SELECT  → src/app/(app)/notificaciones/page.tsx        (.eq('medico_id', ...))
--   · INSERT  → src/app/api/turnero/route.ts                 (turno agendado por asistente)
--   · INSERT  → src/app/api/cron/recordatorios/route.ts      (recordatorio 24hs enviado)
-- TODO: crear la migración fuente para versionarla. Ver PENDIENTES.md → Bloque A.
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
ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

-- RLS de notificaciones (el médico solo ve/gestiona las propias).
-- ⚠ La auditoría confirmó los NOMBRES de las políticas (notificaciones_select/insert/
--   update/delete) + una duplicada "Medicos ven sus propias notificaciones" (redundante
--   con el SELECT). Los PREDICADOS de abajo son una reconstrucción plausible
--   (medico_id = auth.uid()), no verificados uno a uno contra la base.
CREATE POLICY "notificaciones_select" ON public.notificaciones
  FOR SELECT USING (medico_id = auth.uid());
CREATE POLICY "notificaciones_insert" ON public.notificaciones
  FOR INSERT WITH CHECK (medico_id = auth.uid());
CREATE POLICY "notificaciones_update" ON public.notificaciones
  FOR UPDATE USING (medico_id = auth.uid());
CREATE POLICY "notificaciones_delete" ON public.notificaciones
  FOR DELETE USING (medico_id = auth.uid());


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
CREATE OR REPLACE FUNCTION public.get_medico_id()
RETURNS uuid AS $$
  SELECT CASE
    WHEN role = 'medico'    THEN id
    WHEN role = 'asistente' THEN medico_id
    ELSE NULL
  END
  FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

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

-- Trigger: registra en turnos_audit_log cada alta/cambio de un turno.
-- SECURITY DEFINER con search_path fijo (migración 025).
CREATE OR REPLACE FUNCTION public.log_turno_cambio()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.turnos_audit_log (turno_id, usuario_id, accion, detalle)
    VALUES (NEW.id, NEW.agendado_por, 'creado', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.turnos_audit_log (turno_id, usuario_id, accion, detalle)
    VALUES (
      NEW.id,
      COALESCE(auth.uid(), NEW.agendado_por),
      CASE
        WHEN NEW.estado = 'cancelado'             THEN 'cancelado'
        WHEN OLD.fecha_inicio <> NEW.fecha_inicio THEN 'reprogramado'
        ELSE 'modificado'
      END,
      jsonb_build_object('antes', to_jsonb(OLD), 'despues', to_jsonb(NEW))
    );
  END IF;
  RETURN NEW;
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
CREATE TRIGGER pedidos_updated_at         BEFORE UPDATE ON public.pedidos              FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER certificados_updated_at    BEFORE UPDATE ON public.certificados         FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER recetas_updated_at         BEFORE UPDATE ON public.recetas              FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER difusion_updated_at        BEFORE UPDATE ON public.difusion_posts       FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER solicitudes_updated_at     BEFORE UPDATE ON public.solicitudes_asistente FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER set_notas_updated_at       BEFORE UPDATE ON public.notas                FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER turno_audit_trigger
  AFTER INSERT OR UPDATE ON public.turnos
  FOR EACH ROW EXECUTE PROCEDURE public.log_turno_cambio();


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
  FOR SELECT USING (
    auth.uid() = id
    OR public.get_user_role(auth.uid()) = 'medico'
    OR medico_id = auth.uid()
    OR id = public.get_user_medico_id(auth.uid())
    OR medico_id = public.get_user_medico_id(auth.uid())
  );
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- ── obras_sociales ──────────────────────────────────────────────────────────
CREATE POLICY "obras_sociales_select_all" ON public.obras_sociales
  FOR SELECT USING (auth.role() = 'authenticated');

-- ── pacientes ───────────────────────────────────────────────────────────────
CREATE POLICY "pacientes_select" ON public.pacientes
  FOR SELECT USING (creado_por = get_medico_id() AND public.check_permiso(auth.uid(), 'ver_pacientes'));
CREATE POLICY "pacientes_insert" ON public.pacientes
  FOR INSERT WITH CHECK (creado_por = get_medico_id() AND public.check_permiso(auth.uid(), 'editar_pacientes'));
CREATE POLICY "pacientes_update" ON public.pacientes
  FOR UPDATE USING (creado_por = get_medico_id() AND public.check_permiso(auth.uid(), 'editar_pacientes'));
CREATE POLICY "pacientes_delete" ON public.pacientes
  FOR DELETE USING (creado_por = auth.uid() AND public.get_user_role(auth.uid()) = 'medico');

-- ── historia_clinica ────────────────────────────────────────────────────────
CREATE POLICY "historia_select" ON public.historia_clinica
  FOR SELECT USING (public.check_permiso(auth.uid(), 'ver_historia_clinica')
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = historia_clinica.paciente_id AND creado_por = get_medico_id()));
CREATE POLICY "historia_insert" ON public.historia_clinica
  FOR INSERT WITH CHECK (public.check_permiso(auth.uid(), 'ver_historia_clinica')
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = historia_clinica.paciente_id AND creado_por = get_medico_id()));
CREATE POLICY "historia_update" ON public.historia_clinica
  FOR UPDATE USING (public.check_permiso(auth.uid(), 'ver_historia_clinica')
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = historia_clinica.paciente_id AND creado_por = get_medico_id()));
CREATE POLICY "historia_delete" ON public.historia_clinica
  FOR DELETE USING (public.get_user_role(auth.uid()) = 'medico'
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = historia_clinica.paciente_id AND creado_por = auth.uid()));

-- ── consultas ───────────────────────────────────────────────────────────────
-- ⚠ La migración 025 dropeó dos políticas huérfanas (medico_full_access,
--   asistente_access) que existían solo en la base (no en migraciones) y daban a
--   cualquier asistente acceso ALL a las consultas del tenant, salteando
--   check_permiso(). Las cuatro políticas de abajo son las únicas correctas.
CREATE POLICY "consultas_select" ON public.consultas
  FOR SELECT USING (public.check_permiso(auth.uid(), 'ver_historia_clinica') AND medico_id = get_medico_id());
CREATE POLICY "consultas_insert" ON public.consultas
  FOR INSERT WITH CHECK (public.check_permiso(auth.uid(), 'crear_consultas') AND medico_id = get_medico_id());
CREATE POLICY "consultas_update" ON public.consultas
  FOR UPDATE USING (medico_id = get_medico_id() AND (
    public.get_user_role(auth.uid()) = 'medico'
    OR public.check_permiso(auth.uid(), 'crear_consultas')
    OR public.check_permiso(auth.uid(), 'finalizar_consultas')));
CREATE POLICY "consultas_delete" ON public.consultas
  FOR DELETE USING (public.get_user_role(auth.uid()) = 'medico' AND medico_id = auth.uid());

-- ── estudios ────────────────────────────────────────────────────────────────
-- Endurecidas en la migración 026: select/insert/update exigen ahora
-- check_permiso 'ver_historia_clinica' (antes cualquier asistente del tenant
-- accedía — mismo hueco que tenía consultas antes de la 025). El delete queda
-- exclusivo del médico. El predicado de tenant usa get_medico_id() en las cuatro.
CREATE POLICY "estudios_select" ON public.estudios
  FOR SELECT USING (public.check_permiso(auth.uid(), 'ver_historia_clinica')
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = estudios.paciente_id AND creado_por = get_medico_id()));
CREATE POLICY "estudios_insert" ON public.estudios
  FOR INSERT WITH CHECK (public.check_permiso(auth.uid(), 'ver_historia_clinica')
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = estudios.paciente_id AND creado_por = get_medico_id()));
CREATE POLICY "estudios_update" ON public.estudios
  FOR UPDATE USING (public.check_permiso(auth.uid(), 'ver_historia_clinica')
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = estudios.paciente_id AND creado_por = get_medico_id()));
CREATE POLICY "estudios_delete" ON public.estudios
  FOR DELETE USING (public.get_user_role(auth.uid()) = 'medico'
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = estudios.paciente_id AND creado_por = get_medico_id()));

-- ── evoluciones ─────────────────────────────────────────────────────────────
CREATE POLICY "evoluciones_select" ON public.evoluciones
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.pacientes WHERE id = evoluciones.paciente_id AND creado_por = get_medico_id()));
CREATE POLICY "evoluciones_insert" ON public.evoluciones
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.pacientes WHERE id = evoluciones.paciente_id AND creado_por = get_medico_id()));
CREATE POLICY "evoluciones_update" ON public.evoluciones
  FOR UPDATE USING (public.get_user_role(auth.uid()) = 'medico'
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = evoluciones.paciente_id AND creado_por = auth.uid()));
CREATE POLICY "evoluciones_delete" ON public.evoluciones
  FOR DELETE USING (public.get_user_role(auth.uid()) = 'medico'
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = evoluciones.paciente_id AND creado_por = auth.uid()));

-- ── turnos ──────────────────────────────────────────────────────────────────
CREATE POLICY "turnos_select" ON public.turnos
  FOR SELECT USING (medico_id = get_medico_id() AND public.check_permiso(auth.uid(), 'ver_turnos'));
CREATE POLICY "turnos_insert" ON public.turnos
  FOR INSERT WITH CHECK (medico_id = get_medico_id() AND public.check_permiso(auth.uid(), 'gestionar_turnos'));
CREATE POLICY "turnos_update" ON public.turnos
  FOR UPDATE USING (medico_id = get_medico_id() AND public.check_permiso(auth.uid(), 'gestionar_turnos'));
CREATE POLICY "turnos_delete" ON public.turnos
  FOR DELETE USING (medico_id = auth.uid() AND public.get_user_role(auth.uid()) = 'medico');

-- ── bloqueos_agenda ─────────────────────────────────────────────────────────
CREATE POLICY "bloqueos_select" ON public.bloqueos_agenda
  FOR SELECT USING (medico_id = get_medico_id());
CREATE POLICY "bloqueos_insert" ON public.bloqueos_agenda
  FOR INSERT WITH CHECK (medico_id = get_medico_id() AND public.check_permiso(auth.uid(), 'gestionar_turnos'));
CREATE POLICY "bloqueos_delete" ON public.bloqueos_agenda
  FOR DELETE USING (medico_id = auth.uid() AND public.get_user_role(auth.uid()) = 'medico');

-- ── turnos_audit_log ────────────────────────────────────────────────────────
-- SELECT permitido al tenant; el INSERT lo hace el trigger (SECURITY DEFINER),
-- no hay política de INSERT para clientes (revocada en la migración 014).
CREATE POLICY "audit_select" ON public.turnos_audit_log
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.turnos WHERE id = turnos_audit_log.turno_id AND medico_id = get_medico_id()));

-- ── pedidos ─────────────────────────────────────────────────────────────────
CREATE POLICY "pedidos_select" ON public.pedidos
  FOR SELECT USING (public.check_permiso(auth.uid(), 'ver_pedidos')
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = pedidos.paciente_id AND creado_por = get_medico_id()));
CREATE POLICY "pedidos_insert" ON public.pedidos
  FOR INSERT WITH CHECK (public.check_permiso(auth.uid(), 'crear_pedidos')
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = pedidos.paciente_id AND creado_por = get_medico_id()));
CREATE POLICY "pedidos_update" ON public.pedidos
  FOR UPDATE USING (public.check_permiso(auth.uid(), 'crear_pedidos')
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = pedidos.paciente_id AND creado_por = get_medico_id()));
-- Sin política de DELETE: los pedidos NO se borran, solo se anulan (regla de negocio 5).
-- La política pedidos_delete fue dropeada en la migración 025 (sin DELETE, RLS lo niega).

-- ── certificados ────────────────────────────────────────────────────────────
CREATE POLICY "certificados_select" ON public.certificados
  FOR SELECT USING (public.check_permiso(auth.uid(), 'ver_certificados')
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = certificados.paciente_id AND creado_por = get_medico_id()));
CREATE POLICY "certificados_insert" ON public.certificados
  FOR INSERT WITH CHECK (public.check_permiso(auth.uid(), 'crear_certificados')
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = certificados.paciente_id AND creado_por = get_medico_id()));
CREATE POLICY "certificados_update" ON public.certificados
  FOR UPDATE USING (public.check_permiso(auth.uid(), 'crear_certificados')
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = certificados.paciente_id AND creado_por = get_medico_id()));
-- Sin política de DELETE: los certificados NO se borran, solo se anulan (regla de negocio 5).
-- La política certificados_delete fue dropeada en la migración 025 (sin DELETE, RLS lo niega).

-- ── recetas ─────────────────────────────────────────────────────────────────
-- Los asistentes solo pueden VER; crear/modificar/eliminar es exclusivo del médico.
CREATE POLICY "recetas_select" ON public.recetas
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.pacientes WHERE id = recetas.paciente_id AND creado_por = get_medico_id()));
CREATE POLICY "recetas_insert" ON public.recetas
  FOR INSERT WITH CHECK (public.get_user_role(auth.uid()) = 'medico'
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = recetas.paciente_id AND creado_por = auth.uid()));
CREATE POLICY "recetas_update" ON public.recetas
  FOR UPDATE USING (public.get_user_role(auth.uid()) = 'medico'
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = recetas.paciente_id AND creado_por = auth.uid()));
CREATE POLICY "recetas_delete" ON public.recetas
  FOR DELETE USING (public.get_user_role(auth.uid()) = 'medico'
    AND EXISTS (SELECT 1 FROM public.pacientes WHERE id = recetas.paciente_id AND creado_por = auth.uid()));

-- ── difusion_posts ──────────────────────────────────────────────────────────
-- Asistentes pueden ver/crear (borrador); publicar/editar/eliminar es del médico.
CREATE POLICY "difusion_select" ON public.difusion_posts
  FOR SELECT USING (medico_id = get_medico_id());
CREATE POLICY "difusion_insert" ON public.difusion_posts
  FOR INSERT WITH CHECK (medico_id = get_medico_id());
CREATE POLICY "difusion_update" ON public.difusion_posts
  FOR UPDATE USING (medico_id = auth.uid() AND public.get_user_role(auth.uid()) = 'medico');
CREATE POLICY "difusion_delete" ON public.difusion_posts
  FOR DELETE USING (medico_id = auth.uid() AND public.get_user_role(auth.uid()) = 'medico');

-- ── difusion_envios ─────────────────────────────────────────────────────────
CREATE POLICY "envios_select" ON public.difusion_envios
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.difusion_posts WHERE id = difusion_envios.post_id AND medico_id = get_medico_id()));
CREATE POLICY "envios_insert" ON public.difusion_envios
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.difusion_posts WHERE id = difusion_envios.post_id AND medico_id = get_medico_id()));

-- ── solicitudes_asistente ───────────────────────────────────────────────────
CREATE POLICY "solicitudes_select" ON public.solicitudes_asistente
  FOR SELECT USING (solicitante_id = auth.uid() OR medico_id = auth.uid());
CREATE POLICY "solicitudes_insert" ON public.solicitudes_asistente
  FOR INSERT WITH CHECK (solicitante_id = auth.uid());
CREATE POLICY "solicitudes_update" ON public.solicitudes_asistente
  FOR UPDATE USING (medico_id = auth.uid());

-- ── notas ───────────────────────────────────────────────────────────────────
CREATE POLICY "notas_select_own" ON public.notas FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "notas_insert_own" ON public.notas FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "notas_update_own" ON public.notas FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "notas_delete_own" ON public.notas FOR DELETE USING (user_id = auth.uid());

-- ── mensajes_internos ───────────────────────────────────────────────────────
CREATE POLICY "mensajes_ver" ON public.mensajes_internos
  FOR SELECT USING (
    remitente_id = auth.uid()
    OR (NOT es_grupal AND destinatario_id = auth.uid())
    OR (es_grupal AND medico_id = get_medico_id()));
CREATE POLICY "mensajes_insertar" ON public.mensajes_internos
  FOR INSERT WITH CHECK (remitente_id = auth.uid() AND medico_id = get_medico_id());
CREATE POLICY "mensajes_marcar_leido" ON public.mensajes_internos
  FOR UPDATE USING (NOT es_grupal AND destinatario_id = auth.uid())
  WITH CHECK (NOT es_grupal AND destinatario_id = auth.uid());
CREATE POLICY "mensajes_borrar" ON public.mensajes_internos
  FOR DELETE USING (remitente_id = auth.uid() OR medico_id = auth.uid());

-- ── mensajes_lecturas ───────────────────────────────────────────────────────
CREATE POLICY "lecturas_select_own" ON public.mensajes_lecturas
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "lecturas_insert_own" ON public.mensajes_lecturas
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ STORAGE — bucket privado `estudios` (migración 026)                        │
-- └──────────────────────────────────────────────────────────────────────────┘
-- Único bucket creado por migración. Los buckets `documentos` y `difusion` NO
-- existen todavía (ver PENDIENTES.md → Bloque A).
--
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


-- ============================================================================
-- FIN DEL SNAPSHOT
-- ============================================================================
