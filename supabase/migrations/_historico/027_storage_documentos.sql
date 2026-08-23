-- ============================================================================
-- Migration 027 — Infraestructura de Storage: bucket privado `documentos`
-- ============================================================================
-- Habilita la PERSISTENCIA de los PDFs de pedidos y certificados. Hoy el PDF se
-- regenera en cada descarga releyendo `profiles`, así que si el médico cambia su
-- firma, su logo, su título o suma una matrícula, TODOS los documentos históricos
-- se reimprimen con los datos actuales — un problema de integridad documental para
-- certificados que circulan fuera del consultorio. A partir de esta tanda el PDF se
-- genera UNA VEZ al emitir y se congela en este bucket.
--
-- Esta migración cubre SOLO la capa de base de datos:
--   1. Crea el bucket privado `documentos` (5 MB, solo application/pdf).
--   2. Crea políticas RLS sobre storage.objects, aisladas POR TENANT.
--
-- NO crea ni modifica columnas: `pdf_path` y `pdf_generado_at` YA EXISTEN en
-- `pedidos` (migración 006) y `certificados` (migración 007). Nunca se escribieron;
-- el código de la app empieza a usarlas en el prompt siguiente.
--
-- Ruta de los objetos: {medico_id}/{tipo}/{documento_id}.pdf
--   · tipo ∈ {'pedido', 'certificado'}. ('receta' queda previsto en el tipo del
--     código pero sin uso: la emisión sigue bloqueada por certificación ANMAT.)
--   · El medico_id va como PRIMER segmento, igual que en la 026: las políticas
--     aíslan por tenant comparando esa primera carpeta contra get_medico_id(),
--     sin JOIN contra `pacientes`.
--   · El path es DETERMINÍSTICO — sin UUID aleatorio, a diferencia de `estudios`.
--     Regenerar el PDF del mismo documento pisa el MISMO objeto vía upsert en vez
--     de dejar huérfanos. Por eso hace falta la política de UPDATE (bloque 2.3).
--
-- Decisiones fijas de esta tanda:
--   · Solo el bucket `documentos` (NO se crea `difusion`, sigue pendiente).
--   · SIN backfill: los 15 documentos ya emitidos (10 certificados + 5 pedidos, de
--     prueba) se quedan con pdf_path NULL y se siguen regenerando al vuelo para
--     siempre. Congelarlos hoy grabaría permanentemente los datos ACTUALES del
--     médico, no los del momento de su emisión — o sea, congelaríamos un dato que
--     ya sabemos incorrecto.
--     Consecuencia directa para las políticas de acá: el ÚNICO momento en que se
--     ESCRIBE en este bucket es el POST de emisión, y quien emite tiene sí o sí
--     `crear_pedidos` o `crear_certificados`. No hay escritura desde la descarga.
--   · SIN política de DELETE, deliberadamente (ver bloque 2.4).
--
-- Idempotente: ON CONFLICT DO UPDATE en el bucket; DROP POLICY IF EXISTS antes de
-- cada CREATE POLICY.
--
-- ⚠ PERMISOS: los statements sobre storage.buckets y storage.objects pueden requerir
--   privilegios elevados. Ver RESPUESTA.md → "Statements que pueden fallar por permisos".
-- ============================================================================


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 1. Bucket privado `documentos`                                             │
-- └──────────────────────────────────────────────────────────────────────────┘
-- PRIVADO (public = false): los objetos solo se sirven vía RLS. La descarga va por
-- PROXY del endpoint (el servidor baja los bytes y los transmite), igual que en
-- `estudios`: nunca se expone la URL de Storage al navegador.
-- file_size_limit en bytes (5 MB = 5242880). Holgadísimo a propósito: un pedido o
-- certificado renderizado pesa ~10–200 KB según el peso de la firma y el logo
-- (que se guardan como data URLs base64 en `profiles`).
-- allowed_mime_types = solo application/pdf: acá no entra nada que no sea un PDF
-- emitido por la app.
-- ON CONFLICT DO UPDATE lo hace re-ejecutable (actualiza los límites si el bucket
-- ya existiera).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documentos',
  'documentos',
  false,
  5242880,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 2. RLS sobre storage.objects (bucket `documentos`) — aislada por tenant    │
