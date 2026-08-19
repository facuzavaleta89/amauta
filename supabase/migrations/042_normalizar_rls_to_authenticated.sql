-- ============================================================================
-- Migration 042 — Normalizar a `TO authenticated` las políticas RLS de `public`
-- ============================================================================
-- Cierra el último resto de un trabajo que venía por partes: la 029 normalizó
-- recetas/evoluciones/historia_clinica, la 037 las 4 de `bloqueos_agenda`, la 040
-- `audit_select` y la 038 `consultas_delete`. Todo lo demás quedó como nació.
--
-- ── EL PROBLEMA ─────────────────────────────────────────────────────────────
--   En Postgres, una política que NO declara cláusula `TO` equivale a `TO PUBLIC`:
--   se evalúa para TODOS los roles, `anon` incluido. 49 políticas del esquema
--   `public`, repartidas en 18 tablas, están así.
--
--   ⚠ NO es un agujero explotable, y conviene decirlo con precisión para que nadie
--   lea esta migración como un parche de urgencia: las 49 cuelgan de `get_medico_id()`
--   o de `auth.uid()` (y una, `obras_sociales_select_all`, de `auth.role()`). Para el
--   rol `anon`, `auth.uid()` es NULL → `get_medico_id()` devuelve NULL → la comparación
--   da NULL → la fila no pasa. Es decir: hoy `anon` ya no lee nada.
--
--   Esto es DEFENSA EN PROFUNDIDAD y consistencia de esquema. Hace explícito en la
--   política lo que hoy solo garantiza la expresión, y deja las 65 políticas del
--   esquema bajo una única convención — así, a futuro, una política nueva que se
--   olvide el `TO` salta a la vista en cualquier revisión.
--
-- ── LO QUE ESTA MIGRACIÓN CAMBIA: EL ROL. NADA MÁS ──────────────────────────
--   Cero cambios de expresión. Ningún `USING` ni `WITH CHECK` se reescribe, se
--   reordena ni se completa. La lógica de autorización de las 49 políticas queda
--   IDÉNTICA; lo único distinto es a qué roles aplica.
--
-- ── POR QUÉ `ALTER POLICY` Y NO `DROP` + `CREATE` ───────────────────────────
--   `ALTER POLICY nombre ON tabla TO authenticated` cambia SOLO los roles y preserva
--   las expresiones intactas, sin tocarlas. Es la misma herramienta que usó la 039
--   (allá para cambiar el `USING` de `turnos_select` preservando el rol; acá al revés).
--   La alternativa —`DROP` + `CREATE` re-emitiendo el texto— trae DOS riesgos reales
--   que este camino vuelve imposibles por construcción:
--
--   1. REINTRODUCIR DRIFT. Varias políticas de la base ya NO coinciden con el texto de
--      su migración fuente. El caso probado es `difusion_posts`: la 008 define
--      `difusion_update`/`difusion_delete` como SOLO-MÉDICO, pero la base viva las tiene
--      TENANT-ONLY, que es la decisión de producto vigente (ver CLAUDE.md nota técnica
--      14: los posts son comunicación del consultorio, no datos clínicos, y
--      `src/app/api/difusion/[id]/route.ts` valida solo pertenencia al tenant). Copiar
--      el texto de la 008 le habría sacado a los asistentes la edición y el borrado de
--      comunicados, en silencio. Con `ALTER POLICY` no hay texto que copiar mal.
--
--   2. PERDER (O INVENTAR) UN `WITH CHECK`. Entre las 49 hay DOCE políticas de UPDATE,
--      y no son homogéneas:
--
--        · DIEZ **no declaran** `WITH CHECK` → profiles_update_own, pacientes_update,
--          historia_update, estudios_update, consultas_update, turnos_update,
--          pedidos_update, certificados_update, solicitudes_update, notificaciones_update.
--        · DOS **sí lo declaran** → notas_update_own y mensajes_marcar_leido.
--
--      Cuando una política de UPDATE no declara `WITH CHECK`, Postgres reutiliza el
--      `USING` para validar la fila resultante. O sea que agregarlo "por prolijidad" a
--      las diez CAMBIARÍA el comportamiento, y omitirlo en las dos que sí lo tienen,
--      también. Re-emitir a mano 12 políticas con esa asimetría es exactamente el tipo
--      de detalle que se pierde. `ALTER POLICY … TO` no toca ninguno de los dos casos.
--
-- ── LO QUE QUEDA DELIBERADAMENTE AFUERA ─────────────────────────────────────
--   A) Las 16 políticas que YA están en `TO authenticated`. No se les emite ALTER: no
--      rompería nada, pero un ALTER redundante es ruido y —peor— haría ilegible qué
--      cambió realmente esta migración. Son las 12 que normalizaron las migraciones
--      029/037/038/040 (historia_delete, evoluciones_update, evoluciones_delete,
--      consultas_delete, bloqueos_select/insert/update/delete, audit_select,
--      recetas_insert/update/delete) MÁS 4 que se normalizaron A MANO, fuera de toda
--      migración, y que solo se descubren mirando la base:
--
--        · difusion_insert   (difusion_posts)
--        · difusion_update   (difusion_posts)
--        · difusion_delete   (difusion_posts)
--        · evoluciones_insert
--
--      ⚠ De `difusion_posts`, entonces, esta migración toca UNA SOLA política:
--        `difusion_select`, la única de esa tabla que sigue en `{public}`. Y de
--        `evoluciones`, UNA SOLA: `evoluciones_select`. Si alguien compara esta
--        migración contra el listado de políticas por tabla y las ve "incompletas",
--        ES CORRECTO: el resto ya estaba normalizado.
--
--   B) `rate_limits`. Tiene RLS habilitada y CERO políticas, a propósito (migración
--      031): se accede solo vía `check_rate_limit()`, SECURITY DEFINER con EXECUTE
--      restringido a service_role/postgres. No hay nada que normalizar.
--
--   C) `storage.objects`. Sus 7 políticas (buckets `estudios` y `documentos`,
--      migraciones 026/027) nacieron ya con `TO authenticated`. Además son de otro
--      esquema: fuera del alcance.
--
--   D) Políticas que NO EXISTEN y que no hay que inventar al leer esta lista:
--      `audit_insert` (dropeada por la 014 — el trigger log_turno_cambio es SECURITY
--      DEFINER y escribe sin RLS), `pedidos_delete` y `certificados_delete` (dropeadas
--      por la 025, regla de negocio 5: los documentos no se borran, solo se anulan),
--      `solicitudes_delete` y `lecturas_update` (nunca existieron — el faltante de
--      `mensajes_lecturas` es la razón de los upserts con `ignoreDuplicates`, nota 19).
--
-- ── LO QUE ESTA MIGRACIÓN NO TOCA ───────────────────────────────────────────
--   Ningún archivo de código. Ni un `.ts`, ni un `.tsx`. Toda la app se conecta como
--   `authenticated` (cliente de sesión) o como `service_role` (admin.ts, que bypassea
--   RLS por completo): ninguno de los dos cambia de comportamiento. La página pública
--   `/verificar/[codigo]` —el único flujo anónimo real del proyecto— no consulta
--   ninguna tabla: usa `createAdminClient()` (service_role) contra la RPC
--   `verificar_documento`, así que es indiferente al `TO` de estas políticas.
--
-- ── ATOMICIDAD ──────────────────────────────────────────────────────────────
--   Envuelta en BEGIN/COMMIT. `ALTER POLICY` no deja ventana sin política (a diferencia
--   de DROP+CREATE), pero la transacción cumple otra función acá: si UNA de las 49
--   políticas no existiera con ese nombre exacto, el ALTER falla con
--   `policy … does not exist` y ABORTA TODO. Es el comportamiento deseado: se aplica
--   completa o no se aplica, y el error señala exactamente dónde la lista y la base
--   dejaron de coincidir.
--
-- Alcance: 49 políticas · 18 tablas · agrupadas por tabla en orden alfabético.
-- Reversible: ver el bloque comentado al final.
-- ============================================================================

