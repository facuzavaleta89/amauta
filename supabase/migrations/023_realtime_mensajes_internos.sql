-- Habilita Realtime (postgres_changes) para public.mensajes_internos: la agrega
-- a la publicación supabase_realtime si todavía no es miembro.
--
-- Idempotente a propósito: no se pudo verificar la membresía actual sin acceso
-- al catálogo de Postgres (el Realtime se configuró por dashboard, sin migración
-- fuente). El guard evita el error "table is already member of publication" si
-- ya estaba habilitada. Solo se necesitan eventos INSERT, así que alcanza con
-- agregarla a la publicación (no hace falta tocar REPLICA IDENTITY).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'mensajes_internos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mensajes_internos;
  END IF;
END $$;
