# Pendientes — Pulidos finales v1.x

**Estado:** la aplicación está en **v1.0, deployada y funcional**. Los siguientes
pulidos se organizan en tres bloques (Funcional / Seguridad / Estético). Cada ítem
incluye, cuando aplica, su ubicación en el código.

> Hallazgos surgidos de la exploración documental del repo. No se modificó código de
> la app al relevarlos.

---

## Bloque A — Funcional

Ajustes de comportamiento, flujos incompletos, detalles de usabilidad y trabajo pendiente.

### Funcionalidades incompletas
- **Dashboard — métricas:** definir e implementar qué métricas mostrar (pendiente de
  definición del cliente). Hoy existe `src/components/dashboard/stats-cards.tsx`.
- **✅ RESUELTO (2026-07-27) — Difusión: envío de correos por Resend.** El endpoint dejó de ser
  un stub: `POST /api/difusion/enviar` valida el body (`difusionEnvioSchema`), recarga los
  destinatarios desde la base (tenant + activos + email de formato válido, sin confiar en los ids
  del cliente), verifica el **límite diario de 100** contando `difusion_envios` del día, envía
  **secuencialmente** (pausa de 600 ms) con `lib/email/resend.ts` + la plantilla HTML de
  `lib/email/difusion-template.ts` (escapada con el nuevo `escapeHtml` de `lib/utils.ts`),
  registra **una fila por destinatario** en `difusion_envios` (`enviado_ok`/`error_msg`/
  `enviado_at`/`enviado_por`) y marca el post como `enviado` si al menos uno salió bien. Se sumó
  `GET /api/difusion/destinatarios` (mismo filtro que `/enviar`) y la UI:
  `components/difusion/enviar-modal.tsx` (búsqueda + filtros por obra social y sexo, selección
  global, aviso al pasar de 100, lista de fallidos tras un envío parcial), un checkbox propio en
  `components/ui/checkbox.tsx`, y el resumen de envío + lista de "a quién no le llegó" en el
  detalle (`(app)/difusion/[id]/page.tsx` → `difusion-preview.tsx`). Es **tenant-only**: sin
  chequeo de rol, coherente con que difusión no tenga permiso granular. Ver `CLAUDE.md` → regla de
  negocio 12 y nota técnica 16. **Quedan pendientes** los **cinco** ítems de difusión listados
  abajo (opt-out, dominio de Resend, envío por lotes, reintento de fallidos y corte del día en
  UTC), más **WhatsApp**, que no es un pendiente activo sino un canal **fuera de alcance**.
- **Recetas:** bloqueadas por certificación ANMAT. `src/app/api/recetas/route.ts` es
  stub y `src/lib/pdf/receta-template.tsx` es un placeholder vacío (esperado; dejar
  documentado que está en pausa).
- **✅ RESUELTO (migraciones 027–028, 2026-07-23) — Persistencia de PDFs + "firma viva".**
  El PDF ahora se **congela al emitir** en el bucket privado `documentos` (`pdf_path`) y las
  descargas sirven ese objeto **inmutable**; ya no se regeneran con los datos actuales del
  médico. Además se **snapshotean los datos del emisor** en la fila (`emisor_snapshot`, JSONB):
  el preview HTML y la regeneración del PDF leen de ahí, no de `profiles` en vivo, así que
  **preview y PDF coinciden** y el documento queda reconstruible fiel aunque se pierda el
  objeto de Storage. El problema de la *"firma viva"* (documentos históricos reimpresos con la
  firma/matrícula nueva) queda **cerrado**. Sin backfill: los documentos de prueba previos se
  borraron, así que todos los actuales tienen snapshot. Código: `lib/pdf/documentos.ts`, POST/GET
  de pedidos y certificados, páginas de detalle, `pedido-pdf`/`certificado-pdf`. Reglas de
  negocio 5 y 11 en `CLAUDE.md`; buckets/columna en `schema.sql`.
- **✅ RESUELTO (POST de pedidos/certificados, 2026-07-23) — regla de negocio 9.** Los POST de
  emisión **no validaban `archivado_at`**: se podía emitir un documento a un paciente archivado
  por API directa (la UI ya lo bloqueaba, pero el servidor no). Ahora rechazan con **409**,
  copiando el patrón de `POST /api/consultas`. Era un incumplimiento preexistente de la regla 9.