BEGIN;

-- ── certificados (3) ────────────────────────────────────────────────────────
-- certificados_delete NO existe (dropeada por la 025, regla de negocio 5).
ALTER POLICY "certificados_select" ON public.certificados TO authenticated;
ALTER POLICY "certificados_insert" ON public.certificados TO authenticated;
ALTER POLICY "certificados_update" ON public.certificados TO authenticated;

-- ── consultas (3) ───────────────────────────────────────────────────────────
-- consultas_delete ya está en authenticated desde la 038.
ALTER POLICY "consultas_select" ON public.consultas TO authenticated;
ALTER POLICY "consultas_insert" ON public.consultas TO authenticated;
ALTER POLICY "consultas_update" ON public.consultas TO authenticated;

-- ── difusion_envios (2) ─────────────────────────────────────────────────────
ALTER POLICY "envios_select" ON public.difusion_envios TO authenticated;
ALTER POLICY "envios_insert" ON public.difusion_envios TO authenticated;

-- ── difusion_posts (1) ──────────────────────────────────────────────────────
-- ⚠ SOLO el SELECT. difusion_insert, difusion_update y difusion_delete ya están en
--   authenticated (normalizadas a mano, fuera de las migraciones). Ver bloque (A).
ALTER POLICY "difusion_select" ON public.difusion_posts TO authenticated;

