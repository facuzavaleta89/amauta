-- ============================================================================
-- Migration 026 — Infraestructura de Storage: bucket privado `estudios`
-- ============================================================================
-- Habilita el almacenamiento de estudios complementarios (PDF/imágenes) por
-- paciente. Esta migración cubre SOLO la capa de base de datos:
--   1. Crea el bucket privado `estudios` (con límite de tamaño y MIME permitidos).
--   2. Crea políticas RLS sobre storage.objects, aisladas POR TENANT.
--   3. Endurece la RLS de la tabla `estudios` para que respete el permiso
--      granular `ver_historia_clinica` (hoy no lo valida — mismo hueco que tenía
--      `consultas` antes de la migración 025).
--
-- Ruta de los objetos: {medico_id}/{paciente_id}/{uuid}.{ext}
--   El medico_id va como PRIMER segmento a propósito: permite que las políticas de
--   Storage aíslen por tenant comparando la primera carpeta contra get_medico_id(),
--   sin JOIN contra `pacientes`. (El código de limpieza en
--   src/app/api/pacientes/[id]/route.ts:230-242 asume {paciente_id}/... y se
--   corregirá en el prompt del código de la app, NO en esta migración.)
--
-- Decisiones fijas de esta tanda:
--   · Solo el bucket `estudios` (NO se crean `documentos` ni `difusion`).
--   · Límite 10 MB por archivo. MIME: pdf, jpeg, png, webp.
--   · El acceso se ata al permiso existente `ver_historia_clinica` (sin permisos
--     ni columnas nuevas en `profiles`).
--
-- Idempotente: ON CONFLICT DO UPDATE en el bucket; DROP POLICY IF EXISTS antes de
-- cada CREATE POLICY.
--
-- ⚠ PERMISOS: los statements sobre storage.buckets y storage.objects pueden requerir
--   privilegios elevados. Ver RESPUESTA.md → "Statements que pueden fallar por permisos".
-- ============================================================================


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 1. Bucket privado `estudios`                                               │
-- └──────────────────────────────────────────────────────────────────────────┘
-- PRIVADO (public = false): los objetos solo se sirven vía signed URLs / RLS.
-- file_size_limit en bytes (10 MB = 10485760). allowed_mime_types acota qué se
-- puede subir. ON CONFLICT DO UPDATE lo hace re-ejecutable (actualiza los límites
-- si el bucket ya existiera).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'estudios',
  'estudios',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 2. RLS sobre storage.objects (bucket `estudios`) — aislada por tenant      │
-- └──────────────────────────────────────────────────────────────────────────┘
-- CRÍTICO: NO se usa `auth.role() = 'authenticated'` a secas — eso dejaría que
-- cualquier usuario autenticado de otro tenant descargue archivos conociendo el
-- path. El aislamiento se hace comparando el PRIMER segmento de carpeta del objeto
-- (el medico_id) contra get_medico_id(). storage.foldername(name) devuelve los
-- segmentos de carpeta como array 1-indexed; [1] es el medico_id.
-- Todas las políticas se restringen a bucket_id = 'estudios' y al rol authenticated.

-- SELECT (ver/descargar): dentro del tenant + con permiso de historia clínica.
DROP POLICY IF EXISTS "estudios_objects_select" ON storage.objects;
CREATE POLICY "estudios_objects_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'estudios'
    AND (storage.foldername(name))[1] = public.get_medico_id()::text
    AND public.check_permiso(auth.uid(), 'ver_historia_clinica')
  );

-- INSERT (subir): mismas condiciones. Un asistente sin ver_historia_clinica no sube.
DROP POLICY IF EXISTS "estudios_objects_insert" ON storage.objects;
CREATE POLICY "estudios_objects_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'estudios'
    AND (storage.foldername(name))[1] = public.get_medico_id()::text
    AND public.check_permiso(auth.uid(), 'ver_historia_clinica')
  );