- **Bucket `difusion`:** las tandas de Storage crearon `estudios` (migración 026) y `documentos`
  (migración 027). Falta **`difusion`** (imágenes de posts — `difusion_posts.imagen_path` es
  andamiaje muerto por ahora): **no existe ni se usa**. Cuando se cree, versionar el bucket y sus
  políticas RLS por tenant con el mismo patrón que `estudios`/`documentos` (ver Bloque B → Storage).
- **Difusión — opt-out / consentimiento (Ley 25.326). ⚠ BLOQUEANTE DE GO-LIVE.** El envío por
  email ya funciona, pero **no hay mecanismo de baja** ni registro del consentimiento del
  paciente para recibir comunicaciones. El pie de la plantilla tiene el marcador:
  `src/lib/email/difusion-template.ts` (`<!-- TODO opt-out (Ley 25.326) ... -->`). Requiere, como
  mínimo: un flag de consentimiento/baja por paciente, un enlace de baja con token en el email, y
  filtrarlo en `GET /api/difusion/destinatarios` y en el POST de envío. **No enviar a pacientes
  reales antes de resolverlo.**
- **Difusión — dominio verificado en Resend (bloquea el envío real).** Sin `RESEND_FROM` apuntando
  a un dominio verificado, el remitente cae al sandbox `onboarding@resend.dev`, que **solo entrega
  a la casilla dueña de la cuenta de Resend**. Hoy el flujo se prueba de punta a punta contra esa
  casilla, pero **no llega a los pacientes**. Verificar el dominio (registros DNS) y setear
  `RESEND_FROM` antes de usarlo en producción.
- **Difusión — envío por lotes con retomado (>100 destinatarios).** El tope diario del free tier
  de Resend es **100**; hoy, si el envío lo superaría, el endpoint **rechaza con 429 sin enviar
  nada** y el usuario tiene que **destildar destinatarios a mano** (el modal se lo avisa en el
  footer). Falta: partir el envío en lotes, persistir el progreso y **retomar al día siguiente**
  desde donde quedó (o subir el plan de Resend). Código: `src/app/api/difusion/enviar/route.ts`;
  el tope vive en una **fuente única**, `DIFUSION_LIMITE_DIARIO` de `src/constants/difusion.ts`
  (la comparten endpoint y modal), así que subir el plan es cambiar ese único número.
- **Difusión — no se puede reintentar un envío parcial.** Con **un solo** envío exitoso el post
  pasa a `estado='enviado'`, y a partir de ahí el POST responde **409** ("ya fue enviado"). Los
  destinatarios que fallaron quedan listados en el detalle, pero **no hay forma de reintentarles**
  desde la UI. Falta un reintento acotado a los `difusion_envios` con `enviado_ok=false`.
- **Difusión — el corte del día del límite es UTC, no hora argentina.** El conteo diario usa
  `new Date(); setHours(0,0,0,0)` con la hora **local del server** (UTC en Vercel), así que la
  ventana de 100 se renueva a las **21:00 de Argentina**, no a medianoche. Cosmético mientras el
  volumen sea bajo; revisar si se acerca al tope. Código: `src/app/api/difusion/enviar/route.ts`
  (`startOfDay`). Nota: los envíos **fallidos también consumen** la cuota (se cuentan las filas de
  `difusion_envios` del día, sin filtrar por `enviado_ok`).
- **Difusión — canal WhatsApp: fuera de alcance, sigue sin implementar.** `difusion_posts.canal`
  acepta `email | whatsapp | ambos` y la UI muestra el canal elegido, pero **solo se envía por
  email**: la tanda de envío cubrió únicamente ese canal. `src/lib/whatsapp/wa-link.ts` está
  prácticamente vacío y las env vars `WHATSAPP_*` siguen sin usarse. Un post con canal
  `whatsapp`/`ambos` que se envíe por el modal sale **solo como email**.
- **`recetas` necesitará su `emisor_snapshot`:** la columna se agregó (mig. 028) solo a
  `pedidos` y `certificados`. Cuando se habilite la emisión de recetas (bloqueada por ANMAT),
  sumar la misma columna a `recetas` y escribir el snapshot al emitir, igual que en los otros dos.

