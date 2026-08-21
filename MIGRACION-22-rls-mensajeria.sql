-- ============================================================================
-- Migration 046 — RLS de mensajería: exigir `acceso_mensajeria` y el tenant
-- ============================================================================
--
-- ── EL HUECO QUE CIERRA ─────────────────────────────────────────────────────
--   Las cuatro políticas de `mensajes_internos` piden MENOS que la aplicación:
--
--     · NINGUNA exige el permiso `acceso_mensajeria`. Un asistente con el permiso
--       en FALSE que le pegara a PostgREST directo leía, escribía y borraba
--       mensajes igual — la app lo frenaba, la base no.
--     · `mensajes_ver` aplica el tenant SOLO a la rama grupal. Las dos ramas de
--       mensajes individuales (`remitente_id = auth.uid()` y `destinatario_id =
--       auth.uid()`) comparan contra el usuario y NO miran `medico_id`, así que un
--       individual sobrevivía a un cambio de médico: el asistente desvinculado
--       seguía viendo los mensajes del consultorio anterior.
--     · `mensajes_marcar_leido` no aplica ni permiso ni tenant.
--
-- ── POR QUÉ EXISTÍA (no fue una decisión de aflojar) ────────────────────────
--   El permiso nació DOS MIGRACIONES ANTES que la mensajería. La 015 creó la
--   columna con este comentario, que sigue vigente en la base:
--
--     COMMENT ON COLUMN public.profiles.acceso_mensajeria IS
--       'Asistente: acceso al módulo de mensajería (preparado para uso futuro)';
--
--   Cuando ese "uso futuro" llegó —la 017, que crea `mensajes_internos` y sus
--   políticas— NADIE cableó el permiso a la RLS. Quedó colgado ~30 migraciones.
--
--   ⚠ Es el TERCER y ÚLTIMO caso del mismo hueco en el esquema. Los dos anteriores
--   ya se cerraron:
--     · `consultas`  → migración **025** (dos políticas huérfanas daban acceso ALL
--       a cualquier asistente vinculado, salteando check_permiso; como las políticas
--       permisivas se combinan con OR, anulaban de hecho a las correctas).
--     · `estudios`   → migración **026**, que lo enuncia textualmente: "Las políticas
--       actuales aíslan por tenant (creado_por = get_medico_id()) pero NO validan
--       check_permiso() […] Mismo hueco que tenía `consultas` antes de la 025."
--   Con esta migración no queda ninguna tabla del esquema en esa situación.
--
-- ── AUDITORÍA PREVIA (hecha sobre la base viva, antes de escribir esto) ─────
--   · 42 mensajes: 18 raíces y 24 respuestas; 2 grupales y 40 individuales; 2 tenants.
--   · CERO individuales con `medico_id` desalineado del tenant de su remitente o de
--     su destinatario → el filtro de tenant nuevo no oculta NADA.
--   · CERO mensajes huérfanos (sin perfil de remitente, destinatario o médico).
--   · Los 4 usuarios que participan ven EXACTAMENTE los mismos mensajes antes y
--     después: ninguno pierde ni gana acceso.
--   · Los dos médicos tienen `acceso_mensajeria = false` en su fila y `check_permiso`
--     igual les devuelve TRUE (verificado empíricamente). Ver el bloque de abajo.
--   · Las políticas vigentes coinciden exactamente con las migraciones fuente
--     (017 + 020 + 042): no hay drift.
--
-- ── ⚠ POR QUÉ AGREGAR check_permiso NO DEJA AFUERA AL MÉDICO TITULAR ────────
--   `check_permiso(user_id, permiso)` (migración 015) abre su cuerpo así:
--
--     SELECT role INTO v_role FROM public.profiles WHERE id = user_id;
--     IF v_role = 'medico' THEN
--       RETURN TRUE;
--     END IF;
--
--   CORTA ANTES de leer una sola columna de permiso. Por eso da TRUE al titular
--   aunque su `acceso_mensajeria` sea FALSE —que es el DEFAULT de la 015 y el valor
--   real de los dos médicos de esta base—. Es el mismo mecanismo del que ya dependen
--   `bloqueos_agenda` (037), `turnos` (039), `estudios` (026) y los dos buckets de
--   Storage (026/027). Además NUNCA devuelve NULL: cierra con COALESCE(v_result, FALSE),
--   así que en un AND es determinista y fail-closed.
--
-- ── ⚠ LA ASIMETRÍA CON EL BORRADO ES DELIBERADA A PARTIR DE ACÁ ─────────────
--   El médico titular PUEDE BORRAR un mensaje individual entre dos de sus asistentes
--   (`mensajes_borrar` incluye `medico_id = auth.uid()`) pero NO PUEDE LEERLO
--   (`mensajes_ver` solo deja ver individuales a remitente y destinatario).
--
--   ⚠ ESO NO ES UN DESCUIDO Y NO HAY QUE "CORREGIRLO".
--
--   Hasta esta migración SÍ era accidental: la 017 enumeró los tres casos del SELECT
--   sin contemplar al titular, y la 020 —tres migraciones después, escrita para otra
--   cosa— sí lo enunció como regla de negocio. El DELETE tuvo su momento de diseño y
--   el SELECT no.
--
--   Acá se revisó y se DECIDIÓ CONSERVARLA: se eligió la variante conservadora. El
--   titular no gana visibilidad sobre las conversaciones privadas entre sus
--   asistentes. Puede borrarlas —es el dueño del tenant y responsable de sus datos—
--   pero no leerlas. Si alguna vez se quiere cambiar, es una decisión de PRODUCTO
--   sobre privacidad, no una corrección técnica: hay que tomarla explícitamente.
--
-- ── POR QUÉ `ALTER POLICY` Y NO DROP + CREATE ───────────────────────────────
--   Las cuatro políticas YA están en el rol correcto (`TO authenticated`, normalizado
--   por la 042) y YA tienen el comando correcto. Lo único que cambia son las
--   EXPRESIONES. `ALTER POLICY` las modifica EN EL LUGAR, sin el instante intermedio
--   en que la política no existe —que en una política de LECTURA sobre una tabla viva
--   es justamente lo que no se quiere—. Mismo criterio que la 039; la 037 usó
--   DROP+CREATE solo porque además tenía que cambiarles el rol.
--
--   ⚠ `ALTER POLICY` sin cláusula `TO` PRESERVA el rol tal como esté. Como las cuatro
--   ya están en `authenticated`, no hace falta declararlo y no se toca.
--
--   El BEGIN/COMMIT sí es necesario acá (a diferencia de la 039, que era una sola
--   sentencia): son cinco cambios que tienen que aplicarse o fallar juntos.
--
-- ── LO QUE ESTA MIGRACIÓN NO TOCA ───────────────────────────────────────────
--   · `mensajes_lecturas` — queda AFUERA a propósito. No tiene columna de tenant
--     (sus columnas son mensaje_id, user_id, leido_at) y sus dos políticas ya acotan
--     a `user_id = auth.uid()`, o sea que un usuario solo ve SUS PROPIAS lecturas:
--     no hay fuga de datos ajenos. Aplicarle el criterio exigiría un EXISTS contra
--     `mensajes_internos` (patrón `estudios`), y se decide aparte.
--   · Ninguna otra tabla.
--   · NINGÚN código de aplicación: las server actions de mensajería ya aplican estas
--     mismas reglas. Esta migración solo hace que la base las EXIJA también, de modo
--     que dejen de ser evitables por PostgREST directo.
--
-- Fecha: 2026-08-21
-- ============================================================================