-- UPDATE (reemplazar metadata/objeto): mismas condiciones, en USING y WITH CHECK.
DROP POLICY IF EXISTS "estudios_objects_update" ON storage.objects;
CREATE POLICY "estudios_objects_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'estudios'
    AND (storage.foldername(name))[1] = public.get_medico_id()::text
    AND public.check_permiso(auth.uid(), 'ver_historia_clinica')
  )
  WITH CHECK (
    bucket_id = 'estudios'
    AND (storage.foldername(name))[1] = public.get_medico_id()::text
    AND public.check_permiso(auth.uid(), 'ver_historia_clinica')
  );

-- DELETE (borrar objeto): más restrictiva — solo el MÉDICO dueño del tenant. El
-- primer segmento (medico_id) debe ser el del tenant del usuario (get_medico_id(),
-- igual que select/insert/update para mantener el patrón consistente) y además el
-- rol debe ser 'medico' (eso es lo que restringe el borrado solo al médico).
DROP POLICY IF EXISTS "estudios_objects_delete" ON storage.objects;
CREATE POLICY "estudios_objects_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'estudios'
    AND (storage.foldername(name))[1] = public.get_medico_id()::text
    AND public.get_user_role(auth.uid()) = 'medico'
  );


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 3. Endurecer la RLS de la tabla `estudios`                                 │
-- └──────────────────────────────────────────────────────────────────────────┘
-- Las políticas actuales aíslan por tenant (creado_por = get_medico_id()) pero NO
-- validan check_permiso(): cualquier asistente vinculado puede ver/insertar
-- estudios aunque su médico le haya negado ver_historia_clinica. Mismo hueco que
-- tenía `consultas` antes de la 025. Se agrega check_permiso() a select/insert/
-- update y se pasa el delete a get_user_role() (consistencia post-025).

-- SELECT: requiere ver_historia_clinica + tenant.
DROP POLICY IF EXISTS "estudios_select" ON public.estudios;
CREATE POLICY "estudios_select" ON public.estudios
  FOR SELECT USING (
    public.check_permiso(auth.uid(), 'ver_historia_clinica')
    AND EXISTS (
      SELECT 1 FROM public.pacientes
      WHERE id = estudios.paciente_id AND creado_por = public.get_medico_id()
    )
  );

-- INSERT: requiere ver_historia_clinica + tenant.
DROP POLICY IF EXISTS "estudios_insert" ON public.estudios;
CREATE POLICY "estudios_insert" ON public.estudios
  FOR INSERT WITH CHECK (
    public.check_permiso(auth.uid(), 'ver_historia_clinica')
    AND EXISTS (
      SELECT 1 FROM public.pacientes
      WHERE id = estudios.paciente_id AND creado_por = public.get_medico_id()
    )
  );

-- UPDATE: requiere ver_historia_clinica + tenant.
DROP POLICY IF EXISTS "estudios_update" ON public.estudios;
CREATE POLICY "estudios_update" ON public.estudios
  FOR UPDATE USING (
    public.check_permiso(auth.uid(), 'ver_historia_clinica')
    AND EXISTS (
      SELECT 1 FROM public.pacientes
      WHERE id = estudios.paciente_id AND creado_por = public.get_medico_id()
    )
  );

-- DELETE: solo el médico dueño del tenant (usa get_user_role, no subselect inline).
-- El predicado de tenant usa get_medico_id() como el resto de las políticas de la
-- tabla; la restricción a 'medico' es lo que limita el borrado solo al médico.
DROP POLICY IF EXISTS "estudios_delete" ON public.estudios;
CREATE POLICY "estudios_delete" ON public.estudios
  FOR DELETE USING (
    public.get_user_role(auth.uid()) = 'medico'
    AND EXISTS (
      SELECT 1 FROM public.pacientes
      WHERE id = estudios.paciente_id AND creado_por = public.get_medico_id()
    )
  );