-- ── estudios (4) ────────────────────────────────────────────────────────────
ALTER POLICY "estudios_select" ON public.estudios TO authenticated;
ALTER POLICY "estudios_insert" ON public.estudios TO authenticated;
ALTER POLICY "estudios_update" ON public.estudios TO authenticated;
ALTER POLICY "estudios_delete" ON public.estudios TO authenticated;

-- ── evoluciones (1) ─────────────────────────────────────────────────────────
-- ⚠ SOLO el SELECT. evoluciones_insert ya está en authenticated (a mano, fuera de las
--   migraciones); evoluciones_update y evoluciones_delete lo están desde la 029.
ALTER POLICY "evoluciones_select" ON public.evoluciones TO authenticated;

-- ── historia_clinica (3) ────────────────────────────────────────────────────
-- Tabla DORMIDA (la app ya no la lee ni la escribe) pero NO dropeada (Ley 26.529):
-- conserva filas históricas, así que sus políticas siguen siendo la defensa real.
-- historia_delete ya está en authenticated desde la 029.
ALTER POLICY "historia_select" ON public.historia_clinica TO authenticated;
ALTER POLICY "historia_insert" ON public.historia_clinica TO authenticated;
ALTER POLICY "historia_update" ON public.historia_clinica TO authenticated;

-- ── mensajes_internos (4) ───────────────────────────────────────────────────
ALTER POLICY "mensajes_ver" ON public.mensajes_internos TO authenticated;
ALTER POLICY "mensajes_insertar" ON public.mensajes_internos TO authenticated;
ALTER POLICY "mensajes_marcar_leido" ON public.mensajes_internos TO authenticated;
ALTER POLICY "mensajes_borrar" ON public.mensajes_internos TO authenticated;

-- ── mensajes_lecturas (2) ───────────────────────────────────────────────────
-- No hay política de UPDATE y no se agrega ninguna (nota técnica 19).
ALTER POLICY "lecturas_select_own" ON public.mensajes_lecturas TO authenticated;
ALTER POLICY "lecturas_insert_own" ON public.mensajes_lecturas TO authenticated;

-- ── notas (4) ───────────────────────────────────────────────────────────────
ALTER POLICY "notas_select_own" ON public.notas TO authenticated;
ALTER POLICY "notas_insert_own" ON public.notas TO authenticated;
ALTER POLICY "notas_update_own" ON public.notas TO authenticated;
ALTER POLICY "notas_delete_own" ON public.notas TO authenticated;