### Bugs menores detectados
- **✅ RESUELTO (2026-07-26) — Filename de certificados sin tipo → `certificado_null_...`.** El
  nombre del PDF interpolaba `certificado.tipo`, que llega **siempre `null`** desde que la
  elección de tipo se quitó de la UI, y el null se coercionaba a la cadena `"null"`. Se
  centralizó en un helper compartido: **`src/lib/pdf/filename.ts`** →
  `buildDocumentoFilename(tipo, pacienteNombre, fecha?)`, módulo **neutro** (sin `server-only`)
  que importan tanto los Route Handlers como los Client Components. Arma
  `<certificado|pedido>_<paciente>_<fecha>.pdf`: **ya no interpola el tipo de certificado**,
  **omite** los segmentos vacíos/null en vez de escribir `"null"`/`"undefined"`, y pasa todo por
  `sanitizePdfFilename` (tildes, caracteres inseguros, espacios). De paso **unificó certificados
  y pedidos** y cerró la divergencia previa entre cliente y servidor (el `a.download` del botón
  omitía la fecha y no sanitizaba): ahora ambos producen **exactamente el mismo nombre**.
  Consumidores: `api/pedidos/[id]/pdf/route.ts:31`, `api/certificados/[id]/pdf/route.ts:31`,
  `components/pedidos/pedido-pdf.tsx:64` y `components/certificados/certificado-pdf.tsx:71`.

### Esquema sin migración fuente (reproducibilidad)
- **✅ RESUELTO (migración 030, 2026-07-23).** `consultas`, `notificaciones`, las columnas de
  Bloque 4 de `turnos` (`categoria/origen/consulta_id` + sus 3 CHECK) y
  `profiles.titulo/matriculas/logo_url` ya tienen su `CREATE` versionado en
  `supabase/migrations/`. La migración es idempotente (no cambió nada contra la base actual) y
  crea los objetos en un entorno nuevo.
- **⚠ PENDIENTE NUEVO — Consolidación de baseline de migraciones.** La 030 logra que el
  **estado final** sea reproducible, pero la **secuencia** NO es ejecutable desde una base
  vacía: las migraciones **013, 014, 015, 022 y 025** referencian `public.consultas` (RLS y
  `ALTER`) y la tabla recién se crea en la **030**, así que correr el set desde cero falla en
  la 013. Es una limitación **preexistente** a esta tanda. Resolverlo implica una
  consolidación de baseline: mover los `CREATE` al principio del historial, o generar un
  `000_baseline.sql` aplicable y reordenar. Trabajo aparte, no hecho.
- **✅ RESUELTO (2026-07-24) — desalineación 030 ↔ base en ÍNDICES.** El archivo de la
  migración 030 había quedado con los índices de una versión previa (nombres
  `idx_consultas_paciente`/`idx_consultas_medico`, sin el de `fecha_hora`, y sin ninguno de
  `notificaciones`), porque la versión que se ejecutó fue una corregida a mano. Se **alineó el
  archivo** con lo realmente aplicado: ahora crea los 6 índices explícitos con los nombres y
  definiciones reales (`consultas_{paciente_id,medico_id,fecha_hora}_idx` y
  `idx_notificaciones_{medico,leida,created}`), verificados contra `pg_indexes`. Confirmado
  contra la base: **no hay índices duplicados**; son exactamente 8 contando los dos `*_pkey`.
- **Migración vacía:** `supabase/migrations/20260326204733_fix_rls_recursion.sql`
  tiene **0 bytes**. Su intención (recursión RLS en `profiles`) ya está cubierta por la
  `014` + `019`/`021`. Eliminarla del historial o dejar un comentario no-op.

### Desajustes tipo TypeScript ↔ esquema DB
- **✅ RESUELTOS (2026-07-23).** Los cinco desajustes vigentes se corrigieron:
  `Certificado.tipo` → `CertificadoTipo | null` (cascada: la prop `tipo` de
  `CertificadoPDFProps` en `certificado-template.tsx` pasó a `string | null`);
  `TurnoAuditLog.accion` perdió el `| string` (el trigger `log_turno_cambio` solo emite los 4
  literales); los joins `remitente/destinatario.role` de `types/mensaje.ts` usan `UserRole`;
  se creó la interface `MensajeLectura` (refleja la **proyección** del join —`user_id`,
  `leido_at`—, no la tabla completa, porque el select embebido no trae `mensaje_id` y el
  update optimista de `bandeja.tsx` construye objetos con solo esos dos campos); y se corrigió
  el comentario de `HistoriaClinica.proximo_control` a "ISO timestamptz".