BEGIN;

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 1. mensajes_ver (SELECT) — permiso + tenant en TODAS las ramas             │
-- └──────────────────────────────────────────────────────────────────────────┘
-- Tres condiciones en AND:
--   a) el permiso (que exime al médico, ver arriba);
--   b) el tenant, ahora aplicado al mensaje ENTERO y no solo a la rama grupal;
--   c) la relación con el mensaje, que conserva EXACTAMENTE el criterio de la 017.
--
-- ⚠ La tercera rama pasa de `(es_grupal AND medico_id = get_medico_id())` a
-- `es_grupal` a secas PORQUE el tenant ya se exige arriba, para todas. La semántica
-- de los grupales queda idéntica; lo que cambia es que los INDIVIDUALES pasan a
-- exigirlo también.
ALTER POLICY "mensajes_ver" ON public.mensajes_internos
  USING (
    public.check_permiso(auth.uid(), 'acceso_mensajeria')
    AND medico_id = get_medico_id()
    AND (
      remitente_id = auth.uid()
      OR (NOT es_grupal AND destinatario_id = auth.uid())
      OR es_grupal
    )
  );

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 2. mensajes_insertar (INSERT) — solo suma el permiso                       │
-- └──────────────────────────────────────────────────────────────────────────┘
-- Ya aislaba por tenant desde la 017. El resto de la expresión queda igual.
ALTER POLICY "mensajes_insertar" ON public.mensajes_internos
  WITH CHECK (
    public.check_permiso(auth.uid(), 'acceso_mensajeria')
    AND remitente_id = auth.uid()
    AND medico_id = get_medico_id()
  );

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 3. mensajes_marcar_leido (UPDATE) — suma permiso y tenant                  │
-- └──────────────────────────────────────────────────────────────────────────┘
-- ⚠ El `NOT es_grupal` se CONSERVA y no hay que "arreglarlo": los mensajes grupales
-- NO admiten UPDATE por diseño, porque su lectura se registra en `mensajes_lecturas`
-- (una fila por usuario que leyó) y no en la fila del mensaje. Quitarlo abriría el
-- UPDATE de los grupales sin ninguna necesidad.
--
-- USING y WITH CHECK llevan la MISMA expresión, igual que en la 017: la fila que se
-- puede tomar es la misma que puede quedar después del update.
ALTER POLICY "mensajes_marcar_leido" ON public.mensajes_internos
  USING (
    public.check_permiso(auth.uid(), 'acceso_mensajeria')
    AND medico_id = get_medico_id()
    AND NOT es_grupal
    AND destinatario_id = auth.uid()
  )
  WITH CHECK (
    public.check_permiso(auth.uid(), 'acceso_mensajeria')
    AND medico_id = get_medico_id()
    AND NOT es_grupal
    AND destinatario_id = auth.uid()
  );

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 4. mensajes_borrar (DELETE) — solo suma el permiso                         │
-- └──────────────────────────────────────────────────────────────────────────┘
-- ⚠ `medico_id = auth.uid()` se CONSERVA TAL CUAL y NO se cambia por
-- `get_medico_id()`. La diferencia es el punto entero de esta política: con
-- `auth.uid()` solo entra el MÉDICO TITULAR (para quien medico_id = su propio id);
-- con `get_medico_id()` entrarían también sus asistentes, que resuelven al mismo
-- tenant. Es lo que hoy restringe el borrado al titular, y la regla de negocio que
-- la app ya aplica ("solo el médico puede eliminar mensajes"). Es deliberado desde
-- la 020, que lo enuncia:
--   "1. El remitente del mensaje puede borrar su propio mensaje.
--    2. El médico vinculado a la cuenta puede borrar cualquier mensaje de su tenant."
ALTER POLICY "mensajes_borrar" ON public.mensajes_internos
  USING (
    public.check_permiso(auth.uid(), 'acceso_mensajeria')
    AND (
      remitente_id = auth.uid()
      OR medico_id = auth.uid()
    )
  );

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 5. get_medico_id() — fijar search_path                                     │
-- └──────────────────────────────────────────────────────────────────────────┘
-- Es SECURITY DEFINER y no fijaba search_path (riesgo de secuestro de esquema).
-- Se agrega SET search_path = public. Cuerpo idéntico al vigente.
--
-- ⚠ Mismo criterio y misma redacción que la migración 025, que arregló exactamente
-- esto en `verificar_documento()` y `log_turno_cambio()`. `get_medico_id()` quedó
-- afuera de aquella pasada siendo la función MÁS USADA del esquema: la invocan casi
-- todas las políticas multi-tenant, incluidas las cuatro de arriba.
--
-- ⚠ RIESGO NULO DE COMPORTAMIENTO: el cuerpo no cambia ni un carácter, y además ya
-- referencia `public.profiles` con el esquema calificado, así que el search_path no
-- alteraba ni podía alterar a qué tabla resuelve. Es endurecimiento puro.
CREATE OR REPLACE FUNCTION public.get_medico_id()
RETURNS uuid AS $$
  SELECT CASE
    WHEN role = 'medico'    THEN id
    WHEN role = 'asistente' THEN medico_id
    ELSE NULL
  END
  FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