-- ── notificaciones (4) ──────────────────────────────────────────────────────
-- ⚠ La asimetría de esta tabla (INSERT con get_medico_id(), el resto con auth.uid())
--   es INTENCIONAL y queda intacta: un asistente inserta la notificación EN NOMBRE de
--   su médico al agendar un turno. Ver la migración 030. Acá solo cambia el rol.
ALTER POLICY "notificaciones_select" ON public.notificaciones TO authenticated;
ALTER POLICY "notificaciones_insert" ON public.notificaciones TO authenticated;
ALTER POLICY "notificaciones_update" ON public.notificaciones TO authenticated;
ALTER POLICY "notificaciones_delete" ON public.notificaciones TO authenticated;

-- ── obras_sociales (1) ──────────────────────────────────────────────────────
-- Su USING ya es `auth.role() = 'authenticated'`, así que el TO es redundante en
-- efecto. Se normaliza igual: la convención vale para las 65, sin excepciones que
-- después haya que recordar.
ALTER POLICY "obras_sociales_select_all" ON public.obras_sociales TO authenticated;

-- ── pacientes (4) ───────────────────────────────────────────────────────────
ALTER POLICY "pacientes_select" ON public.pacientes TO authenticated;
ALTER POLICY "pacientes_insert" ON public.pacientes TO authenticated;
ALTER POLICY "pacientes_update" ON public.pacientes TO authenticated;
ALTER POLICY "pacientes_delete" ON public.pacientes TO authenticated;

-- ── pedidos (3) ─────────────────────────────────────────────────────────────
-- pedidos_delete NO existe (dropeada por la 025, regla de negocio 5).
ALTER POLICY "pedidos_select" ON public.pedidos TO authenticated;
ALTER POLICY "pedidos_insert" ON public.pedidos TO authenticated;
ALTER POLICY "pedidos_update" ON public.pedidos TO authenticated;

-- ── profiles (2) ────────────────────────────────────────────────────────────
-- ⚠ La tabla del guard de sesión. Su SELECT lo consultan get_medico_id(),
--   get_user_role() y check_permiso(), pero esas tres son SECURITY DEFINER: no pasan
--   por esta política. Quien sí pasa es el `(app)/layout.tsx` al cargar el profile —
--   y siempre con sesión, o sea como `authenticated`.
ALTER POLICY "profiles_select" ON public.profiles TO authenticated;
ALTER POLICY "profiles_update_own" ON public.profiles TO authenticated;

-- ── recetas (1) ─────────────────────────────────────────────────────────────
-- Solo el SELECT: insert/update/delete ya están en authenticated desde la 029.
ALTER POLICY "recetas_select" ON public.recetas TO authenticated;

-- ── solicitudes_asistente (3) ───────────────────────────────────────────────
-- ⚠ El workflow de onboarding. Sus 3 políticas cuelgan de auth.uid(), y el asistente
--   que solicita vinculación YA está autenticado (solo le falta el medico_id): el
--   guard lo manda a /onboarding, que está dentro de la app. No hay paso anónimo.
--   No existe política de DELETE y no se agrega.
ALTER POLICY "solicitudes_select" ON public.solicitudes_asistente TO authenticated;
ALTER POLICY "solicitudes_insert" ON public.solicitudes_asistente TO authenticated;
ALTER POLICY "solicitudes_update" ON public.solicitudes_asistente TO authenticated;

-- ── turnos (4) ──────────────────────────────────────────────────────────────
-- El pendiente que dejó anotado la 039: usó ALTER POLICY sin `TO` para cambiar el
-- USING de turnos_select, y eso PRESERVA el rol, así que la tabla quedó en {public}
-- a propósito, para no mezclar dos cambios. Esto lo cierra.
ALTER POLICY "turnos_select" ON public.turnos TO authenticated;
ALTER POLICY "turnos_insert" ON public.turnos TO authenticated;
ALTER POLICY "turnos_update" ON public.turnos TO authenticated;
ALTER POLICY "turnos_delete" ON public.turnos TO authenticated;

COMMIT;

