-- ============================================================
-- 016_notas.sql
-- Notas internas personales (médico y asistentes)
-- Cada usuario ve solo sus propias notas (RLS personal)
-- ============================================================

CREATE TABLE IF NOT EXISTS notas (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo     text        NOT NULL CHECK (char_length(titulo) >= 1 AND char_length(titulo) <= 200),
  cuerpo     text        NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS notas_user_id_idx       ON notas (user_id);
CREATE INDEX IF NOT EXISTS notas_user_created_idx  ON notas (user_id, created_at DESC);

-- RLS: cada usuario ve y gestiona solo sus notas
ALTER TABLE notas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notas_select_own" ON notas
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "notas_insert_own" ON notas
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "notas_update_own" ON notas
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "notas_delete_own" ON notas
  FOR DELETE USING (user_id = auth.uid());

-- Trigger para updated_at automático
CREATE TRIGGER set_notas_updated_at
  BEFORE UPDATE ON notas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