COMMIT;


-- ============================================================================
-- VERIFICACIÓN (correr DESPUÉS del COMMIT)
-- ============================================================================
--
-- 1) Las cuatro políticas, con sus expresiones nuevas y su rol intacto.
--    ESPERADO: 4 filas, TODAS con roles = {authenticated}, y las 4 expresiones
--    conteniendo `check_permiso`. Los cmd deben seguir siendo SELECT/INSERT/UPDATE/DELETE.
--
-- SELECT policyname, cmd, roles, qual AS using_expr, with_check
--   FROM pg_policies
--  WHERE schemaname = 'public' AND tablename = 'mensajes_internos'
--  ORDER BY cmd, policyname;
--
--
-- 2) Chequeo rápido de que ninguna quedó sin el permiso. ESPERADO: 0 filas.
--
-- SELECT policyname, cmd
--   FROM pg_policies
--  WHERE schemaname = 'public' AND tablename = 'mensajes_internos'
--    AND coalesce(qual, '') || coalesce(with_check, '') NOT LIKE '%check_permiso%';
--
--
-- 3) `mensajes_lecturas` NO se tocó. ESPERADO: 2 filas (select e insert), ambas con
--    `user_id = auth.uid()` y sin `check_permiso`.
--
-- SELECT policyname, cmd, roles, qual, with_check
--   FROM pg_policies
--  WHERE schemaname = 'public' AND tablename = 'mensajes_lecturas'
--  ORDER BY cmd;
--
--
-- 4) El search_path de las funciones. ESPERADO: `get_medico_id` y `check_permiso`
--    ahora con proconfig = {search_path=public}; ninguna de las dos en NULL.
--
-- SELECT p.proname, p.prosecdef AS security_definer, p.proconfig
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public'
--    AND p.proname IN ('get_medico_id', 'check_permiso')
--  ORDER BY p.proname;
--
--
-- 5) LA COMPROBACIÓN QUE IMPORTA — funcional, en la app:
--    · El médico titular abre /mensajes y ve las MISMAS conversaciones que antes.
--    · Un asistente CON `acceso_mensajeria` ve las mismas que antes.
--    · Un asistente SIN el permiso ve la bandeja vacía (y la app ya lo redirige antes,
--      así que en la práctica no debería llegar).
--    ⚠ Si la bandeja de alguien que antes veía mensajes queda VACÍA, revertir con el
--    bloque de abajo: el fallo de una política de lectura es SILENCIOSO, no da error.
--
-- ============================================================================