-- ── VERIFICACIÓN (correr por separado después del COMMIT) ────────────────────
--
-- V1. El conteo global. Es la prueba principal.
--     ESPERADO: una sola fila → {authenticated} = 65. Ninguna fila {public}.
--     (Antes de aplicar eran 49 en {public} y 16 en {authenticated}.)
--
--   SELECT roles::text AS rol, count(*) AS cantidad
--   FROM pg_policies
--   WHERE schemaname = 'public'
--   GROUP BY roles::text
--   ORDER BY cantidad DESC;
--
-- V2. Que no quede NINGUNA en {public}. ESPERADO: 0 filas.
--
--   SELECT tablename, policyname, cmd, roles
--   FROM pg_policies
--   WHERE schemaname = 'public' AND roles::text = '{public}'
--   ORDER BY tablename, policyname;
--
-- V3. Desglose por tabla, para confirmar que las 18 tocadas quedaron completas.
--     ESPERADO: 20 filas (18 tocadas + bloqueos_agenda y turnos_audit_log, que ya
--     estaban), TODAS con en_public = 0.
--
--   SELECT tablename,
--          count(*)                                              AS total,
--          count(*) FILTER (WHERE roles::text = '{public}')       AS en_public,
--          count(*) FILTER (WHERE roles::text = '{authenticated}') AS en_authenticated
--   FROM pg_policies
--   WHERE schemaname = 'public'
--   GROUP BY tablename
--   ORDER BY tablename;
--
-- V4. ⚠ EL CHEQUEO QUE IMPORTA DE VERDAD: que NINGUNA EXPRESIÓN haya cambiado.
--     `ALTER POLICY … TO` no las toca, así que `qual` y `with_check` tienen que salir
--     idénticos a como estaban antes de aplicar. Comparar contra el JSON de pg_policies
--     que se tomó ANTES (el de las 49 filas). ESPERADO: cero diferencias en qual y
--     with_check; la única columna distinta debe ser `roles`.
--
--   SELECT tablename, policyname, cmd, roles, qual, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public'
--   ORDER BY tablename, policyname;
--
-- V5. Que las UPDATE sin WITH CHECK sigan SIN WITH CHECK (no se agregó ninguno).
--     ESPERADO: 10 filas → profiles_update_own, pacientes_update, historia_update,
--     estudios_update, consultas_update, turnos_update, pedidos_update,
--     certificados_update, solicitudes_update, notificaciones_update.
--
--   SELECT tablename, policyname
--   FROM pg_policies
--   WHERE schemaname = 'public' AND cmd = 'UPDATE' AND with_check IS NULL
--   ORDER BY tablename, policyname;
--
-- La prueba REAL es funcional y NO debería mostrar ningún cambio: entrar como médico y
-- como asistente, y verificar que todo sigue igual (pacientes, agenda, HC, documentos,
-- mensajería, notas, difusión). Esta migración no cambia ninguna autorización: si algo
-- se comporta distinto, revertir y revisar. Chequear en particular la página pública
-- /verificar/[codigo], que debe seguir funcionando SIN sesión (va por service_role).

