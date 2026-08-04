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
- **⚠ HUECO FUNCIONAL NUEVO (2026-08-03) — no hay forma de descartar/eliminar un BORRADOR de
  consulta.** Detectado al verificar la tanda L4; **preexistente**, no lo causó esa tanda (que fue
  solo tipado). Se puede **crear y guardar** un borrador, pero **no cancelarlo ni borrarlo**: un
  borrador equivocado, de prueba o incompleto **queda sin salida** en la HC del paciente.
  ⚠ **Requiere decisiones de producto y de seguridad ANTES de codear** — no es un fix menor:
  - **¿Borrado físico o lógico?** La regla de negocio 1 protege las consultas **finalizadas**, no los
    borradores; pero hay que decidir explícitamente si un borrador se borra de verdad o se archiva
    (criterio análogo al de pacientes, regla 9).
  - **¿Qué rol puede?** ¿Solo el médico, o también el asistente que lo creó (que puede crear
    borradores con `crear_consultas`, pero no finalizar)?
  - **⚠ Ley 25.326 — consultar con el médico.** Un borrador **puede contener datos clínicos del
    paciente** ya cargados. El tratamiento de esos datos al descartar (¿se eliminan?, ¿quedan en un
    log?, ¿se conserva rastro de que existió?) es una decisión que **corresponde al responsable de
    los datos**, no al criterio técnico.
  - Nota: `DELETE /api/consultas/[id]` **ya existe y solo permite borrar borradores** (rechaza
    `finalizada`), así que el backend está en gran parte; lo que falta es la decisión y la UI.
  **Tanda propia, con su diagnóstico.**
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
- **Badge de "Mensajes" del sidebar: no se actualiza en vivo. PREEXISTENTE y POR DISEÑO — no es un
  bug de regresión. Severidad BAJA.** Detectado al verificar la 1B-parte-1 (2026-07-31), pero es un
  límite del diseño original, no algo que se haya roto. El número sale de `MensajesContext`
  (`src/contexts/permisos-context.tsx:70-82`), que es un **pasamanos**: recibe `mensajesNoLeidos` ya
  calculado por `contarMensajesNoLeidos()` en el **Server Component** `(app)/layout.tsx` y lo expone
  con `useMensajes()` (`sidebar.tsx:27`). **No tiene suscripción Realtime propia** —en toda la app
  hay exactamente dos canales (`notificaciones-bell.tsx` y `layout-shell.tsx`, este último para
  permisos del asistente) y **ninguno lo alimenta**—, así que el valor solo cambia cuando ese layout
  se vuelve a ejecutar: **carga completa (F5) o `router.refresh()`**. Resolverlo requiere una
  decisión de producto: darle al contexto una fuente en vivo propia, o compartir estado con la
  campanita para que ambos badges deriven del mismo lugar. **Ítem de producto, no bug.** Nota: el
  badge de la campanita para mensajes **sí** tiene canal — que hoy no entregue es otro problema, el
  del ítem de Realtime en "Bugs menores detectados".