- ~~**`TurnoEstado` incluye `'pendiente_confirmar'`** que no existiría en el ENUM.~~
  **✅ FALSO DESAJUSTE (verificado 2026-07-22):** el ENUM `turno_estado` de la base **sí**
  tiene 7 valores e incluye `'pendiente_confirmar'`. El código (`types/turno.ts`,
  `turno.schema.ts`) está alineado con la base. `schema.sql` corregido para reflejarlo.

### Limpieza de código muerto
- **✅ RESUELTO (2026-07-23) — 16 archivos eliminados.** Los **11** componentes stub sin
  imports (`turnero/turno-card`, `pacientes/{patient-tabs, evolucion-charts}`,
  `dashboard/weekly-calendar`, `shared/{role-guard, loading-spinner, file-preview,
  confirm-dialog, error-boundary}`, `difusion/{post-editor, send-modal}`), los **4** hooks
  stub (`use-auth`, `use-pacientes`, `use-role`, `use-turnos`) y el **barrel redundante**
  `src/types/supabase.ts` (0 consumidores; `types/index.ts` es el barrel completo).
  `use-view-mode.ts` se conservó (tiene lógica real).
- **Queda 1 stub, a propósito:** `src/lib/pdf/receta-template.tsx`. Se **mantuvo** como
  marcador del template de recetas, bloqueado por ANMAT pero a implementar cuando se
  certifique. Eliminarlo o implementarlo cuando se desbloquee la funcionalidad.

### Lint preexistente (deuda técnica menor)
- **Errores/warnings de lint preexistentes** (no introducidos por los cambios recientes,
  detectados al pasar por esos archivos): `@typescript-eslint/no-explicit-any` en
  `src/components/pacientes/consultas/consulta-detail.tsx`, y warnings de alt-text /
  `no-explicit-any` en `src/lib/pdf/consulta-template.tsx`. Limpiar cuando se pase por ahí;
  no bloquean el build.

### Datos / catálogo
- **"Particular / Sin obra social"** existe como **registro real** en la seed de
  `obras_sociales` (migración 001), a la vez que el formulario ofrece una opción
  "Particular" hardcodeada. Verificar que no haya duplicación/ambigüedad al seleccionar.

---

## Bloque B — Seguridad

La app maneja **datos sensibles de salud** de pacientes y debe adecuarse a la normativa
argentina de protección de datos (**Ley 25.326**, que clasifica los datos de salud como
"datos sensibles" con protección reforzada, y la normativa de la **Agencia de Acceso a la
Información Pública**). Hallazgos:

### Verificación pública de documentos (`/verificar/[codigo]`) — minimización de datos
- **✅ RESUELTO (migración 025, 2026-07-22) — minimización de datos.** La función
  `verificar_documento` ya **no expone** el DNI completo ni el contenido clínico. Ahora
  devuelve `paciente_dni_masked` (solo los últimos 3 dígitos) y **omite** el contenido.
  La página `src/app/verificar/[codigo]/page.tsx` consume la nueva forma y se quitó el
  bloque "Contenido Clínico". El nombre del paciente se mantiene (sin él la verificación
  no cumple su función).
- **✅ RESUELTO (migración 025) — hardening de la función.** `verificar_documento` ahora
  fija `SET search_path = public`, y se **revocó `EXECUTE` de PUBLIC** dejándolo solo para
  `service_role` (el rol del admin client) y `postgres`.
- **✅ RESUELTO (2026-07-24) — enumeración de códigos.** `codigo_verificacion` = 12 chars hex de
  `md5(random())`. Se agregó rate limit **30/min por IP** en `/verificar/[codigo]`
  (`src/app/verificar/[codigo]/page.tsx`), que corta el scraping/enumeración sin fricción para el
  uso legítimo; al superarlo responde una tarjeta neutra que no revela si el código existe.

