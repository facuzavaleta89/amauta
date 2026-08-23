-- ============================================================
-- 017_mensajes_internos.sql
-- Mensajería interna asíncrona entre médico y asistentes
-- Soporta mensajes individuales y grupales (broadcast)
-- Bidireccional: cualquier usuario puede iniciar un mensaje
-- ============================================================

-- Tabla principal de mensajes
CREATE TABLE IF NOT EXISTS mensajes_internos (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  remitente_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  destinatario_id uuid        REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL si es_grupal
  es_grupal       boolean     NOT NULL DEFAULT false,
  asunto          text        NOT NULL CHECK (char_length(asunto) >= 1 AND char_length(asunto) <= 200),
  cuerpo          text        NOT NULL DEFAULT '',
  -- leido/leido_at aplican a mensajes individuales
  leido           boolean     NOT NULL DEFAULT false,
  leido_at        timestamptz,
  parent_id       uuid        REFERENCES mensajes_internos(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Constraint: si no es grupal, debe tener destinatario
  CONSTRAINT mensajes_destinatario_check
    CHECK (es_grupal = true OR destinatario_id IS NOT NULL)
);

-- Tabla de lecturas para mensajes grupales (uno por usuario que leyó)
CREATE TABLE IF NOT EXISTS mensajes_lecturas (
  mensaje_id  uuid        NOT NULL REFERENCES mensajes_internos(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leido_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mensaje_id, user_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS mensajes_destinatario_idx    ON mensajes_internos (destinatario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mensajes_remitente_idx       ON mensajes_internos (remitente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mensajes_medico_grupal_idx   ON mensajes_internos (medico_id, es_grupal, created_at DESC);
CREATE INDEX IF NOT EXISTS mensajes_lecturas_user_idx   ON mensajes_lecturas (user_id);

-- ── RLS mensajes_internos ──────────────────────────────────

ALTER TABLE mensajes_internos ENABLE ROW LEVEL SECURITY;

-- SELECT: ves un mensaje si:
--   a) sos el remitente
--   b) sos el destinatario (mensaje individual)
--   c) el mensaje es grupal y pertenece a tu tenant
CREATE POLICY "mensajes_ver" ON mensajes_internos
  FOR SELECT
  USING (
    remitente_id = auth.uid()
    OR (NOT es_grupal AND destinatario_id = auth.uid())
    OR (es_grupal AND medico_id = get_medico_id())
  );

-- INSERT: cualquier usuario autenticado del tenant puede enviar
CREATE POLICY "mensajes_insertar" ON mensajes_internos
  FOR INSERT
  WITH CHECK (
    remitente_id = auth.uid()
    AND medico_id = get_medico_id()
  );

-- UPDATE: solo marcar leído en mensajes individuales donde sos destinatario
CREATE POLICY "mensajes_marcar_leido" ON mensajes_internos
  FOR UPDATE
  USING (NOT es_grupal AND destinatario_id = auth.uid())
  WITH CHECK (NOT es_grupal AND destinatario_id = auth.uid());

-- ── RLS mensajes_lecturas ──────────────────────────────────

ALTER TABLE mensajes_lecturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lecturas_select_own" ON mensajes_lecturas
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "lecturas_insert_own" ON mensajes_lecturas
  FOR INSERT WITH CHECK (user_id = auth.uid());