- **Tanda 1B — parte 2: ejecutada A MEDIAS (2026-08-02). El fix del badge SALIÓ; el Realtime quedó
  DIFERIDO.** El plan original era *"agregar `notificaciones` a la publicación `supabase_realtime` y
  suscribirla en la campanita, replicando el patrón de `mensajes_internos`, que ya funciona"*. Esa
  premisa cayó (el Realtime de mensajes no entrega), así que la tanda se reordenó y terminó
  entregando solo la mitad que no dependía del Realtime:
  - **✅ Hecho — el badge de la campanita ahora BAJA al leer** (ver el ítem resuelto en "Bugs menores
    detectados") y `marcarMensajeLeido` revalida las rutas que corresponden.
  - **⏸ Diferido — el canal en vivo.** El diagnóstico agotó todo lo que depende de nuestro código y
    de la base; la causa quedó acotada a **infraestructura del servicio Realtime** (ver el ítem
    "Realtime de `mensajes_internos` — DIFERIDO" más abajo).
  - **⛔ Bloqueado detrás de lo anterior — sumar `notificaciones` a la publicación.** Sigue
    pendiente y **sí requiere migración** (mismo patrón idempotente de
    `023_realtime_mensajes_internos.sql`), más la suscripción en `notificaciones-bell.tsx` junto a
    las dos que ya están. **No hacerlo hasta que el canal de mensajes entregue:** hoy solo
    agregaría una segunda suscripción muda.

  ⚠ **Se verifica con DOS sesiones abiertas (médico + asistente), no con que compile.** El Realtime
  no se prueba con `tsc`/`build`: hay que ver el badge subir sin recargar.

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
- **✅ RESUELTO (tanda 1A, 2026-07-30) — Dashboard: "próximos turnos" mostraba la hora en UTC.**
  El fix **no fue local a ese archivo**: se centralizó en un helper compartido,
  **`src/lib/utils/format-date.ts`** → `formatFechaAR(fecha, patron)`, que formatea con
  `formatInTimeZone` de **`date-fns-tz`** (dependencia nueva) fijando la zona
  `America/Argentina/Buenos_Aires`, expuesta como const **`TZ_AR`**. Se reutilizó el stub muerto
  que ya existía en esa ruta en vez de crear un archivo nuevo. Se aplicó a los **cuatro** sitios
  **server-side** que formateaban en la zona del runtime:
  `src/components/dashboard/next-appointments.tsx` (las 3 llamadas; se eliminó el `new Date()`
  intermedio y ahora el helper recibe el string ISO original), `src/app/api/turnero/route.ts:181`
  (**texto de la notificación** al médico: "…agendó un turno para X el …", que también salía
  corrido), `src/app/(app)/dashboard/page.tsx:27` (subtítulo con el día de hoy, que después de
  las 21:00 ART mostraba el día siguiente) y `src/components/dashboard/recent-patients.tsx:73`.
  Verificado con `TZ=UTC` sobre el caso borde que motivaba el hallazgo —un turno de
  `2026-07-30T01:30Z`—: ahora sale **mié 29, 22:30** en vez de jue 30, 01:30, así que el salto de
  día del turno nocturno queda cerrado. **Confirmado en producción.** ⚠ Los formateos
  **client-side** (turnero, `turno-form`) **no se tocaron**: renderizan en la zona del navegador y
  no tenían el bug. Regla de uso en `CLAUDE.md` → nota técnica 18.
- **⚠ PENDIENTE NUEVO (2026-07-30) — quedan dos helpers de fecha sin unificar contra
  `formatFechaAR`.** Surgió al hacer el fix de TZ; **no hay bug activo hoy**, pero conviene
  cerrarlo en la próxima tanda que toque fechas:
  - `formatFecha` / `formatFechaLarga` de **`src/lib/utils.ts`** tampoco fijan zona. Parchean el
    caso "fecha sin hora" concatenando `T12:00:00`, lo cual **funciona** para columnas `DATE`
    (fecha de nacimiento, `fecha_certificado`, `valido_hasta`) —que es lo único que hoy les
    pasan sus consumidores—, pero si alguna vez se les pasa un **`timestamptz` con hora**
    reaparece exactamente el bug del ítem anterior. Candidatas a reimplementarse sobre
    `formatFechaAR`.
  - **`src/app/verificar/[codigo]/page.tsx:12`** define un `formatFechaLarga` **local** que
    duplica el de `src/lib/utils.ts`. Candidato a deduplicar, **con cuidado**: es la página
    pública de verificación (datos sensibles, Ley 25.326) y el cambio merece su propia revisión.
- **✅ RESUELTO (tanda 1B — parte 1, 2026-07-31) — el badge de la campanita no contaba los avisos
  del sistema.**
  > ⚠ **La versión anterior de este ítem era INCORRECTA** y quedó refutada por el diagnóstico.
  > Decía que *"el número del badge no se muestra"* y apuntaba a un `count` llegando en 0, con el
  > guard de `notificaciones-bell.tsx:207-210` como sospechoso. **El count llegaba bien**, y tanto
  > el guard como las clases `h-4.5`/`w-4.5` estaban correctos.

  **El bug real era otro:** el contador hacía `count = solicitudes.length + mensajes.length` y
  **NUNCA leía la tabla `notificaciones`**. Por eso los avisos del sistema —turno agendado por un
  asistente, recordatorio enviado— **no incrementaban el número**, aunque sí aparecían en la página
  `/notificaciones`, que es la única que consultaba la tabla. **No era una regresión: la conexión
  nunca existió** — verificado en el historial, ningún commit la quitó, y el que unificó la
  campanita (`098dbc1`) de hecho **amplió** el count de solo solicitudes a solicitudes + mensajes.
  De yapa, la columna `notificaciones.leida` **jamás se escribía en `true`** en todo el repo.

  **Qué se hizo:**
  - **Fuente de verdad compartida y normalizada** en `src/app/(app)/notificaciones/actions.ts`:
    `leerNotificacionesSistema()` (privada, **único lugar del repo que lee la tabla**) y
    `leerSolicitudesNormalizadas()`, con dos wrappers por contexto —`obtenerItemsPagina()` para la
    página (solicitudes + avisos, **historial completo**) y `obtenerNotificacionesNoLeidas()` para
    el badge (solo lo **no leído**)—. Badge y página derivan del mismo shape, así que **un `tipo`
    nuevo de notificación entra una sola vez y lo ven los dos**: era el objetivo del fix, no solo
    tapar el número.
  - **Tipo de dominio nuevo:** `src/types/notificacion.ts` (`Notificacion`, `NotificacionTipo`,
    `ItemPendiente`, `ITEM_TYPE_SOLICITUD`), exportado desde el barrel. La tabla no tenía tipo TS.
  - **Tercer sumando en el badge:** `notificaciones-bell.tsx` suma los avisos no leídos, que viajan
    por la cadena de props ya existente (`(app)/layout.tsx` → `layout-shell` → `header` → bell).
    **Solo para el médico:** la RLS `notificaciones_select` es `medico_id = auth.uid()`, así que el
    asistente no lee esas filas y la consulta ni se dispara. ⚠ Esa prop **no siembra `useState`**, a
    propósito y a diferencia de solicitudes/mensajes (que el Realtime muta en el cliente): con
    estado local el badge **nunca bajaría**, porque `router.refresh()` no pisa el estado de un
    componente que no se remonta.
  - **Marcado de leído**, que no existía: `marcarNotificacionesLeidas()` pone `leida = true` al
    **entrar** a `/notificaciones`, disparado desde el Client Component
    `src/components/notificaciones/marcar-leidas.tsx`, más un botón **"Marcar todas como leídas"**.
    Va en un efecto y no en el render porque **`revalidatePath` no está soportado durante el
    render**; el listado de esa visita conserva sus puntos azules (los snapshotea
    `NotificacionesList` en su `useState`), así que el médico ve qué venía sin leer.
  - **`src/app/api/turnero/route.ts`:** el insert de la notificación **no chequeaba su error** —un
    fallo era completamente invisible—. Ahora se loguea sin datos personales del paciente (Ley
    25.326: solo el id del turno) y **el POST no falla** por eso, porque el turno ya se creó.
  - **Sin migración:** la columna `leida` y su política de UPDATE **ya existían** en la base.

  **Verificación:** `tsc` y `build` limpios; el lint bajó **75 → 73** (dos `no-explicit-any`
  desaparecieron solos al mover el mapeo inline de la página a la fuente tipada). Verificado a mano
  en la app: el badge cuenta el turno agendado por un asistente y baja al entrar a
  `/notificaciones`. **El Realtime quedó FUERA a propósito** (ver los dos ítems de Realtime de acá
  abajo y la 1B-parte-2 en "Funcionalidades incompletas").
- **✅ RESUELTO (tanda 1B — parte 2, 2026-08-02) — el badge de la campanita no BAJABA al leer un
  mensaje.** Segundo síntoma encontrado al diagnosticar el Realtime, e **independiente de él**: al
  abrir un mensaje el número no se descontaba hasta un F5. La causa era un **`useState` sembrado con
  una prop**: `mensajesIniciales` se usaba como valor inicial de estado local, así que el componente
  se quedaba **pegado al valor del montaje** — `router.refresh()` y `revalidatePath` recalculaban la
  prop en el servidor, pero nada pisaba el estado de un componente que no se remonta. Es el **mismo
  error de fondo** que la nota técnica 19 ya documentaba para los avisos del sistema.
  - **Fix (`src/components/layout/notificaciones-bell.tsx`):** se eliminó ese `useState`. La lista
    ahora se **deriva en cada render** de la prop del servidor (base) **mergeada con los mensajes
    que llegaron por Realtime y todavía no están en la prop**, deduplicados por id; un estado
    aparte, `mensajesAbiertos`, oculta al instante los que el usuario abre desde el panel. El estado
    local guarda **solo lo que el servidor todavía no sabe**, no una copia de lo que ya manda.
  - **`marcarMensajeLeido` (`(app)/notificaciones/actions.ts`):** revalidaba solo `/notificaciones`;
    ahora suma **`revalidatePath('/mensajes')`** y **`revalidatePath('/', 'layout')`** — el contador
    de los dos badges se calcula en `(app)/layout.tsx`, y los **grupos de rutas no agregan segmento
    a la URL**, así que ese layout solo se alcanza invalidando por la raíz (mismo criterio que
    `marcarNotificacionesLeidas`).
  - **Bug de base descubierto de paso:** el upsert en `mensajes_lecturas` usaba el default
    (`merge-duplicates` → `ON CONFLICT DO UPDATE`), y **`mensajes_lecturas` no tiene política de
    UPDATE** (solo `lecturas_select_own` / `lecturas_insert_own`), así que **marcar dos veces el
    mismo mensaje grupal fallaba**. Se pasó a **`ignoreDuplicates: true`**
    (`ON CONFLICT DO NOTHING`), que además es lo semánticamente correcto: la fila es solo la PK
    `(mensaje_id, user_id)`, no hay nada que actualizar. **Se resolvió sin tocar la base.**
  - **Limpieza:** se borró `src/components/notificaciones/mensaje-card.tsx` (145 líneas, **cero
    importadores**).
- **✅ RESUELTO (2026-08-03) — el clic en un mensaje de la campanita no abría el modal del hilo.**
  El clic cambiaba la URL a `/mensajes?hilo=X` pero el modal **solo aparecía tras F5**.
  **PREEXISTENTE:** nació con el deep-link en `098dbc1`, no lo introdujo el fix del badge — el
  `href` del `<Link>` y la ausencia de `router.push` son **byte-idénticos** antes y después de esa
  tanda. Lo que la tanda del badge sí hizo fue volverlo **más visible**, al revalidar `/mensajes` y
  hacer más frecuente el flujo "abro un hilo → cierro → clickeo otro".
  - **Causa:** `bandeja.tsx` derivaba el hilo abierto de un **inicializador perezoso de `useState`**,
    que corre **una sola vez al montar**. En una navegación en cliente `Bandeja` no se remonta, así
    que el prop nuevo llegaba pero el estado no se recalculaba. Fallaba siempre que el componente ya
    estuviera montado: estando en `/mensajes`, o con un `?hilo` viejo en la URL (cerrar el modal
    **no lo limpiaba**), o al clickear dos veces el mismo mensaje (URL idéntica → Next ni navega).
  - **Fix (Opción A — la URL como única fuente de verdad):** el hilo abierto se **deriva de
    `useSearchParams()` durante el render** (sin `useState` ni `useEffect`), que sí es reactivo a
    los cambios de URL sin remontaje. Abrir y cerrar **sincronizan la URL**, y cerrar **limpia el
    `?hilo`**. Se eliminó el prop `hiloInicial` de `mensajes/page.tsx` para no dejar una segunda
    fuente de verdad: mantenerlo como fallback **reabría el modal solo** al cerrarlo (la URL pierde
    el param al instante, la prop del servidor tarda un round-trip). El clic **dentro de la bandeja**
    se unificó al mismo mecanismo, así que hay **un solo camino** para abrir el modal.
  - Detalle del patrón y del porqué de la History API en `CLAUDE.md` → **nota técnica 20**.
- **⚠ PENDIENTE NUEVO (2026-08-02) — un mensaje individual quedó contado como NO LEÍDO de forma
  persistente. Severidad BAJA, es de APLICACIÓN (no infraestructura).** Primer síntoma detectado al
  diagnosticar la mensajería, y **el único de los tres que sigue abierto**. Una fila de mensaje
  individual **con `parent_id`** (o sea, una **respuesta** dentro de un hilo) quedó marcada como no
  leída y **sobrevive al F5**, así que no es un problema de estado en el cliente: la fila está
  realmente sin marcar en la base.
  - **Descartado:** que el marcado no recorra las respuestas. Se verificó que **sí** las recorre.
  - **Causa candidata — un error tragado en silencio.** `src/components/mensajes/hilo-modal.tsx`
    marca leído con `await Promise.all(noLeidos.map((m) => marcarMensajeLeido(m.id)))` y
    **descarta el `{ error }` que devuelve cada llamada**. Si una falla (RLS, carrera, red), el
    usuario **no se entera** y la fila queda sin marcar para siempre. Encaja con el síntoma: falla
    puntual, persistente, sin rastro.
  - **Primer paso cuando se retome:** **dejar de tragar esos errores** — juntar los resultados,
    loguear/avisar los que fallaron (sin datos personales, Ley 25.326) y recién ahí decidir si hace
    falta un reintento. Barato y previo a cualquier teoría.
  - Nota: el upsert de **grupales** ya se arregló (ver el `ignoreDuplicates` del ítem del badge);
    este síntoma es de mensajes **individuales**, que van por el `UPDATE leido = true` — camino
    distinto, que sí tiene política.
- **⚠ LIMITACIÓN CONOCIDA (2026-08-03) — el deep-link no abre hilos fuera de las 100 conversaciones
  más recientes. Severidad MUY BAJA.** `obtenerBandeja()` trae los mensajes raíz con **`.limit(100)`**
  (`src/app/(app)/mensajes/actions.ts:46`), y `bandeja.tsx` resuelve el `?hilo=X` buscando **dentro
  de esa lista**. Si el hilo no está, el modal **simplemente no abre** — no crashea ni rompe la
  página. **Se decidió no implementar un fetch puntual:** pedía una server action nueva, estado
  async, spinner y manejo de "no existe / sin permiso", demasiada superficie para un caso hoy casi
  inalcanzable desde la campanita, que solo lista mensajes **no leídos** (recientes por definición).
  Si algún día se agrega búsqueda de mensajes o el volumen crece, revisarlo junto con paginar la
  bandeja.
- **⚠ PENDIENTE NUEVO (2026-08-03) — el LOGO del emisor no se renderiza en los previews de pedido ni
  de certificado. La firma sí. PREEXISTENTE.** Detectado al verificar visualmente la tanda L3a; **no
  lo causó L3a**, que solo agregó comentarios de ESLint (diff de 6 inserciones, 0 borrados). El logo
  se sube bien y **se ve en `/perfil`** después de guardarlo.
  - **Descartado: no es el `<img>`.** La **firma se muestra en el mismo preview y en el mismo
    componente**, así que el elemento y su estilo funcionan.
  - **La ruta de datos es SIMÉTRICA entre logo y firma** —verificado en el código—, lo que hace poco
    probable un bug de render: `lib/pdf/documentos.ts:91` **selecciona los dos**
    (`'… firma_url, logo_url'`) y `:106-107` **guarda los dos** en el snapshot; las páginas de detalle
    los leen igual (`pedidos/[id]/page.tsx:75-76` y `certificados/[id]/page.tsx:74`:
    `medicoFirma={emisor?.firma_url ?? null}` / `medicoLogo={emisor?.logo_url ?? null}`).
  - **⚠ PRIMERA HIPÓTESIS A DESCARTAR, y quizá NO sea un bug: la regla de negocio 11.** El
    `emisor_snapshot` se **congela al emitir**. Un documento emitido **antes** de que se subiera el
    logo tiene legítimamente `logo_url: null` en su snapshot, y **debe** mostrarse sin logo — eso es
    el congelado funcionando, no una falla. Que el logo **se vea en `/perfil`** solo prueba que
    `profiles.logo_url` lo tiene **hoy**, no que el snapshot de **ese** documento lo tuviera al
    emitirse. Y encaja con que la firma sí aparezca: se habría subido **antes** de emitir.
  - **Primer paso (barato y decisivo):** consultar el `emisor_snapshot` del documento concreto que se
    está mirando. Si `logo_url` es **null** → no hay bug, y para verlo hay que **emitir un documento
    nuevo** con el logo ya cargado. Si `logo_url` **tiene valor** y aun así no se pinta → ahí sí es un
    bug de render y hay que revisar la condición en `pedido-pdf.tsx` / `certificado-pdf.tsx`.
- **⏸ DIFERIDO (2026-08-02) — el Realtime de `mensajes_internos` no entrega eventos en vivo. Causa
  acotada a INFRAESTRUCTURA de Supabase, fuera de nuestro código.** Detectado el 2026-07-31 al
  verificar a mano la 1B-parte-1 (**preexistente**, no lo causó esa tanda): con **dos sesiones**
  abiertas, un mensaje nuevo **no** incrementa el badge de la campanita hasta hacer **F5**. Se
  diagnosticó a fondo y se difirió: todo lo que está bajo nuestro control quedó descartado **por
  experimento**, no por deducción.

  > Este ítem **consolida y reemplaza** el archivo suelto `NOTA-realtime-pendiente.md`, que se
  > borró al cerrar la tanda. Este es el único lugar donde vive el estado del diagnóstico.

  **Descartado POR EXPERIMENTO (cada punto se probó, no se dedujo):**
  - **Suscripción del canal:** el `subscribe` llega a **`SUBSCRIBED`**. El transporte funciona.
  - **Autenticación del socket:** el frame `phx_join` viaja con un **JWT válido**
    (`role=authenticated`, `sub` correcto). Descarta la hipótesis del timing de `setAuth`.
  - **Suscripción aceptada por el servidor:** `phx_reply` con `status: ok` y un id asignado a
    `mensajes_internos`.
  - **Publicación:** `mensajes_internos` está en `supabase_realtime` con `pubinsert = true`
    (migración 023, verificado en `pg_publication_tables`). Desactivar y reactivar el toggle de
    replicación en el dashboard **no tuvo efecto**.
  - **REPLICA IDENTITY:** la **migración 032** (`REPLICA IDENTITY FULL`) se aplicó y la base quedó
    en `relreplident = 'f'`. **Su hipótesis quedó REFUTADA:** era la explicación más prometedora
    —el canal filtra por `medico_id`, que no es la PK— pero con FULL aplicado **el evento sigue sin
    llegar**. La migración se conserva igual (ver más abajo).
  - **RLS:** probada con una policy **permisiva `USING(true)`** → el evento **igual no llega**. No
    es la policy.
  - **GRANTs:** idénticos a los de `pacientes`, que es la tabla de referencia sana.
  - **Persistencia:** la tabla **no** es UNLOGGED (`relpersistence = 'p'`), así que sí genera WAL.
  - **El INSERT:** es estándar —cliente normal (anon + cookies, **no** service_role), `.insert()`
    directo por PostgREST, todos los campos seteados—, el mismo camino de escritura que el insert
    de `notificaciones` del turnero.
  - **El frontend:** descartado con instrumentación. El log estaba en la **primera línea** del
    handler y nunca apareció; en el **WebSocket crudo** solo se ven heartbeats, **ningún frame** del
    mensaje. El evento no llega al cliente en absoluto — no es que llegue y se descarte.

  **Conclusión:** agotados publicación, replica identity, RLS, GRANTs, persistencia, forma del
  INSERT y cliente, lo que queda es el **servicio Realtime del proyecto** (replication slot, salud
  del servicio, o un problema del lado de Supabase). **Fuera del alcance del repo.**

  **Próximo paso cuando se retome, en este orden:**
  1. **Logs del servicio Realtime** en el dashboard de Supabase (Logs → Realtime): ver si el
     servicio registra siquiera el cambio.
  2. Estado del **replication slot** y salud del servicio Realtime del proyecto.
  3. Si todo lo anterior está sano: **ticket a soporte de Supabase** — es el destino más probable.

  **Estado del código y de la base:**
  - La **instrumentación `[RT avisos]` fue REMOVIDA** al diferir (el canal volvió a
    `channel.subscribe()` sin callback, como antes de instrumentar). **Al retomar hay que
    reinstrumentar:** callback de estado en el `subscribe` y logs de evento recibido en los
    handlers de `mensajes_internos` y `solicitudes_asistente`.
  - **La migración 032 NO se revierte** aunque su hipótesis haya fallado: deja la tabla en el estado
    que el filtro por `medico_id` necesita para cuando el servicio vuelva a entregar. Ver
    `schema.sql` → sección REALTIME.
  - El **filtro por tenant** del canal (`medico_id=eq.${tenantId}`) quedó **activo**: el filtro de
    prueba que se usó para diagnosticar fue revertido.
  - ⚠ **Se verifica con DOS sesiones y a mano.** No se prueba con `tsc`/`build`.

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
- **✅ RESUELTO (tanda 1A, 2026-07-30) — Migración vacía eliminada.**
  `supabase/migrations/20260326204733_fix_rls_recursion.sql` (**0 bytes**) se **borró del
  historial**. Era un no-op: se creó con `supabase migration new` (es la única con nombre en
  formato timestamp del CLI) y nunca se completó; su intención —recursión RLS en `profiles`— ya
  está cubierta por la `014` + `019`/`021`. Borrar un archivo vacío **no puede alterar el
  esquema**: no se ejecutó nada contra la base ni se tocó ninguna otra migración. El único efecto
  posible es cosmético —si en su momento se aplicó con el CLI, quedaría una fila huérfana en
  `supabase_migrations.schema_migrations` que `supabase migration repair` limpia—, irrelevante
  mientras la secuencia siga sin ser ejecutable desde cero (ver el ítem de baseline arriba). El
  directorio queda solo con las migraciones numeradas `001` → `031`.

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
- **✅ RESUELTO (tanda 1A, 2026-07-30) — los 2 utils stub que habían sobrevivido a esa limpieza.**
  La tanda de reproducibilidad barrió componentes y hooks, pero **no** `src/lib/utils/`, donde
  quedaban dos archivos con `export {};` y **cero consumidores**:
  `src/lib/utils/calcular-imc.ts` se **borró** (el IMC ya se calcula inline en
  `consulta-detail.tsx:252-257`) y `src/lib/utils/format-date.ts` se **reutilizó** como casa del
  helper `formatFechaAR` (ver el fix de zona horaria en "Bugs menores detectados").
- **Queda 1 stub, a propósito:** `src/lib/pdf/receta-template.tsx`. Se **mantuvo** como
  marcador del template de recetas, bloqueado por ANMAT pero a implementar cuando se
  certifique. Eliminarlo o implementarlo cuando se desbloquee la funcionalidad.
- **✅ RESUELTO (tanda 1A, 2026-07-30) — `src/app/page.tsx` era la plantilla de
  `create-next-app`.** Se reemplazó el "Get started by editing…" (logo de Next, enlaces a
  `vercel.com`/`nextjs.org`) por un Server Component mínimo que hace `redirect('/dashboard')` con
  `redirect` de `next/navigation`, siguiendo el patrón ya establecido en `onboarding/page.tsx` y
  `(app)/layout.tsx`; el guard de `src/proxy.ts` y el de `(app)/layout.tsx` resuelven el resto
  (con sesión → dashboard, sin sesión → login). Se borraron además los **5 SVG** de la plantilla
  que quedaban huérfanos —`public/{next,vercel,file,globe,window}.svg`—: los tres últimos ya no
  tenían **ninguna** referencia y los dos primeros los usaba solo la página reemplazada, así que
  `public/` quedó vacío (el favicon vive en `src/app/favicon.ico`, no ahí). Nota: `/` sigue
  figurando como **ruta estática** en el build —Next materializa el redirect en build time—, pero
  en la práctica el middleware intercepta antes.
- **✅ DECISIÓN TOMADA (2026-07-30) — Recharts SE CONSERVA. No proponer desinstalarla.**
  `package.json:39` (`"recharts": "^3.8.1"`) hoy tiene **cero** imports en `src/` —su único
  consumidor era `pacientes/evolucion-charts.tsx`, uno de los 11 stubs eliminados en la tanda de
  reproducibilidad—, pero eso es un **hecho, no un problema a resolver**: queda **reservada a
  propósito** para los **gráficos de evolución de la historia clínica**, previstos para una
  versión futura (**v1.2 / 2.0**, junto con recetas cuando se destrabe ANMAT). Los tokens
  `--chart-1…5` de `globals.css` ya están definidos para eso (ver `DESIGN.md` → Charts).
  ⚠ **No reabrir la decisión en futuras tandas de limpieza:** aparece como dependencia sin usar en
  cualquier barrido de código muerto, y la respuesta ya está tomada.
  ⚠ **Advertencia técnica que sigue vigente para la CSP:** cuando esos gráficos se implementen,
  Recharts fija atributos `style=""` **inline**, así que **cementa `style-src 'unsafe-inline'`**
  (ver Bloque B → CSP). Hoy esa directiva ya es irreductible por Radix/Sonner/FullCalendar
  (`CLAUDE.md` → nota técnica 17), pero tenerlo presente antes de tocar la CSP de estilos.

### Lint preexistente (deuda técnica — amerita tanda propia)

> ⚠ **Corrección (2026-07-30):** la versión anterior de este ítem decía que el lint preexistente
> se reducía a **dos archivos** (`consulta-detail.tsx` y `consulta-template.tsx`) y atribuía un
> `@typescript-eslint/no-explicit-any` a `src/lib/pdf/consulta-template.tsx`. **Ambas cosas eran
> falsas** y quedaron verificadas en el diagnóstico de la tanda 1A: el lint del proyecto tenía
> **96 problemas en 34 archivos**, y `consulta-template.tsx` **no tiene ni un `any`** (sus únicos
> problemas eran los warnings de alt-text, ya resueltos). No es un ítem menor de dos archivos:
> es una **tanda dedicada**.

- **✅ RESUELTO PARCIALMENTE (tanda 1A, 2026-07-30) — 96 → 75 problemas (−21).** Se limpió solo
  lo acotado y seguro, sin tocar el resto:
  - **8 `jsx-a11y/alt-text`** en los tres templates PDF (`consulta-template.tsx:255,280`,
    `certificado-template.tsx:352,448,459`, `pedido-template.tsx:313,402,413`) eran **falsos
    positivos**: ese `<Image>` es de **`@react-pdf/renderer`**, no `next/image` ni un `<img>` del
    DOM —renderiza a un PDF, que no tiene árbol de accesibilidad HTML— y sus `ImageProps` **no
    incluyen `alt`**, así que agregarla rompería `tsc`. Se resolvió con un **override acotado** en
    `eslint.config.mjs` que apaga la regla **solo para `src/lib/pdf/**`** (no globalmente),
    con el porqué comentado en el propio archivo. **No agregar `alt` a esos `<Image>`.**
  - **12 `no-unused-vars`** (imports y variables muertas de un renglón) en `login/page.tsx`,
    `verificar/[codigo]/page.tsx`, `certificado-pdf.tsx`, `perfil-form.tsx`, `signature-pad.tsx`,
    `bandeja.tsx`, `hilo-modal.tsx`, `turno.schema.ts`, `calendar-view.tsx` y `turno-form.tsx`.
  - **1 `no-explicit-any`**: el `catch (err: any)` de `consulta-detail.tsx:325` pasó a
    `catch (err)` con narrowing por `instanceof Error`.
  - `tsc`, `build` y `lint` pasan, y la comparación programática antes/después confirma **cero
    problemas nuevos** introducidos.
- **✅ RESUELTO (tanda L1, 2026-08-03) — 73 → 54 problemas (−19). Los `catch (error: any)` de los
  Route Handlers.** Primera tanda del plan por niveles de riesgo: **solo lo mecánico y sin efecto
  observable**. Se convirtieron los **17** `catch` con `any` bajo `src/app/api/**`, en dos patrones:
  - **15 → `catch (error)`** (solo la firma; el cuerpo quedó **intacto**). **Sin `instanceof Error`
    ni narrowing:** los 15 pasan la variable entera a `console.error(...)`, que acepta `unknown` sin
    quejarse. Agregar narrowing habría sido ruido — el diagnóstico verificó que **ninguno** de los 17
    lee `.message`, `.code` ni `.status`.
  - **2 → `catch {`** (optional catch binding), en `api/consultas/[id]/route.ts` `:57` y `:237`, los
    únicos que **no usaban** la variable. Esos dos disparaban **dos reglas en la misma línea**, así
    que el binding opcional se llevó también **2 `no-unused-vars`**. Patrón ya vigente en el repo
    (`hooks/use-view-mode.ts`, `(app)/notificaciones/actions.ts`), no es sintaxis nueva.
  - **Impacto: −17 `no-explicit-any` y −2 `no-unused-vars`.** `tsc` y `build` limpios; la comparación
    programática antes/después del linter confirma **cero problemas nuevos**. El diff es de **17
    inserciones y 17 borrados** (una línea por `catch`): **no se tocó ningún cuerpo, ningún mensaje
    al cliente ni ningún status HTTP**, así que el cambio no puede alterar ninguna respuesta de la API.
- **✅ RESUELTO (tanda L2, 2026-08-03) — 54 → 38 problemas (−16). Los `any` del turnero.** Segunda
  tanda del plan: **solo tipado, sin una línea de lógica**. Se tiparon los **16** `any` de
  `calendar-view.tsx`, `turno-form.tsx` y `block-slot-modal.tsx`, en dos grupos:
  - **(A) 9 `any` de handlers de FullCalendar**, todos en `calendar-view.tsx`: `EventApi` (los dos
    componentes de `eventContent`), `DateSelectArg`, `EventClickArg`, `EventDropArg`, y
    `EventSourceFuncArg` + `EventInput` para los 3 parámetros de `fetchEvents` — todos de
    **`@fullcalendar/core`** —, más **`EventResizeDoneArg`**, que ⚠ **NO está en `core`**: se importa
    de **`@fullcalendar/interaction`**. ⚠ **No** se tipó `fetchEvents` como `EventSourceFunc`: es un
    **union type** (estilo callback **o** estilo promesa) y resolverlo a través de `useCallback` es
    frágil —si TypeScript elige el miembro equivocado, los tres parámetros quedan mal—, así que se
    tiparon los parámetros **individualmente**.
  - **(B) 7 `catch (…: any)` que leen `.message`**, en los tres archivos → `catch (error)` con
    `error instanceof Error ? error.message : 'Error inesperado'`. **Los títulos de los toasts se
    preservaron byte a byte**, y `revert()` / `failureCallback()` quedaron intactos. En
    `calendar-view.tsx:214` se calculó **un solo `Error`** reutilizado para el toast y para el
    `failureCallback`, cuya firma exige `Error` y no acepta `unknown`.
  - **El narrowing de (B) es seguro, y eso se verificó, no se supuso:** los 7 errores del turnero son
    **`new Error(...)` construidos en la app** a partir de respuestas `fetch` — el turnero **no usa
    supabase-js en el cliente**—, así que `instanceof Error` da `true` en todos los caminos y el
    usuario ve el mismo mensaje que antes. (La advertencia de `PostgrestError` **no aplicaba acá**;
    su destino correcto es L3 — ver el plan de tandas.)
  - **Impacto: −16 `no-explicit-any`.** `tsc` y `build` limpios —`tsc` es la verificación de fondo:
    prueba que los tipos calzan con lo que la librería realmente pasa y valida de paso los accesos
    de los handlers (`dropInfo.oldEvent.allDay`, `selectInfo.view.calendar.unselect()`, etc.)— y la
    comparación programática del linter confirma **cero problemas nuevos**.
  - **Verificado en el navegador** (no alcanzaba con compilar): camino feliz del turnero —crear,
    mover, redimensionar, click en evento, cambio de vista— y **camino de error forzando la red
    offline**, donde los 7 toasts muestran su descripción y los eventos revierten. **Sin cambios de
    comportamiento.**
- **✅ RESUELTO (sección L3, 2026-08-03) — 38 → 24 problemas (−14). Tres sub-tandas separadas por
  riesgo.** El diagnóstico mostró que L3 **no era una tanda**: eran cuatro grupos que habían quedado
  juntos por descarte, con riesgos y verificaciones distintas. Se ejecutaron **tres**, en orden de
  menor a mayor riesgo, y el cuarto salió a una tanda propia (ver el plan).
  - **L3a — los 6 `@next/next/no-img-element` (−6, eran warnings).** Se silenciaron con
    `eslint-disable-next-line` **justificado uno por uno**, siguiendo el precedente de
    `estudios-list.tsx:250`. **Ninguno se migró a `next/image`** porque los 6 `src` son
    **data-URI/base64** —logo y firma del emisor desde `emisor_snapshot`, preview de
    `readAsDataURL` en `/perfil`, y el QR de `QRCode.toDataURL()`— y `next/image` **no puede
    optimizar un data-URI**: solo agregaría `width`/`height` obligatorios a cambio de nada. Archivos:
    `certificado-pdf.tsx`, `pedido-pdf.tsx`, `perfil-form.tsx`, `qr-verificacion.tsx`. **Diff de 6
    inserciones y 0 borrados: solo comentarios, cero cambio de runtime.**
    ⚠ **Dos formas de comentario, y no es cosmético:** `//` en los 3 que son la única expresión dentro
    del consequent de un ternario (ahí los paréntesis contienen una **expresión JS**, y un `{/* */}`
    metería un segundo elemento adyacente → error de sintaxis) y `{/* */}` en los 3 que son hijos de
    un `<div>`. Verificar el contexto JSX **antes** de escribir el disable.
    ⚠ **Aclaración de nombres:** `pedido-pdf.tsx` y `certificado-pdf.tsx` viven en `src/components/`
    y son **preview HTML en el navegador**, NO plantillas de `@react-pdf/renderer` (esas están en
    `src/lib/pdf/` y usan `<Image>`, cubiertas por el override de `jsx-a11y/alt-text`).
  - **L3b — dos cambios chicos e independientes (−1 `any`, −1 `no-unused-vars`).**
    1. **El `as any` de `perfil/actions.ts:43` era un cast REDUNDANTE**, no el choque clásico de
       `Array.includes` con una unión ancha: `TIPOS_VALIDOS` es `as const` (elemento
       `'MP'|'MN'|'ME'`) y `m.tipo` es `MatriculaTipo`, **la misma unión**, porque el parámetro está
       tipado `matriculas?: Matricula[]`. Por eso se **borró** el cast en vez de reemplazarlo por
       `(TIPOS_VALIDOS as readonly string[])`, que habría **agregado** una aserción donde no hace
       falta. **La validación en runtime se conserva**: es un Server Action y sus argumentos vienen
       del cliente sin validar, así que ese `if` es defensa real aunque a nivel de tipos parezca
       redundante.
    2. **`ignoreRestSiblings: true`** para `@typescript-eslint/no-unused-vars` en
       `eslint.config.mjs`, que elimina el warning de `_pid`
       (`const { paciente_id: _pid, ...updates } = result.data`, `consultas/[id]/route.ts:111`).
       Se verificó antes que `eslint-config-next` declara la regla como **`'warn'` SIN opciones**
       (`dist/typescript.js:36`) y que la regla **mergea opciones parciales sobre sus defaults**, así
       que pasar solo ese flag **replica la severidad y no pisa** `args`/`caughtErrors`/`vars`. **El
       único delta del linter es que `_pid` deja de reportarse.** Se dejó afuera
       `varsIgnorePattern`/`argsIgnorePattern` a propósito (ver la decisión de política, más abajo).
  - **L3c — los 6 `catch (err: any)` de `perfil/actions.ts` (−6 `any`).** Pasaron a `catch (err)`
    (`unknown`) leyendo el mensaje con un helper module-local **`mensajeDeError(e: unknown)`** que
    hace **duck-typing sobre `.message`**. Se preservaron los 6 fallbacks y los 6 `console.error`
    exactos; el archivo quedó **sin ningún `any`**.

    > ⚠ **POR QUÉ duck-typing y NO `instanceof Error` — no revertir esto.** Cada `try` termina en
    > `if (error) throw error`, con el `error` del destructuring de supabase-js **sin
    > `.throwOnError()`**. En ese camino la librería hace **`error = JSON.parse(body)`**
    > (`postgrest-js/src/PostgrestBuilder.ts:203`): un **objeto plano**. El `new PostgrestError(...)`
    > —que sí extiende `Error`— **solo se construye con `.throwOnError()`** (`:225`). O sea: **el
    > tipo declarado dice `Error` pero el runtime no lo es**, así que un `err instanceof Error`
    > **compila sin una queja y falla en silencio en producción**, mandando todo error de base al
    > mensaje genérico. **`tsc` NO puede detectarlo.** El comentario del helper documenta esto en el
    > código, justamente para que un futuro "cleanup" no lo simplifique.
  - **Impacto y verificación.** `tsc`, `build` y `lint` limpios en las tres, con **cero problemas
    nuevos** confirmado por comparación programática del linter en cada una. **L3a** verificada
    visualmente (las imágenes siguen mostrándose). **L3b** solo `tsc`+`lint` — no toca runtime.
    **L3c** con el camino feliz de `/perfil` probado a mano: editar perfil, subir firma y logo, y
    listar / cambiar permisos / desvincular asistentes. **Queda una verificación pendiente** — ver
    el ítem que sigue.
- **⚠ VERIFICACIÓN PENDIENTE de L3c — confirmar en runtime que un error de BASE muestra el mensaje
  detallado.** No se pudo forzar en local por no tener identificada una constraint fácil de chocar.
  ⚠ **Cortar la red NO sirve para esto:** un `fetch` fallido lanza un `TypeError`, que **sí** es
  instancia de `Error` y entra por la primera rama del helper. Hay que provocar un error **de la
  base** —violación de constraint o denegación de RLS, o sea que PostgREST responda no-ok con cuerpo
  JSON— y confirmar que en pantalla aparece **el mensaje concreto** y no el genérico
  (`'Error al actualizar permisos del asistente.'`, etc.). **Ver el fallback genérico donde antes
  salía el detalle es exactamente el síntoma de un narrowing roto**, y es silencioso: sin crash ni
  error en consola. El análisis caso por caso indica comportamiento idéntico al previo, pero **es
  razonamiento, no evidencia de runtime**. Ideal verificarlo en el deploy.
- **✅ RESUELTO (tanda L4, 2026-08-03) — 24 → 21 problemas (−3). El nudo del `zodResolver`.** Última
  pieza de lint puro, aislada desde el principio por su final incierto. **Tres cambios entrelazados,
  todos en `consulta-detail.tsx`; el diagnóstico previo con sondas de tipos midió que el fix era
  contenido y así resultó** — no se ramificó fuera del archivo.
  - **El `as any` del resolver → tres genéricos.**
    `useForm<ConsultaFormInput>({ resolver: zodResolver(consultaSchema) as any })` pasó a
    **`useForm<ConsultaFormInput, unknown, ConsultaFormData>({ resolver: zodResolver(consultaSchema) })`**.
    El cast era un **resabio**: compila sin él. Los tres genéricos **documentan en el tipo** que
    **entra `z.input` y sale `z.output`**, y de paso **revivieron `ConsultaFormData`**, que era un
    export sin ningún consumidor.
  - **El `mode` sin usar.** Se eliminó **solo el binding** del destructuring de `ConsultaForm`
    (distingue alta/edición por `consulta ? … : …`). Se conservaron el `Pick<…>` y el `mode={mode}`
    del padre `ConsultaDetail`, que **sí** lo usa para decidir la vista de solo lectura.
  - **`numericProps(field: any)` → tipado real.** Pasó a
    `field: ControllerRenderProps<ConsultaFormInput, FieldPath<ConsultaFormInput>>`, con la
    conversión explícita **`value: field.value == null ? '' : String(field.value)`** (el `== null`
    va **primero** para que un `null` no termine como la cadena `"null"`). **Calzó limpio en los 12
    sitios de llamada, sin necesidad de `eslint-disable`** — la red de seguridad prevista no hizo falta.

  > ⚠ **Razonamiento de tipos documentado en el código — no revertirlo.** Los tres genéricos no son
  > adorno: `z.input` y `z.output` **difieren de verdad**, por el `.transform()` (`'' → null`) y
  > porque **`z.coerce.number()` deja el input de los 12 campos numéricos en `unknown`**. De ahí que
  > `field.value` sea `unknown` y necesite conversión explícita: **ese `unknown` viene del SCHEMA, no
  > del componente**, así que no se arregla tocando `consulta-detail.tsx`. Ambos puntos quedaron
  > comentados en el propio archivo.
  - **Impacto: −2 `no-explicit-any` y −1 `no-unused-vars`.** `tsc` y `build` limpios —y acá **`tsc`
    SÍ cubre la tanda de punta a punta**, a diferencia de L3c: es tipado puro y si los genéricos o la
    conversión quedaran mal, falla en compilación—. Comparación programática del linter: **cero
    problemas nuevos**. **`consulta-detail.tsx` desapareció por completo del lint.**
  - **Verificado en la app:** crear consulta, los campos numéricos aceptan input, el **IMC se
    calcula** en vivo y **guardar borrador** funciona. (Las consultas ya finalizadas no se editan:
    es la regla de negocio 1, no un efecto de L4.) La única diferencia observable posible era el
    `String()` en los inputs numéricos, que **React renderiza idéntico**.
- **🏁 HITO — con L4 se terminó el LINT PURO / MECÁNICO.** Recorrido completo del bloque:

  | Tanda | Qué atacó | Conteo |
  |---|---|---|
  | *(partida)* | deuda heredada tras la tanda 1A | **73** |
  | **L1** | los 17 `catch (error: any)` de Route Handlers | 73 → **54** |
  | **L2** | tipos de FullCalendar + los 7 `catch` con `.message` del turnero | 54 → **38** |
  | **L3** (a+b+c) | `no-img-element`, config de ESLint, los 6 `catch` de `perfil/actions.ts` | 38 → **24** |
  | **L4** | el nudo del `zodResolver` en `consulta-detail.tsx` | 24 → **21** |

  ⚠ **Los 21 restantes NO son deuda de lint mecánica.** No queda ni un `catch` con `any` en el repo,
  ni un `any` de FullCalendar, ni un `no-img-element`, ni un `no-unused-vars`. Lo que sobra es
  **trabajo de otra naturaleza** —crear tipos de dominio, refactorizar efectos— y **ya está asignado
  a tandas con nombre propio** (ver el plan). **No abordarlos como "limpieza de lint"**: ese fue
  exactamente el criterio con el que se los fue apartando tanda tras tanda.
- **Deuda que QUEDA: 21 problemas preexistentes** (21 errores, **0 warnings** — primera vez en la
  serie sin ningún warning; medido 2026-08-03 tras L4). Desglose por regla:
  - **19 `@typescript-eslint/no-explicit-any`** — ya **no queda ningún `catch` con `any` en todo el
    repo**, ni ningún `any` de FullCalendar, y **`perfil/actions.ts` y `consulta-detail.tsx` quedaron
    limpios**. Lo que resta es **diseño de tipos, no anotaciones**: el **grupo (C) de datos de dominio
    del turnero** (7: `calendar-view.tsx` 4, `turno-form.tsx` 2, `block-slot-modal.tsx` 1 — ver
    abajo), los **4 de Route Handlers que NO son de `catch`** (ver abajo), y **8 sueltos**:
    `pedido-form.tsx` (2), `historia-clinica-form.tsx` (2), `perfil-form.tsx`,
    `notificaciones/list.tsx`, `verificar/[codigo]/page.tsx` y `perfil/page.tsx` (1 cada uno).
  - **0 `@typescript-eslint/no-unused-vars`** — el `mode` se cerró en L4 y el `_pid` en L3b.
  - **0 `@next/next/no-img-element`** — cerrados en L3a.
  - **2 `react-hooks/set-state-in-effect`** — **`calendar-view.tsx:46`** (línea corrida por los
    imports que sumó L2; era `:37`) y `onboarding-client.tsx:44`. ⚠ **Son dos problemas distintos, no
    un lote:** el primero está en el hook `useIsMobile` y **no es derivable en render** (`matchMedia`
    no existe en SSR, derivarlo rompería la hidratación); su fix canónico es `useSyncExternalStore`,
    o sea un **refactor**, y **cambia comportamiento observable** porque `isMobile` alimenta el efecto
    que hace `changeView` a vista día en móvil. El segundo es un reset de estado enredado con la
    lógica del debounce de búsqueda. Tratarlos por separado.
  - Ninguno **bloquea el build**.
- **⚠ Dentro de los Route Handlers quedan 4 `any` que NO son de `catch`.** Quedaron **deliberadamente
  afuera** de L1: son **diseño de tipos, no limpieza mecánica**, así que L1 **no dejó esos archivos
  en cero** y eso es esperado, no un fix a medias.
  - `api/consultas/[id]/route.ts:22` y `api/consultas/route.ts:25` — `(profile as any)[permisoRequerido]`,
    el **mismo helper duplicado** en los dos archivos. Se resolvería tipando la clave como
    `PermisoKey` (ya existe en `src/types/roles.ts`) en vez de castear el objeto; de paso, el helper
    es candidato a extraerse a `lib/`.
  - `api/cron/recordatorios/route.ts:76` — `(t.paciente as any).nombre_completo` (forma del join).
  - `api/pacientes/[id]/route.ts:12` — `async function getTenantMedicoId(supabase: any, …)`.
- **⚠ Grupo (C) del turnero — 7 `any` de DATOS DE DOMINIO. Los únicos `any` que quedan ahí.**
  Quedaron **deliberadamente afuera** de L2, con el mismo criterio que los 4 de Route Handlers: no
  son anotaciones a corregir, son **tipos que hay que crear**. Líneas **ya recalculadas post-L2**:
  - `calendar-view.tsx:133` — `useState<any | null>` (`selectedEvent`); guarda el `raw` de
    `extendedProps`.
  - `calendar-view.tsx:203`, `:207` — `.filter((t: any) …)` / `.map((t: any) …)` sobre `data.turnos`;
    el `:207` lee `t.paciente.nombre_completo`.
  - `calendar-view.tsx:218` — `data.bloqueos.map((b: any) …)`.
  - `turno-form.tsx:75` y `block-slot-modal.tsx:46` — `initialData?: any // RAW event data`.
  - `turno-form.tsx:105` — `useState<any[]>([])` (`pacientes` de la búsqueda).

  **Requieren crear `TurnoConPaciente`, que hoy no existe:** `GET /api/turnero` proyecta
  `'*, paciente:paciente_id (id, nombre_completo)'` (`api/turnero/route.ts:47`) y `types/turno.ts`
  **no modela** ese join. Habría que seguir el patrón que el repo ya usa (`ConsultaConRelaciones`,
  `PacienteWithObraSocial`). Además, **`selectedEvent` y los dos `initialData` son el MISMO `any`
  encadenado** (calendario → modal): se resuelven **juntos** o no se tocan.
- **Nota: tipar los handlers de FullCalendar NO tipó `event.extendedProps`.** Es
  `Record<string, any>` **por diseño de la librería**, así que el `const { type, raw } = ...` sigue
  devolviendo `any` después de L2. **Es esperado y no es deuda nueva** —el linter ni lo marca, porque
  no hay anotación explícita—: lo resuelve el grupo (C), que es donde vive el tipo real de `raw`.
- **Prolijidad del turnero (ítems chicos, sin urgencia).** Detectados al diagnosticar L2; ninguno es
  lint ni se tocó:
  - **Los 2 `throw new Error(errorData.error)` sin fallback** — `turno-form.tsx:241` y
    `block-slot-modal.tsx:126`. Si el endpoint respondiera sin campo `error`, el toast mostraría
    literalmente **"undefined"**. Otros dos sitios de esos mismos archivos **sí** se protegen con
    `|| 'Error al eliminar'`. Se dejaron **byte a byte** en L2 a propósito: agregarles el fallback es
    un **cambio de comportamiento**, ajeno al tipado, y merece decidirse aparte.
  - **`@fullcalendar/core` no está declarado en `package.json`** (solo `daygrid`, `interaction`,
    `react`, `timegrid`): es una **dependencia transitiva** que el código ya usaba antes de L2
    (`calendar-view.tsx:8`, el locale `es`) y que ahora también usan los `import type`. Declararla
    sería lo correcto, pero es un **cambio de dependencias**, no de código.
  - **Helper duplicado `formatDateToIsoOutput`**, idéntico en `turno-form.tsx:80` y
    `block-slot-modal.tsx:50`. Candidato a `lib/utils/`.
  - **Indentación a 4 espacios** en los bloques `onDelete`/`onSubmit` de esos dos archivos, contra
    los 2 del resto del repo. Cosmético; **no tocar dentro de una tanda de tipos** (ensuciaría el diff).
- **⚠ DECISIÓN DE POLÍTICA PENDIENTE — adoptar (o no) la convención de prefijo `_`.** Hoy el repo
  usa `_` en **8 lugares** (`_req` ×5, `_request` ×3) **sin ningún efecto**, porque
  `eslint.config.mjs` no define `varsIgnorePattern`/`argsIgnorePattern`. Se dejó afuera de L3b a
  propósito: **no es limpieza, es una decisión de equipo**. Datos para tomarla:
  - **Hoy no silenciaría nada:** los `_req`/`_request` son parámetros que **preceden a uno usado**, y
    el default `args: 'after-used'` ya no los marca. Su valor sería **preventivo**, para que la
    convención empiece a significar algo.
  - **El costo:** a partir de ahí, **cualquier** variable que empiece con `_` deja de reportarse para
    siempre. Si alguien "arregla" un unused legítimo renombrándolo en vez de borrarlo, el linter se
    queda mudo.
  - ⚠ **Nota de coherencia:** `consultas/[id]/route.ts:34` y `:207` declaran `_request` **y lo usan**
    (`:41` y `:214`, `rateLimit(_request, …)`). El prefijo comunica lo contrario de lo que pasa;
    convendría renombrarlos si se adopta la convención.
  - **Dejarla para cuando el dueño del proyecto la tome a conciencia**, no colada en una tanda de lint.
- **Plan de las tandas restantes** (nota de planificación, no compromiso de fecha). ⚠ **Ninguna es
  limpieza de lint**: la serie L1→L4 agotó eso (ver el hito).
  - **Tanda "tipos de dominio"** — **11 de los 19 `any`**: el **grupo (C) del turnero** (7) + los **4
    de Route Handlers no-catch**. Requieren **crear tipos** (`TurnoConPaciente`), no corregir
    anotaciones. Es la más grande de las que quedan.
  - **Los 8 `any` sueltos — SIN tanda asignada.** `pedido-form.tsx` (2),
    `historia-clinica-form.tsx` (2), `perfil-form.tsx`, `notificaciones/list.tsx`,
    `verificar/[codigo]/page.tsx` y `perfil/page.tsx` (1 c/u). **Habría que diagnosticarlos antes de
    agruparlos**: no se sabe todavía si comparten naturaleza (como pasó con los catches) o si son
    casos independientes. **No asumir que son un lote.**
  - **Tanda "efectos y estado derivado"** — los 2 `react-hooks/set-state-in-effect`. **No son un
    lote:** son de naturaleza distinta, cambian comportamiento observable y se verifican en
    **superficies distintas**. Se pueden hacer por separado.
    - `calendar-view.tsx:46` (`useIsMobile`) → fix canónico **`useSyncExternalStore`** (no es
      derivable en render: `matchMedia` no existe en SSR). ⚠ **Cambia comportamiento en móvil**:
      `isMobile` alimenta el efecto que hace `changeView` a vista día. Verificación: **móvil real o
      emulado, con recarga**.
    - `onboarding-client.tsx:44` (debounce de búsqueda) → **derivar en render**, pero ⚠ **conservando
      el guard del timer**: el `return` temprano hace dos cosas —limpia estado **y** evita agendar el
      `setTimeout`—, así que mover solo el reseteo dispararía una búsqueda por tecla. Verificación:
      **flujo de onboarding**, que es la puerta de entrada de los asistentes.
  - **Tanda "tipos de dominio" (sin número de L — NO es limpieza de lint).** Junta el **grupo (C) del
    turnero** (7) con los **4 `any` no-catch de Route Handlers** que anotó L1, porque **son la misma
    cosa**: crear y aplicar tipos de dominio, no corregir anotaciones. Ambos grupos fueron excluidos
    de sus tandas por idéntico criterio, y comparten método (definir el tipo que falta, aplicarlo,
    compilar). Conviene hacerlos **juntos** y no repartidos entre tandas de lint.
  - **💡 CANDIDATA FUTURA (idea, NO pendiente activo) — que `z.input` del schema de consulta deje de
    ser `unknown`.** `numericOptional` en `consulta.schema.ts` usa **`z.coerce.number()`**, cuyo input
    es `unknown` y **absorbe la unión**, así que `ConsultaFormInput` deja los 12 campos numéricos en
    `unknown`. Es **lo único** que haría de `field.value` un tipo útil y volvería innecesaria la
    conversión explícita de `numericProps` (ver L4). ⚠ **Pero NO es lint:** ese schema lo usan las
    **dos Route Handlers** (`api/consultas/route.ts:97` y `api/consultas/[id]/route.ts:102`,
    `safeParse`), así que tocarlo **cambia la validación server-side de todas las consultas**.
    Anotado como idea por si alguna vez vuelve a molestar; **hoy no hay nada roto**.
  - **Tanda "mensajes de error propios" (producto + seguridad, NO lint).** `perfil/actions.ts`
    devuelve al usuario el **mensaje crudo de Postgres** (p. ej. *"duplicate key value violates unique
    constraint …"*), con nombres de tablas y constraints: es **UX pobre** y una **fuga leve de
    detalles del esquema**. L3c **preservó ese comportamiento a propósito** (el requisito era no
    cambiar lo que ve el usuario). Cuando se haga, **`mensajeDeError` es el punto natural donde
    interceptar** y mapear a textos propios. ⚠ Ojo: hacerlo **invalida la verificación pendiente de
    L3c** (ya no habría mensaje crudo que comparar), así que **verificar L3c primero**.
- **⚠ PENDIENTE — nudo de tipos en `consulta-detail.tsx`. Severidad baja, requiere `tsc`.**
  (Abierto 2026-07-30; **sigue vigente al 2026-08-03**: el `as any` está en
  `src/components/pacientes/consultas/consulta-detail.tsx:215`.) Se dejó **deliberadamente afuera**
  de la tanda 1A porque no es limpieza
  mecánica sino un desajuste real de tipos, y los tres puntos van **juntos** (tocar ese archivo
  una sola vez):
  - `:215` — `resolver: zodResolver(consultaSchema) as any`. `consultaSchema`
    (`src/lib/validations/consulta.schema.ts`) termina en un **`.transform()`** que pasa los `''`
    de los campos numéricos a `null`, así que **`z.input` ≠ `z.output`** y por eso el archivo
    exporta los dos tipos (`ConsultaFormInput` / `ConsultaFormData`). El `as any` tapa
    exactamente ese desajuste. **Fix correcto:** el tercer genérico de react-hook-form →
    `useForm<ConsultaFormInput, unknown, ConsultaFormData>({ resolver: zodResolver(consultaSchema) })`,
    sin cast.
  - `:333` — `const numericProps = (field: any)`. **Fix correcto:**
    `ControllerRenderProps<ConsultaFormInput, FieldPath<ConsultaFormInput>>`. **Depende del
    anterior:** si cambia el genérico del `useForm`, cambia este tipo.
  - `:198` — `mode` desestructurado y nunca usado (el componente distingue por `consulta ? …`).
  - ⚠ El cambio **propaga** a `form.getValues()`, `form.setValue()` (`:279`, `:281`, `:292`) y al
    `field` de cada `FormField` (12 campos numéricos): hay que **compilar** para confirmar que la
    combinación RHF 7 + Zod 4 + `@hookform/resolvers` acepta la firma sin arrastrar otros errores.
- **⚠ DECISIÓN PENDIENTE (2026-07-30) — `calendar-view.tsx:125`, el `currentView` "sin usar".**
  El linter marcaba `currentView`, pero **`setCurrentView` SÍ se usa** (`:532` `viewDidMount` y
  `:533` `datesSet`): borrar el estado entero habría quitado un re-render que hoy ocurre al
  cambiar de vista, o sea un **cambio de comportamiento disfrazado de limpieza**. Quedó como
  `const [, setCurrentView] = useState('timeGridWeek')` con el porqué comentado en el código. Si
  se decide eliminar el estado completo, evaluar antes si ese re-render hace falta para el
  turnero — es una decisión aparte, no lint.

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
- **⚠ Endurecer la CSP — Fases 1a y 1b HECHAS y en producción; la Fase 2 (sacar
  `script-src 'unsafe-inline'`) está BLOQUEADA.** Estado al 2026-07-29:
  - **✅ Fase 1a — enforcement (`next.config.ts`, 2026-07-28).** Se agregaron `object-src 'none'`
    y **`base-uri 'self'` + `form-action 'self'`** — estas dos **no heredan de `default-src`**, así
    que hasta ahora estaban **sin restricción**: era un agujero real (inyección de `<base>`,
    posteo de formularios a terceros). Se sumó `upgrade-insecure-requests` **solo en producción**
    (en dev se entra por IP de LAN sobre HTTP y forzar https rompería ese acceso). Se **quitaron
    permisos muertos**: `fonts.googleapis.com` (`style-src`), `fonts.gstatic.com` (`font-src`) —
    Inter la auto-hostea `next/font` — y `https://*.supabase.co` (`img-src`) — Storage se sirve
    por proxy same-origin, el navegador nunca pega a Supabase por imágenes.
  - **✅ Fix `font-src 'self' data:` (2026-07-29). ⚠ NO volver a quitar el `data:`:** FullCalendar
    embebe su fuente de íconos `fcicons` como `data:application/x-font-ttf`; sin `data:` el
    turnero pierde los íconos (violación real vista en producción).
  - **✅ Fase 1b — CSP de ensayo en report-only (`src/proxy.ts`, 2026-07-29).** El middleware
    emite `Content-Security-Policy-Report-Only` con **nonce por request**, conviviendo con la CSP
    de enforcement (que sigue siendo el piso). **No bloquea nada.** Ensaya
    `script-src 'self' 'nonce-…' 'strict-dynamic'` **sin `'unsafe-inline'`**; el resto de las
    directivas copia la enforcement. Sin `report-uri`/`report-to`: las violaciones se leen en la
    consola del navegador.
  - **⚠ BLOQUEANTE de la Fase 2 — el nonce NO se inyecta en los `<script>` en producción.**
    Síntoma **confirmado** contra Vercel: la cabecera report-only llega **con** nonce, pero el
    HTML sale con **0** `<script nonce=`, también en **rutas dinámicas** (p. ej.
    `/verificar/[codigo]`: 17 `<script>`, ninguno nonceado). Como `'strict-dynamic'` hace que el
    navegador **ignore `'self'`**, esos scripts —aunque sean del propio origen— se reportan como
    violación: **todas las rutas reportan `script-src`**. Mientras esto no se resuelva, **el
    enforcement no se puede activar**.
  - **Causa ABIERTA (a investigar). NO es Turbopack — quedó descartado:** el **mismo build** con
    `next start` **local** sí inyecta el nonce (20 `<script nonce=`). **Esa es la pista
    principal: en local funciona, en Vercel no** → lo que cambia es la plataforma, no el bundler.
    **Hipótesis a investigar:** la propagación de los **request headers del middleware a la
    función de render** en Vercel. El middleware corre como **Edge Function separada** de la
    función que renderiza; `NextResponse.next({ request: { headers } })` propaga los headers por
    el mecanismo interno **`x-middleware-override-headers`**, y ése es el eslabón que parece no
    cruzar el límite middleware→render. Next extrae el nonce del **request header**
    (`node_modules/next/dist/server/app-render/app-render.js:166`): si el header no llega, no hay
    nonce que inyectar — exactamente lo observado.
  - **Alternativas a explorar si el nonce no se puede propagar:** CSP por **hashes** de los
    scripts, o **`experimental.sri`** (Subresource Integrity generada por Next).
  - **Sub-pendiente subordinado (secundario al anterior): `/login` y `/registro` son estáticas.**
    Se prerenderizan en build time —cuando no hay request— así que sus `<script>` no pueden
    recibir nonce; la solución documentada es `await connection()` en cada page
    (`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md:195-217`). **Pero
    mientras el nonce no se propague en Vercel, arreglar esas dos rutas no destraba nada.**
  - **Nota permanente: `style-src 'unsafe-inline'` es IRREDUCTIBLE — no intentar sacarlo.**
    Radix/shadcn (y Sonner, FullCalendar) fijan **atributos `style=""`** para posicionar
    popovers/selects/diálogos, y **los nonces NO aplican a atributos `style`** (solo a elementos
    `<style>`/`<script>`). Sacarlo rompería el posicionamiento.
- **Ya presentes:** HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`, la CSP de enforcement (`next.config.ts`, endurecida en la Fase 1a) y la
  CSP de ensayo en report-only (`src/proxy.ts`, Fase 1b).
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