### Aislamiento por tenant a nivel base de datos
- **✅ RESUELTO para `estudios` (migración 026, 2026-07-22) — políticas de Storage por tenant.**
  El bucket `estudios` se creó **por migración** (privado, 10 MB, MIME pdf/jpeg/png/webp) con
  4 políticas RLS sobre `storage.objects` que **no** usan `auth.role() = 'authenticated'` a
  secas: aíslan por tenant comparando el primer segmento del path
  (`storage.foldername(name)[1]` = `medico_id`) contra `get_medico_id()`, atadas a
  `ver_historia_clinica` (el `DELETE` además exige rol médico). Además se **endurecieron las 4
  políticas de la tabla `estudios`** (antes cualquier asistente del tenant accedía; ahora
  exigen `check_permiso('ver_historia_clinica')`). Reconstruido en `schema.sql` → sección
  STORAGE.
- **✅ RESUELTO para `documentos` (migración 027, 2026-07-23) — políticas de Storage por tenant.**
  El bucket `documentos` (privado, 5 MB, solo `application/pdf`) se creó **por migración**, con 3
  políticas RLS sobre `storage.objects` aisladas por tenant (mismo patrón: `foldername(name)[1]`
  = `medico_id` contra `get_medico_id()`): select exige `ver_pedidos` OR `ver_certificados`;
  insert/update exigen `crear_pedidos` OR `crear_certificados`. **Sin política de DELETE a
  propósito** (regla 5: los documentos no se borran, solo se anulan) — difiere de `estudios`, que
  sí permite DELETE al médico. Reconstruido en `schema.sql` → sección STORAGE. **Pendiente
  todavía:** el bucket `difusion` **no existe**; cuando se agregue, versionar sus políticas con
  el mismo patrón.
- **RLS de tablas:** el modelo con `get_medico_id()` + `check_permiso()` está bien
  aplicado en las tablas de datos (ver `schema.sql`). Verificar dos huecos:
  - **Difusión** no tiene permiso granular: cualquier asistente vinculado ve/crea posts
    (`nav-items.ts` y RLS de `difusion_posts` no filtran por permiso). **Confirmado
    intencional** (decisión de producto, `CLAUDE.md` → nota técnica 14). El envío por email
    (2026-07-27) **hereda ese criterio**: `POST /api/difusion/enviar` valida solo pertenencia al
    tenant, sin chequeo de rol, así que cualquier asistente vinculado puede **enviar un
    comunicado a todos los pacientes**. Si alguna vez se restringe difusión con un permiso
    granular, este endpoint es uno de los lugares a atar.
  - Confirmar que `mensajes_internos` grupales no filtren datos entre asistentes de
    tenants distintos (RLS usa `medico_id = get_medico_id()`, correcto; validar en prueba).

### Autenticación, sesiones y registro
- **⚠ Auto-registro como médico (riesgo conocido, aceptado por ahora).** `handle_new_user`
  acepta `role` desde `raw_user_meta_data` con whitelist `('medico','asistente')`, y el form de
  registro ofrece elegir "médico" (`src/app/(auth)/actions.ts:93-96`). Cualquiera que llegue a
  `/registro` puede crearse como **médico** y abrir un tenant propio. **Solución prevista:** un
  **panel de administración con aprobación de altas de médicos**; hasta entonces se deja como
  está. **Severidad ALTO.** Ubicación del backend: `supabase/migrations/014_security_fixes.sql`
  (`handle_new_user`).
- **✅ RESUELTO (migración 031 + `src/lib/rate-limit.ts`, 2026-07-24) — rate limiter efectivo.**
  El rate limiter vivía en un `Map` en memoria del proceso: en Vercel serverless los contadores
  no se compartían entre instancias y **el login no tenía protección real de fuerza bruta**.
  Ahora el conteo persiste en `public.rate_limits` (RLS on sin políticas) vía la función atómica
  `check_rate_limit` (EXECUTE solo `service_role`), llamada con el admin client (el login ocurre
  sin sesión). **Fail-open** con timeout de 2s. Límites: login 5/min (IP+email), registro 3/min
  (IP), `/verificar/[codigo]` 30/min (IP); las rutas API conservan sus límites por `user.id`. La
  limpieza de ventanas viejas se sumó al cron de recordatorios. Migrar a Redis a futuro sería
  reescribir solo ese módulo (interfaz aislada). Ver `schema.sql` → sección RATE LIMITING.
