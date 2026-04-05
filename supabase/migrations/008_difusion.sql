-- ============================================================
-- 008_difusion.sql
-- Área de difusión: posts/mensajes para enviar por mail o WhatsApp
-- Multi-tenant: medico_id en difusion_posts
-- RLS: el médico (y asistentes) solo ven los posts de su agenda
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

-- medico_id = tenant key (a qué médico pertenece este post)
CREATE TABLE public.difusion_posts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  titulo       TEXT NOT NULL,
  contenido    TEXT NOT NULL,          -- Cuerpo del mensaje (texto rico o MD)
  estado       difusion_estado NOT NULL DEFAULT 'borrador',

  -- Canal de envío planeado
  canal        difusion_canal DEFAULT 'email',

  -- Para emails (via Resend)
  asunto_email TEXT,                   -- Subject del mail

  -- Imagen adjunta opcional (Storage bucket "difusion", público)
  imagen_path  TEXT,

  -- Multi-tenancy: agenda del médico
  medico_id    UUID NOT NULL REFERENCES public.profiles(id),

  -- Auditoría
  creado_por   UUID NOT NULL REFERENCES public.profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_difusion_estado ON public.difusion_posts(estado);
CREATE INDEX idx_difusion_created ON public.difusion_posts(created_at DESC);
CREATE INDEX idx_difusion_medico ON public.difusion_posts(medico_id);

ALTER TABLE public.difusion_posts ENABLE ROW LEVEL SECURITY;

-- Médico y asistentes ven los posts del tenant
CREATE POLICY "difusion_select" ON public.difusion_posts
  FOR SELECT USING (medico_id = get_medico_id());

-- Médico y asistentes pueden crear posts
CREATE POLICY "difusion_insert" ON public.difusion_posts
  FOR INSERT WITH CHECK (medico_id = get_medico_id());

-- Solo el médico puede publicar/editar posts (control editorial)
CREATE POLICY "difusion_update" ON public.difusion_posts
  FOR UPDATE USING (
    medico_id = auth.uid()
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'medico'
  );

-- Solo el médico puede eliminar posts
CREATE POLICY "difusion_delete" ON public.difusion_posts
  FOR DELETE USING (
    medico_id = auth.uid()
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'medico'
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

-- Médico y asistentes pueden ver los envíos de sus posts
CREATE POLICY "envios_select" ON public.difusion_envios
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.difusion_posts
    WHERE id = difusion_envios.post_id AND medico_id = get_medico_id()
  ));

-- Médico y asistentes pueden registrar envíos
CREATE POLICY "envios_insert" ON public.difusion_envios
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.difusion_posts
    WHERE id = difusion_envios.post_id AND medico_id = get_medico_id()
  ));
