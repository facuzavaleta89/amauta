-- ============================================================
-- 006_pedidos.sql
-- Pedidos de estudios complementarios con generación de PDF
-- ============================================================

CREATE TABLE public.pedidos (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paciente_id  UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE RESTRICT,

  -- Datos del pedido (se auto-completan desde el paciente)
  -- Se guardan como snapshot por si cambian los datos del paciente
  paciente_nombre    TEXT NOT NULL,
  paciente_dni       TEXT NOT NULL,
  paciente_dob       DATE NOT NULL,   -- Fecha de nacimiento
  obra_social_nombre TEXT,
  numero_afiliado    TEXT,

  -- Contenido del pedido
  diagnostico        TEXT NOT NULL,   -- CIE-10 o texto libre
  estudios_pedidos   TEXT NOT NULL,   -- Texto libre con los estudios a realizar
  fecha_pedido       DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Notas adicionales
  indicaciones       TEXT,            -- Indicaciones para el paciente

  -- PDF generado (Storage bucket "documentos", privado)
  pdf_path           TEXT,            -- Ruta en Storage una vez generado
  pdf_generado_at    TIMESTAMPTZ,

  -- Médico que firma (siempre el mismo, pero guardamos referencia)
  firmado_por        UUID NOT NULL REFERENCES public.profiles(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pedidos_paciente ON public.pedidos(paciente_id);
CREATE INDEX idx_pedidos_fecha ON public.pedidos(fecha_pedido);

ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pedidos_select" ON public.pedidos
  FOR SELECT USING (auth.role() = 'authenticated');

-- Cualquier autenticado puede crear un pedido
CREATE POLICY "pedidos_insert" ON public.pedidos
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Cualquier autenticado puede modificar (para guardar el pdf_path)
CREATE POLICY "pedidos_update" ON public.pedidos
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Solo médico puede eliminar
CREATE POLICY "pedidos_delete" ON public.pedidos
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'medico'
    )
  );

CREATE TRIGGER pedidos_updated_at
  BEFORE UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
