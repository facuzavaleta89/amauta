-- ############################################################################
-- ############################################################################
-- ##                                                                        ##
-- ##   ⚠⚠⚠  SCRIPT DESTRUCTIVO — BORRA TODOS LOS DOCUMENTOS  ⚠⚠⚠           ##
-- ##                                                                        ##
-- ############################################################################
-- ############################################################################
--
--   QUÉ HACE:
--     Borra TODOS los pedidos y TODOS los certificados de la base, y TODOS los
--     objetos del bucket `documentos` en Storage. No filtra por médico, tenant,
--     fecha ni estado: elimina absolutamente todo.
--
--   PARA QUÉ:
--     Uso ÚNICO Y DE UNA SOLA VEZ, para limpiar los documentos de PRUEBA
--     (7 pedidos + 12 certificados de test) antes de pasar a producción, en el
--     marco de la tanda de `emisor_snapshot` (migración 028). Al borrarlos, todos
--     los documentos que existan de ahí en más tendrán snapshot del emisor, y el
--     código de la app no necesita fallback para el caso "documento sin snapshot".
--
--   ⛔ NO EJECUTAR NUNCA EN UN ENTORNO CON DATOS REALES.
--      Si esta base ya tiene pedidos o certificados de pacientes reales, ESTE
--      SCRIPT LOS DESTRUYE SIN VUELTA ATRÁS. Pará y no lo corras.
--
--   POR QUÉ NO ESTÁ EN supabase/migrations/:
--     Deliberado. Este script NO es una migración: no describe el esquema deseado,
--     es una operación puntual sobre datos. Dejarlo fuera del historial de
--     migraciones evita que se ejecute por accidente en cualquier `db push` /
--     `migration up` sobre producción. Se corre a mano, una sola vez, con plena
--     conciencia de lo que hace.
--
--   ORDEN: ejecutar DESPUÉS de la migración 028 (que agrega emisor_snapshot).
--
-- ============================================================================
-- NOTA SOBRE PERMISOS (excepción deliberada y consciente):
--   La migración 025 DROPEÓ las políticas RLS de DELETE de `pedidos` y
--   `certificados` justamente para IMPEDIR el borrado de documentos desde la app
--   (regla de negocio 5: los documentos no se borran, solo se anulan).
--   Este DELETE funciona igual porque el SQL Editor de Supabase corre como
--   `postgres` / `service_role`, que hace BYPASS de RLS. Es la única vía por la que
--   un borrado así es posible, y se usa a propósito y por única vez para limpiar los
--   datos de prueba. No es un descuido ni una regresión de la 025: las políticas
--   siguen dropeadas y la app sigue sin poder borrar.
-- ============================================================================


-- ── 1. Borrar los objetos del bucket `documentos` en Storage ────────────────
-- Se hace ANTES de borrar las filas (no hay FK entre storage.objects y las tablas,
-- así que el orden no es estrictamente necesario, pero limpiar Storage primero deja
-- el sistema consistente si algo se interrumpe: nunca quedan filas apuntando a un
-- objeto ya borrado, solo el caso inverso e inocuo).
DELETE FROM storage.objects
WHERE bucket_id = 'documentos';


-- ── 2. Borrar todas las filas de pedidos y certificados ─────────────────────
-- Bypass de RLS vía service_role del SQL Editor (ver nota de permisos arriba).
DELETE FROM public.pedidos;
DELETE FROM public.certificados;


-- ── 3. Verificación: las tres cosas deben quedar en CERO ────────────────────
-- Corré esto después de los DELETE. Las tres columnas deben dar 0.
SELECT
  (SELECT count(*) FROM public.pedidos)                                   AS pedidos_restantes,
  (SELECT count(*) FROM public.certificados)                             AS certificados_restantes,
  (SELECT count(*) FROM storage.objects WHERE bucket_id = 'documentos')  AS objetos_documentos_restantes;