- **✅ RESUELTO (2026-07-24) — H6: comparación del `CRON_SECRET` no timing-safe.**
  `api/cron/recordatorios/route.ts` comparaba el bearer con `!==` (fuga de timing). Ahora usa
  `crypto.timingSafeEqual` (helper `safeEqual` que iguala por longitud primero, sin lanzar).
- **✅ RESUELTO (2026-07-24) — H7: `getIp` caía a `'unknown'`.** El helper de IP mejoró la
  extracción (`x-forwarded-for` primer valor → `x-real-ip`, ambos con `trim()`). Cuando de verdad
  no hay ningún header (solo fuera de Vercel: dev local) se mantiene `'unknown'` a propósito
  —documentado en el código—: en Vercel `x-forwarded-for` siempre está y no es falsificable, y el
  login igual diferencia por email en la key. Se descartó fail-open-en-unknown (un atacante podría
  desactivar el límite borrando el header).
- **Sesiones/tokens:** sesión en cookies vía `@supabase/ssr`; `proxy.ts` valida con
  `getUser()` en cada request. Revisar expiración/refresh y flags de cookie
  (`HttpOnly`/`Secure`/`SameSite`) en el entorno productivo (los fija `@supabase/ssr`, no el
  repo; A VERIFICAR en producción, DevTools → Application → Cookies).

### Transporte, cabeceras y cifrado
- **⚠ Endurecer la CSP (diagnosticada, pendiente de su propia tanda).** En producción la CSP de
  `next.config.ts` sigue con `script-src 'unsafe-inline'`, que debilita la defensa anti-XSS. El
  diagnóstico (2026-07-24) dejó el plan concreto:
  - **`script-src`: removible con nonce.** La app **no tiene scripts inline propios** (verificado:
    cero `dangerouslySetInnerHTML`/`<script>`/`next/script`); los únicos inline son los de Next, que
    el nonce cubre. Se implementa en `proxy.ts` (el middleware de esta versión de Next; patrón
    verificado contra `node_modules/next/dist/docs/.../content-security-policy.md`).
  - **`style-src 'unsafe-inline'` es INEVITABLE con las librerías actuales.** Radix/shadcn, Recharts
    y FullCalendar (y el `Toaster` de Sonner) fijan **atributos `style=""` inline**, y **los nonces
    NO aplican a atributos `style`** (solo a elementos `<style>`/`<script>`). Sacarlo rompería el
    posicionamiento de popovers/dialogs y los gráficos.
  - **Costo del nonce:** fuerza **render dinámico** en toda la app (se pierden `/login` y `/registro`
    estáticas, ISR y PPR). Es un trabajo de varias iteraciones (report-only primero) que **no
    bloquea** recibir pacientes → se hará **después del bloque estético**, en tanda propia.
  - Aprovechar para sumar `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`,
    `upgrade-insecure-requests`.
