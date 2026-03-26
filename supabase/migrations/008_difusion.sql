-- ============================================================
-- 008_difusion.sql
-- Área de difusión: posts/mensajes para enviar por mail o WhatsApp
-- ============================================================

CREATE TYPE difusion_estado AS ENUM (
  'borrador',    -- En preparación
  'listo',       -- Listo para enviar
  'enviado',     -- Ya enviado
  'archivado'    -- Archivado, sin eliminar
);

CREATE TYPE difusion_canal AS ENUM (
  'email',
  'whatsapp',
  'ambos'
);

CREATE TABLE public.difusion_posts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  titulo       TEXT NOT NULL,
  contenido    TEXT NOT NULL,          -- Cuerpo del mensaje (texto rico o MD)
  estado       difusion_estado NOT NULL DEFAULT 'borrador',

  -- Canal de envío planeado
  canal        difusion_canal DEFAULT 'email',

  -- Para emails (via Resend)
  asunto_email TEXT,                   -- Subject del mail

  -- Para WhatsApp: se genera un link wa.me con el contenido
  -- No requiere campos extra

  -- Imagen adjunta opcional (Storage bucket "difusion", público)
  imagen_path  TEXT,

  -- Auditoría
  creado_por   UUID NOT NULL REFERENCES public.profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_difusion_estado ON public.difusion_posts(estado);
CREATE INDEX idx_difusion_created ON public.difusion_posts(created_at DESC);

ALTER TABLE public.difusion_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "difusion_select" ON public.difusion_posts
  FOR SELECT USING (auth.role() = 'authenticated');

-- Solo médico puede crear/modificar/eliminar posts de difusión
CREATE POLICY "difusion_insert" ON public.difusion_posts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'medico'
    )
  );

CREATE POLICY "difusion_update" ON public.difusion_posts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'medico'
    )
  );

CREATE POLICY "difusion_delete" ON public.difusion_posts
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'medico'
    )
  );

CREATE TRIGGER difusion_updated_at
  BEFORE UPDATE ON public.difusion_posts
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ── REGISTRO DE ENVÍOS ────────────────────────────────────────
-- Historial de cada envío (a quién, cuándo, resultado)
CREATE TABLE public.difusion_envios (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id      UUID NOT NULL REFERENCES public.difusion_posts(id) ON DELETE CASCADE,

  -- Destinatario (puede ser un paciente del sistema o externo)
  paciente_id  UUID REFERENCES public.pacientes(id) ON DELETE SET NULL,
  email_destino TEXT,
  tel_destino   TEXT,               -- Para WhatsApp
  canal         difusion_canal NOT NULL,

  -- Resultado del envío
  enviado_ok   BOOLEAN DEFAULT false,
  error_msg    TEXT,               -- Si falló, el mensaje de error
  enviado_at   TIMESTAMPTZ,

  enviado_por  UUID NOT NULL REFERENCES public.profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_envios_post ON public.difusion_envios(post_id);
CREATE INDEX idx_envios_paciente ON public.difusion_envios(paciente_id);

ALTER TABLE public.difusion_envios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "envios_select" ON public.difusion_envios
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'medico'
    )
  );

CREATE POLICY "envios_insert" ON public.difusion_envios
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