-- └──────────────────────────────────────────────────────────────────────────┘
-- CRÍTICO (mismo criterio que la 026): NO se usa `auth.role() = 'authenticated'` a
-- secas — eso dejaría que cualquier usuario autenticado de otro tenant descargue
-- documentos conociendo el path. El aislamiento se hace comparando el PRIMER
-- segmento de carpeta del objeto (el medico_id) contra get_medico_id().
-- storage.foldername(name) devuelve los segmentos de carpeta como array 1-indexed;
-- [1] es el medico_id, [2] es el tipo de documento.
-- Todas las políticas se restringen a bucket_id = 'documentos' y al rol authenticated.
--
-- ── Sobre la permisividad ENTRE TIPOS de documento ──────────────────────────
-- Las políticas de este bucket NO distinguen si el objeto es un pedido o un
-- certificado: piden `ver_pedidos` OR `ver_certificados` (y análogamente para
-- crear). Es DELIBERADO, no un descuido.
--
-- El bucket es UNO SOLO para los dos tipos de documento, y una política de Storage
-- solo puede mirar el path; para atar el permiso al tipo habría que parsear
-- (storage.foldername(name))[2], duplicando reglas frágiles.
--
-- La autorización FINA la hace el endpoint, y es defensa real, no confianza en el
-- cliente: antes de tocar el objeto, el Route Handler consulta la fila de `pedidos`
-- o `certificados` con el CLIENTE DE SESIÓN, y esa consulta pasa por la RLS de la
-- tabla — que sí exige el permiso específico (`pedidos_select` requiere
-- `ver_pedidos`; `certificados_select` requiere `ver_certificados`; migración 015).
-- Si el usuario no tiene el permiso del tipo correcto, nunca llega a conocer el
-- `pdf_path`, así que la política de Storage nunca entra en juego. Esta política es
-- la segunda capa (aislamiento por tenant), no la primera.

-- ── 2.1 SELECT (ver/descargar) ──────────────────────────────────────────────
-- Dentro del tenant + con permiso de lectura de alguno de los dos tipos de documento.
DROP POLICY IF EXISTS "documentos_objects_select" ON storage.objects;
CREATE POLICY "documentos_objects_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documentos'
    AND (storage.foldername(name))[1] = public.get_medico_id()::text
    AND (
      public.check_permiso(auth.uid(), 'ver_pedidos')
      OR public.check_permiso(auth.uid(), 'ver_certificados')
    )
  );

-- ── 2.2 INSERT (congelar el PDF al emitir) ──────────────────────────────────
-- Único camino de escritura del bucket. Requiere permiso de EMISIÓN, no de lectura:
-- se escribe exclusivamente desde el POST de /api/pedidos o /api/certificados, y
-- ahí el usuario ya pasó por la RLS de INSERT de la tabla (que exige crear_pedidos
-- o crear_certificados). Un asistente que solo puede VER documentos no sube nada.
DROP POLICY IF EXISTS "documentos_objects_insert" ON storage.objects;
CREATE POLICY "documentos_objects_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documentos'
    AND (storage.foldername(name))[1] = public.get_medico_id()::text
    AND (
      public.check_permiso(auth.uid(), 'crear_pedidos')
      OR public.check_permiso(auth.uid(), 'crear_certificados')
    )
  );

-- ── 2.3 UPDATE (necesaria por el upsert) ────────────────────────────────────
-- La subida usa `upsert: true` sobre un path determinístico
-- ({medico_id}/{tipo}/{documento_id}.pdf). Cuando el objeto ya existe, el cliente
-- de Storage hace un UPDATE, no un INSERT: sin esta política, un reintento de
-- emisión sobre el mismo documento fallaría.
-- Mismas condiciones que INSERT, en USING y WITH CHECK (USING decide qué filas se
-- pueden actualizar; WITH CHECK valida cómo quedan después).
DROP POLICY IF EXISTS "documentos_objects_update" ON storage.objects;
CREATE POLICY "documentos_objects_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documentos'
    AND (storage.foldername(name))[1] = public.get_medico_id()::text
    AND (
      public.check_permiso(auth.uid(), 'crear_pedidos')
      OR public.check_permiso(auth.uid(), 'crear_certificados')
    )
  )
  WITH CHECK (
    bucket_id = 'documentos'
    AND (storage.foldername(name))[1] = public.get_medico_id()::text
    AND (
      public.check_permiso(auth.uid(), 'crear_pedidos')
      OR public.check_permiso(auth.uid(), 'crear_certificados')
    )
  );

-- ── 2.4 DELETE — AUSENCIA DELIBERADA ────────────────────────────────────────
-- ⚠ NO HAY POLÍTICA DE DELETE PARA EL BUCKET `documentos`, Y NO DEBE AGREGARSE.
--   Esto NO es un olvido: es la regla de negocio 5 llevada a la base.
--
--   Los pedidos y certificados NO SE BORRAN NUNCA — solo se anulan
--   (estado = 'revocado'). La migración 025 ya dropeó el DELETE de las tablas
--   `pedidos` y `certificados` por el mismo motivo; esta migración cierra el
--   círculo del lado de Storage: el PDF congelado es el documento TAL COMO SE
--   FIRMÓ, y anular no debe modificarlo ni borrarlo (el QR de /verificar/[codigo]
--   es el que informa que está revocado).
--
--   Sin política de DELETE, Postgres DENIEGA la operación por defecto para el rol
--   `authenticated` (RLS es deny-by-default). No hace falta ninguna regla explícita.
--   El `service_role` sigue pudiendo borrar por bypass de RLS, para operaciones de
--   mantenimiento fuera de la app.
--
--   Diferencia deliberada con la 026: el bucket `estudios` SÍ permite DELETE al
--   médico. Un estudio es un archivo adjunto que se pudo haber subido por error;
--   un pedido o un certificado emitido es un instrumento firmado que ya circuló.
