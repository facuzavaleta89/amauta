-- ============================================================================
-- Migration 030 — Recreación de objetos SIN migración fuente (huérfanos)
-- ============================================================================
-- Versiona el `CREATE` de los objetos que EXISTEN en la base pero se aplicaron a
-- mano en el dashboard y nunca tuvieron fuente en supabase/migrations/:
--   1. Tabla `consultas` (+ constraints, índices, trigger, 4 RLS).
--   2. Tabla `notificaciones` (+ RLS, 4 políticas).
--   3. Columnas huérfanas de `turnos` (categoria/origen/consulta_id + 3 CHECK).
--   4. Columnas huérfanas de `profiles` (titulo/matriculas/logo_url).
--
-- Toda la migración es IDEMPOTENTE: corre contra la base ACTUAL sin fallar (los
-- objetos ya existen → CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / DROP
-- POLICY IF EXISTS son no-ops) y contra un entorno nuevo creándolos.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠ LIMITACIÓN DE ORDEN (alcance real de esta migración)
--   El objetivo de la 030 es que el ESTADO FINAL sea reproducible: que todos los
--   objetos tengan su CREATE versionado en algún lado. NO vuelve ejecutable la
--   SECUENCIA completa desde cero. Las migraciones 013, 014, 015, 022 y 025 YA
--   referencian `public.consultas` (RLS y ALTER) sin que ninguna la cree, así que
--   correr el set desde una base vacía falla mucho antes de llegar acá (en la 013,
--   y la 022 también fallaría). Esa limitación es PREEXISTENTE a esta tanda; una
--   consolidación de baseline (mover estos CREATE al principio del historial) es un
--   trabajo aparte que NO se hace ahora. Contra la base actual, todo esto corre bien.
--
-- ⚠ DIVERGENCIAS corregidas respecto de schema.sql (la base es la fuente de verdad)
--   Los tipos NUMERIC de `consultas` de abajo son los REALES de la base y difieren
--   de lo que hoy dice schema.sql (que se corrige después, en el trabajo de repo):
--     talla_cm              base numeric(5,1)  — schema.sql decía (5,2)
--     temperatura           base numeric(4,1)  — schema.sql decía (4,2)
--     glucemia_ayunas       base numeric(6,2)  — schema.sql decía (5,1)
--     glucemia_postprandial base numeric(6,2)  — schema.sql decía (5,1)
--     trigliceridos         base numeric(6,2)  — schema.sql decía (5,1)
--     colesterol_ldl        base numeric(6,2)  — schema.sql decía (5,1)
--     colesterol_hdl        base numeric(6,2)  — schema.sql decía (5,1)
--   Además created_at/updated_at son NULLABLE en la base (schema.sql los ponía NOT
--   NULL). Se reproduce la base tal cual.
-- ============================================================================


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 1. Tabla `consultas`                                                       │
-- └──────────────────────────────────────────────────────────────────────────┘
-- Consultas cronológicas del modelo de HC (Bloque 1), diabetología. medico_id =
-- tenant key. Nombres de constraint explícitos para que coincidan con la base real
-- (consultas_pkey / consultas_paciente_id_fkey / consultas_medico_id_fkey /
-- consultas_estado_check). Los tipos son los AUDITADOS (ver encabezado).
--
-- Sobre `campos_extra`: su fuente real es la migración 022 (ADD COLUMN IF NOT
-- EXISTS campos_extra …), que corre ANTES que esta (022 < 030). Acá la incluimos en
-- el CREATE para que el estado final quede completo. Interacción por entorno:
--   · Base actual: la tabla y la columna ya existen → CREATE TABLE IF NOT EXISTS es
--     no-op; la 022 ya se aplicó en su momento. Sin conflicto.
--   · Entorno nuevo (secuencia desde cero): la 022 se ejecuta antes y FALLA porque
--     `consultas` todavía no existe (parte de la limitación de orden de arriba). Si,
--     hipotéticamente, la 022 corriera DESPUÉS de la 030, su ADD COLUMN IF NOT
--     EXISTS sería un no-op inofensivo (la columna ya estaría creada acá).
CREATE TABLE IF NOT EXISTS public.consultas (
  id                     UUID NOT NULL DEFAULT gen_random_uuid()
                           CONSTRAINT consultas_pkey PRIMARY KEY,
  paciente_id            UUID NOT NULL
                           CONSTRAINT consultas_paciente_id_fkey
                           REFERENCES public.pacientes(id) ON DELETE CASCADE,
  medico_id              UUID NOT NULL
                           CONSTRAINT consultas_medico_id_fkey
                           REFERENCES public.profiles(id),
  fecha_hora             TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Motivo y anamnesis
  motivo_consulta        TEXT,
  anamnesis              TEXT,
  -- Examen físico
  peso_kg                NUMERIC(5,2),
  talla_cm               NUMERIC(5,1),   -- base: (5,1)
  ta_sistolica           INTEGER,
  ta_diastolica          INTEGER,
  frecuencia_cardiaca    INTEGER,
  temperatura            NUMERIC(4,1),   -- base: (4,1)
  -- Parámetros metabólicos
  glucemia_ayunas        NUMERIC(6,2),   -- base: (6,2)
  glucemia_postprandial  NUMERIC(6,2),   -- base: (6,2)
  hba1c                  NUMERIC(4,2),
  trigliceridos          NUMERIC(6,2),   -- base: (6,2)
  colesterol_ldl         NUMERIC(6,2),   -- base: (6,2)
  colesterol_hdl         NUMERIC(6,2),   -- base: (6,2)
  -- Diagnóstico y plan
  diagnostico            TEXT,
  plan_terapeutico       TEXT,
  medicacion_actual      TEXT,
  observaciones          TEXT,
  -- Seguimiento
  proximo_turno_sugerido DATE,
  -- Estado ('finalizada' es inmutable desde la UI)
  estado                 TEXT NOT NULL DEFAULT 'borrador'
                           CONSTRAINT consultas_estado_check
                           CHECK (estado = ANY (ARRAY['borrador'::text, 'finalizada'::text])),
  -- created_at/updated_at NULLABLE en la base (no NOT NULL)
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now(),
  -- Campos extra ad-hoc por consulta (fuente real: migración 022)
  campos_extra           JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_consultas_paciente ON public.consultas(paciente_id);
CREATE INDEX IF NOT EXISTS idx_consultas_medico   ON public.consultas(medico_id);

ALTER TABLE public.consultas ENABLE ROW LEVEL SECURITY;

-- Trigger updated_at: ya usa set_updated_at() (la 029 lo repunteó desde la función
-- duplicada). Lo recreamos idempotente por si la tabla se crea en un entorno nuevo.
DROP TRIGGER IF EXISTS consultas_updated_at ON public.consultas;
CREATE TRIGGER consultas_updated_at
  BEFORE UPDATE ON public.consultas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Las 4 políticas RLS correctas (ya vigentes; documentadas en schema.sql). No las
-- toca la 029. Se recrean con DROP … IF EXISTS para que la migración sea idempotente.
DROP POLICY IF EXISTS "consultas_select" ON public.consultas;
CREATE POLICY "consultas_select" ON public.consultas
  FOR SELECT USING (
    public.check_permiso(auth.uid(), 'ver_historia_clinica')
    AND medico_id = get_medico_id()
  );

DROP POLICY IF EXISTS "consultas_insert" ON public.consultas;
CREATE POLICY "consultas_insert" ON public.consultas
  FOR INSERT WITH CHECK (
    public.check_permiso(auth.uid(), 'crear_consultas')
    AND medico_id = get_medico_id()
  );

DROP POLICY IF EXISTS "consultas_update" ON public.consultas;
CREATE POLICY "consultas_update" ON public.consultas
  FOR UPDATE USING (
    medico_id = get_medico_id()
    AND (
      public.get_user_role(auth.uid()) = 'medico'
      OR public.check_permiso(auth.uid(), 'crear_consultas')
      OR public.check_permiso(auth.uid(), 'finalizar_consultas')
    )
  );

DROP POLICY IF EXISTS "consultas_delete" ON public.consultas;
CREATE POLICY "consultas_delete" ON public.consultas
  FOR DELETE USING (
    public.get_user_role(auth.uid()) = 'medico'
    AND medico_id = auth.uid()
  );


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 2. Tabla `notificaciones`                                                  │
-- └──────────────────────────────────────────────────────────────────────────┘
-- Avisos del sistema para el médico (turno agendado por asistente, recordatorio
-- enviado). medico_id = tenant. Sin índices (la auditoría no encontró ninguno; ver
-- RESPUESTA.md → sugerencia, NO agregada acá).
CREATE TABLE IF NOT EXISTS public.notificaciones (
  id         UUID        NOT NULL DEFAULT gen_random_uuid()
                           CONSTRAINT notificaciones_pkey PRIMARY KEY,
  medico_id  UUID        NOT NULL
                           CONSTRAINT notificaciones_medico_id_fkey
                           REFERENCES public.profiles(id),
  titulo     TEXT        NOT NULL,
  mensaje    TEXT        NOT NULL,
  tipo       TEXT        NOT NULL,
  leida      BOOLEAN     DEFAULT false,
  payload    JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

-- Las 4 políticas tal como quedaron tras la 029 (que dropeó la duplicada).
-- ⚠ ASIMETRÍA INTENCIONAL: el INSERT usa get_medico_id() y los otros tres auth.uid().
--   Es a propósito: un ASISTENTE inserta la notificación EN NOMBRE de su médico
--   (src/app/api/turnero/route.ts, al agendar un turno) → medico_id = get_medico_id()
--   resuelve al id del médico del tenant, y el WITH CHECK lo permite. Con auth.uid()
--   ese insert fallaría (el asistente no es el médico). Los select/update/delete sí
--   usan auth.uid(): solo el propio médico lee/gestiona sus notificaciones.
--   (schema.sql documenta hoy el insert con auth.uid(): es INCORRECTO, se corrige en
--   el trabajo de documentación.)
DROP POLICY IF EXISTS "notificaciones_select" ON public.notificaciones;
CREATE POLICY "notificaciones_select" ON public.notificaciones
  FOR SELECT USING (medico_id = auth.uid());

DROP POLICY IF EXISTS "notificaciones_insert" ON public.notificaciones;
CREATE POLICY "notificaciones_insert" ON public.notificaciones
  FOR INSERT WITH CHECK (medico_id = get_medico_id());

DROP POLICY IF EXISTS "notificaciones_update" ON public.notificaciones;
CREATE POLICY "notificaciones_update" ON public.notificaciones
  FOR UPDATE USING (medico_id = auth.uid());

DROP POLICY IF EXISTS "notificaciones_delete" ON public.notificaciones;
CREATE POLICY "notificaciones_delete" ON public.notificaciones
  FOR DELETE USING (medico_id = auth.uid());


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 3. Columnas huérfanas de `turnos` (Bloque 4)                               │
-- └──────────────────────────────────────────────────────────────────────────┘
-- categoria/origen/consulta_id. consulta_id referencia consultas(id) → por eso este
-- bloque va DESPUÉS del bloque 1 (en un entorno nuevo, consultas ya existe acá).
ALTER TABLE public.turnos
  ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'turno_medico';
ALTER TABLE public.turnos
  ADD COLUMN IF NOT EXISTS origen    TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE public.turnos
  ADD COLUMN IF NOT EXISTS consulta_id UUID
    REFERENCES public.consultas(id) ON DELETE SET NULL;

-- Los 3 CHECK constraints. ADD CONSTRAINT no admite IF NOT EXISTS, así que se
-- agregan solo si no existen (bloque DO idempotente). El tercero
-- (check_paciente_id_required_for_turno_medico) NO está documentado en schema.sql.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.turnos'::regclass AND conname = 'check_turnos_categoria'
  ) THEN
    ALTER TABLE public.turnos ADD CONSTRAINT check_turnos_categoria
      CHECK (categoria = ANY (ARRAY['turno_medico','curso','personal','administrativo','recordatorio']));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.turnos'::regclass AND conname = 'turnos_origen_check'
  ) THEN
    ALTER TABLE public.turnos ADD CONSTRAINT turnos_origen_check
      CHECK (origen = ANY (ARRAY['manual','desde_hc']));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.turnos'::regclass AND conname = 'check_paciente_id_required_for_turno_medico'
  ) THEN
    ALTER TABLE public.turnos ADD CONSTRAINT check_paciente_id_required_for_turno_medico
      CHECK (categoria <> 'turno_medico' OR paciente_id IS NOT NULL);
  END IF;
END $$;


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 4. Columnas huérfanas de `profiles` (Bloque 6)                             │
-- └──────────────────────────────────────────────────────────────────────────┘
-- Identidad profesional del médico que se estampa en los PDF. Todas nullable.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS titulo     TEXT;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS matriculas JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS logo_url   TEXT;