- **Ya presentes:** HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy` y la CSP base (`next.config.ts`).
- **En reposo:** Supabase cifra el storage/DB en reposo por defecto — documentarlo como
  control existente. Datos sensibles guardados como **base64 en columnas** (`firma_url`,
  `logo_url`, y binarios de estudios) — revisar tamaño y exposición.
- **Logs:** ✅ verificado (diagnóstico 2026-07-24) que ni `SUPABASE_SERVICE_ROLE_KEY` ni datos de
  pacientes crudos se loguean (los `console.error` loguean el objeto error; el cron avisa "NO
  loguear datos personales" y solo loguea el `turno.id`). El admin client se usa en `/verificar`
  y en actualización de permisos, sin filtrar la key.
- **`/verificar/[codigo]` — enumeración de códigos:** ✅ mitigado con rate limit **30/min por IP**
  (2026-07-24). El código es de 12 hex; el límite corta el scraping sin fricción para el uso real.

### Comunicaciones a pacientes — consentimiento y baja (Ley 25.326)
- **⚠ Falta el opt-out de difusión. Bloqueante de go-live.** Desde 2026-07-27 la app **envía
  emails a los pacientes** (difusión por Resend), pero no registra el **consentimiento** para
  recibirlos ni ofrece un mecanismo de **baja**. Marcado como TODO en el pie de
  `src/lib/email/difusion-template.ts`. Detalle y alcance del trabajo en Bloque A → "Difusión —
  opt-out / consentimiento".

### Residencia de datos — transferencia internacional (Ley 25.326)
- **Migrar la región de Supabase antes de producción.** El proyecto está hoy en un
  servidor de **EE.UU. (North Virginia)**. La Ley 25.326 regula la **transferencia
  internacional** de datos personales: antes de cargar el **primer paciente real** hay que
  **migrar el proyecto a una región de protección adecuada (UE)** o resolver el
  **consentimiento expreso** del paciente para la transferencia. Aplica **antes de
  producción**; en desarrollo con datos de prueba no aplica. La migración de región requiere
  **plan Pro de Supabase**. Es un bloqueante de go-live, no un pulido opcional.

### Defensa en profundidad — borrado de documentos a nivel base
- **✅ RESUELTO (migración 025, 2026-07-22).** Se dropearon las políticas RLS
  `pedidos_delete` y `certificados_delete`. Sin política de `DELETE`, Postgres niega el
  borrado aunque alguien llegue por otra vía (service role o un cliente que reintroduzca la
  llamada). El borrado físico ya estaba quitado a nivel de aplicación; esto lo cierra a nivel
  base. `schema.sql` actualizado.

### RLS huérfanas en `consultas` (hallazgo de la auditoría)
- **✅ RESUELTO (migración 025, 2026-07-22).** La auditoría de la base real encontró dos
  políticas huérfanas (`medico_full_access`, `asistente_access`) que existían solo en la base
  (no en migraciones) y daban a **cualquier asistente vinculado** acceso `ALL` a las consultas
  del tenant, salteando `check_permiso()` (rompía la regla de negocio 1 a nivel base). Se
  dropearon ambas; quedan solo las correctas (`consultas_select/insert/update/delete`).

---

## Bloque C — Estético

Unificación visual y pulido de interfaz. Detalle y ubicaciones en `DESIGN.md`
(sección "⚠ Inconsistencias a unificar").

- **Colores fuera del sistema de tokens:** `/verificar/[codigo]` (y otras vistas) usan
  clases crudas `slate-*`, `emerald-*`, `red-*`, `amber-*` en lugar de los tokens
  semánticos OKLCH. **Agregar tokens `success` / `warning` / `info`** y migrar esos usos.
- **Radios hardcodeados** (`rounded-xl`, `rounded-2xl`) conviviendo con la escala de
  tokens (`--radius-*`) en `/onboarding` y `/verificar`. Unificar a la escala.
- **Fuente mono fantasma:** `--font-mono` → `--font-geist-mono` está referenciada en
  `globals.css` pero **no se carga** en ningún layout. Cargar la fuente o quitar el token.
- **`turnos.color` (HEX `#3B82F6`)** quedó en desuso frente a las clases `.categoria-*`
  del turnero; limpiar el default o reutilizarlo coherentemente.
- **Componentes stub sin usar** (los 12 del Bloque A) ensucian `components/ui` y demás
  carpetas; eliminarlos también mejora la prolijidad visual del árbol de UI.
- **Dark mode a medias:** hay un set completo de tokens `.dark` en `globals.css` pero la
  app no expone un toggle de tema. Decidir: implementar el toggle o retirar los tokens.
- **Contraste / accesibilidad:** verificar contraste de los tintes de categoría del
  turnero (10–12% de opacidad) y de `muted-foreground` sobre `muted`, sobre todo en la
  página pública de verificación.
- **Layout inconsistente entre secciones** (observado en el navegador). Las páginas del área
  autenticada no comparten un patrón único de encabezado ni de ancho:
  - **Correctas / de referencia:** dashboard, pacientes, turnero, pedidos y certificados —
    ocupan el espacio disponible y su título tiene el mismo tamaño.
  - **Difusión:** el título usa un **tamaño de fuente mayor** que el resto y muestra un
    **ícono de altavoz** que ninguna otra sección tiene.
  - **Notas:** consistente con el grupo de referencia.
  - **Notificaciones y mensajes:** se ven con **márgenes laterales**, más centradas/angostas
    que el resto.
  - **Criterio a definir y aplicar:** (a) o **todas** las secciones llevan ícono en el título
    —y coherente con el ícono del sidebar— o **ninguna**; (b) unificar **ancho, márgenes y
    tamaño del título** en todas. Conviene resolverlo con el componente compartido
    `shared/page-header` para que el patrón quede en un solo lugar.