-- ============================================================================
-- REVERSIBLE — cómo volver atrás
-- ============================================================================
--
-- Restaura EXACTAMENTE el estado previo: las cuatro expresiones tal como las dejaron
-- la 017 (ver/insertar/marcar_leido) y la 020 (borrar), y `get_medico_id()` sin
-- search_path.
--
-- ✅ La reversión es TOTAL y SIN PÉRDIDA DE DATOS: una política no toca ni una fila,
-- solo decide qué filas se ven. Es el tipo de migración más seguro de revertir que
-- hay — a diferencia de una migración de datos (p. ej. la 045, cuyo UPDATE es
-- destructivo). Se restaura la expresión y todo vuelve a verse igual que antes.
--
-- ⚠ El rol NO hace falta restaurarlo: esta migración usó `ALTER POLICY` sin cláusula
-- `TO`, así que nunca lo tocó. Las cuatro siguen en {authenticated} desde la 042.
--
-- BEGIN;
--   ALTER POLICY "mensajes_ver" ON public.mensajes_internos
--     USING (
--       remitente_id = auth.uid()
--       OR (NOT es_grupal AND destinatario_id = auth.uid())
--       OR (es_grupal AND medico_id = get_medico_id())
--     );
--
--   ALTER POLICY "mensajes_insertar" ON public.mensajes_internos
--     WITH CHECK (
--       remitente_id = auth.uid()
--       AND medico_id = get_medico_id()
--     );
--
--   ALTER POLICY "mensajes_marcar_leido" ON public.mensajes_internos
--     USING      (NOT es_grupal AND destinatario_id = auth.uid())
--     WITH CHECK (NOT es_grupal AND destinatario_id = auth.uid());
--
--   ALTER POLICY "mensajes_borrar" ON public.mensajes_internos
--     USING (
--       remitente_id = auth.uid()
--       OR medico_id = auth.uid()
--     );
--
--   -- get_medico_id() sin search_path (estado de la 001/010)
--   CREATE OR REPLACE FUNCTION public.get_medico_id()
--   RETURNS uuid AS $$
--     SELECT CASE
--       WHEN role = 'medico'    THEN id
--       WHEN role = 'asistente' THEN medico_id
--       ELSE NULL
--     END
--     FROM public.profiles WHERE id = auth.uid()
--   $$ LANGUAGE sql SECURITY DEFINER STABLE;
-- COMMIT;
--
-- ============================================================================