-- ── REVERSIBLE ──────────────────────────────────────────────────────────────
-- Revertir es el mismo ALTER con el rol opuesto — `TO public` devuelve la política al
-- estado "sin cláusula TO explícita", que es de donde vino.
--
-- ⚠ Revertir NO restaura ningún acceso que hoy exista: `anon` ya no leía nada antes de
--   esta migración (todas las expresiones cuelgan de auth.uid()/get_medico_id(), que
--   para `anon` no resuelven). O sea: revertir deshace la EXPLICITUD, no un permiso.
--   Si algo se rompió después de aplicar esto, la causa casi seguro está en otro lado.
--
-- ⚠ Y OJO CON EL ALCANCE AL REVERTIR: hay que listar EXACTAMENTE estas 49. Un
--   `TO public` masivo sobre las 65 desnormalizaría también las 16 que ya estaban
--   —incluidas las que la 029 puso ahí para cerrar un drift de seguridad real— y eso
--   sí sería un retroceso. Las 16 a NO tocar: historia_delete, evoluciones_insert,
--   evoluciones_update, evoluciones_delete, consultas_delete, bloqueos_select,
--   bloqueos_insert, bloqueos_update, bloqueos_delete, audit_select, recetas_insert,
--   recetas_update, recetas_delete, difusion_insert, difusion_update, difusion_delete.
--
-- BEGIN;
--   ALTER POLICY "certificados_select" ON public.certificados TO public;
--   ALTER POLICY "certificados_insert" ON public.certificados TO public;
--   ALTER POLICY "certificados_update" ON public.certificados TO public;
--   ALTER POLICY "consultas_select" ON public.consultas TO public;
--   ALTER POLICY "consultas_insert" ON public.consultas TO public;
--   ALTER POLICY "consultas_update" ON public.consultas TO public;
--   ALTER POLICY "envios_select" ON public.difusion_envios TO public;
--   ALTER POLICY "envios_insert" ON public.difusion_envios TO public;
--   ALTER POLICY "difusion_select" ON public.difusion_posts TO public;
--   ALTER POLICY "estudios_select" ON public.estudios TO public;
--   ALTER POLICY "estudios_insert" ON public.estudios TO public;
--   ALTER POLICY "estudios_update" ON public.estudios TO public;
--   ALTER POLICY "estudios_delete" ON public.estudios TO public;
--   ALTER POLICY "evoluciones_select" ON public.evoluciones TO public;
--   ALTER POLICY "historia_select" ON public.historia_clinica TO public;
--   ALTER POLICY "historia_insert" ON public.historia_clinica TO public;
--   ALTER POLICY "historia_update" ON public.historia_clinica TO public;
--   ALTER POLICY "mensajes_ver" ON public.mensajes_internos TO public;
--   ALTER POLICY "mensajes_insertar" ON public.mensajes_internos TO public;
--   ALTER POLICY "mensajes_marcar_leido" ON public.mensajes_internos TO public;
--   ALTER POLICY "mensajes_borrar" ON public.mensajes_internos TO public;
--   ALTER POLICY "lecturas_select_own" ON public.mensajes_lecturas TO public;
--   ALTER POLICY "lecturas_insert_own" ON public.mensajes_lecturas TO public;
--   ALTER POLICY "notas_select_own" ON public.notas TO public;
--   ALTER POLICY "notas_insert_own" ON public.notas TO public;
--   ALTER POLICY "notas_update_own" ON public.notas TO public;
--   ALTER POLICY "notas_delete_own" ON public.notas TO public;
--   ALTER POLICY "notificaciones_select" ON public.notificaciones TO public;
--   ALTER POLICY "notificaciones_insert" ON public.notificaciones TO public;
--   ALTER POLICY "notificaciones_update" ON public.notificaciones TO public;
--   ALTER POLICY "notificaciones_delete" ON public.notificaciones TO public;
--   ALTER POLICY "obras_sociales_select_all" ON public.obras_sociales TO public;
--   ALTER POLICY "pacientes_select" ON public.pacientes TO public;
--   ALTER POLICY "pacientes_insert" ON public.pacientes TO public;
--   ALTER POLICY "pacientes_update" ON public.pacientes TO public;
--   ALTER POLICY "pacientes_delete" ON public.pacientes TO public;
--   ALTER POLICY "pedidos_select" ON public.pedidos TO public;
--   ALTER POLICY "pedidos_insert" ON public.pedidos TO public;
--   ALTER POLICY "pedidos_update" ON public.pedidos TO public;
--   ALTER POLICY "profiles_select" ON public.profiles TO public;
--   ALTER POLICY "profiles_update_own" ON public.profiles TO public;
--   ALTER POLICY "recetas_select" ON public.recetas TO public;
--   ALTER POLICY "solicitudes_select" ON public.solicitudes_asistente TO public;
--   ALTER POLICY "solicitudes_insert" ON public.solicitudes_asistente TO public;
--   ALTER POLICY "solicitudes_update" ON public.solicitudes_asistente TO public;
--   ALTER POLICY "turnos_select" ON public.turnos TO public;
--   ALTER POLICY "turnos_insert" ON public.turnos TO public;
--   ALTER POLICY "turnos_update" ON public.turnos TO public;
--   ALTER POLICY "turnos_delete" ON public.turnos TO public;
-- COMMIT;
