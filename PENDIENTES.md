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
- **✅ RESUELTO (migración 038 + tanda de descarte, 2026-08-08) — no había forma de descartar un
  BORRADOR de consulta.** Detectado al verificar la tanda L4 (2026-08-03) y **preexistente**: se podía
  crear y guardar un borrador, pero **no cancelarlo ni borrarlo**, así que un borrador equivocado o de
  prueba quedaba **sin salida** en la HC del paciente. Las tres decisiones que bloqueaban la ejecución
  se tomaron, y quedan asentadas acá porque son la **razón** de cómo está implementado:
  - **Borrado FÍSICO y SIN RASTRO** (no archivado, no log). Se verificó que `consultas` **no tiene
    trigger de auditoría** —el único es `consultas_updated_at`; `turnos_audit_log` es exclusivo de
    `turnos`—, así que "sin rastro" **se cumplía solo**: no hubo nada que quitar. Contraste
    deliberado con pacientes (regla 9), que se archivan.
  - **Quién puede: el médico** (cualquier borrador de su tenant) **o el asistente que lo creó.**
    Requirió una columna nueva: `consultas` era la **única de su familia sin columna de autor**
    (`turnos.agendado_por`, `pacientes.creado_por`, `historia_clinica.creado_por`), y `medico_id` no
    sirve como sustituto porque es el **tenant**, no quién escribió.
  - **Ley 25.326:** decisión del responsable de los datos, tomada — los datos clínicos del borrador
    **se eliminan**, sin log ni rastro de que existió.
  - **── Qué se implementó ──** Migración **038**: columna `consultas.creado_por` (nullable, FK a
    `profiles`) y `consultas_delete` reescrita (tenant + `estado = 'borrador'` + rol médico OR autor,
    normalizada a `TO authenticated`). El `estado = 'borrador'` en la política es **defensa en
    profundidad de la regla 1**: desde la 038 una consulta finalizada es **imborrable desde la base**,
    para todos los roles. Código: `DELETE /api/consultas/[id]` con **chequeo explícito de autoría**
    (403), **rechazo de paciente archivado** (409, regla 9) y **guarda de "0 filas"** (403, la lección
    de la 033); UI en `components/pacientes/consultas/descartar-dialog.tsx` + botón en
    `consulta-detail.tsx` y camino `onDeleted` en `historia-clinica-view.tsx`.
  - ⚠ **LIMITACIÓN CONOCIDA que sobrevive:** los borradores **anteriores a la 038** tienen
    `creado_por IS NULL` y **solo los descarta el médico**. No se hizo backfill a propósito (no se le
    puede inventar autor a una fila vieja). No necesita cláusula propia en la política: con NULL, la
    comparación `creado_por = auth.uid()` da **NULL** —o sea, no pasa— y el médico entra por la otra
    rama del `OR`. Es lógica ternaria de SQL, no un caso especial.
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

### Agenda y RLS — bug raíz resuelto y seguimientos

> La familia de bugs de esta sección era **la política RLS que falta o no coincide con lo que el
> endpoint permite**, y el fallo llegaba al usuario como un **falso éxito** (toast verde, nada
> guardado). **Cerrada el 2026-08-06** con la migración `033` + las guardas de "0 filas" en los
> endpoints. Lo que queda abajo del ítem resuelto son **seguimientos** que la tanda dejó anotados.

- **✅ RESUELTO (migración 033 + guardas de "0 filas", 2026-08-06) — editar un bloqueo de agenda NO
  persistía NINGÚN cambio, y el modal decía que sí. Severidad ALTA. Era PREEXISTENTE desde el origen
  del turnero.** Diagnosticado el 2026-08-04, aplicado y **verificado en producción con dos sesiones**
  (médico + asistente con `gestionar_turnos`).
  - **Síntoma:** se abre un bloqueo existente, se le cambia (o agrega) el **motivo**, se guarda → el
    modal muestra el toast **"Bloqueo actualizado"** y se cierra. Al reabrirlo, el motivo es el
    viejo. **No es solo el motivo: no persiste ningún campo** — las fechas tampoco. El camino de
    **creación (POST) funciona bien**; el que falla es exclusivamente el de **edición (PATCH)**.
  - **Causa raíz — faltaba la política de UPDATE en la base.** `bloqueos_agenda` tenía
    `bloqueos_select`, `bloqueos_insert` y `bloqueos_delete`, pero **nunca tuvo
    `bloqueos_update`** (verificado en `005_turnos.sql:106-117`; las migraciones `013` y `015` solo
    redefinen la de INSERT, ninguna crea una de UPDATE). Con RLS activa
    (`schema.sql:822`) y sin política, **el `USING` filtra filas en vez de abortar**: el `UPDATE`
    afecta **0 filas**, devuelve `error: null` y `data: []`, y no levanta ningún código de error.
  - **⚠ El contraste que lo confirma:** `turnos` **sí** tiene `turnos_update`. Las dos tablas
    nacieron en la misma migración con el mismo patrón y a `bloqueos_agenda` se le omitió
    exactamente esa línea. Por eso **editar un turno persiste y editar un bloqueo no**.
  - **El código de la app está CORRECTO — no hay nada que arreglar ahí.** Se verificaron los tres
    puntos sospechables y los tres están bien: el modal manda el motivo (`block-slot-modal.tsx`
    arma `payload = { ...data, fechas }` **una sola vez, antes** de elegir método/URL: es el
    **mismo objeto** en POST y en PATCH), el schema lo deja pasar
    (`bloqueoAgendaUpdateSchema = bloqueoAgendaBaseObject.partial()`, y `motivo` está en el objeto
    base — `turno.schema.ts:144`) y el endpoint lo escribe (`.update(updates)` con el objeto
    completo, sin `pick` de campos). **Lo único que falta es la política.**
  - **Dos capas de enmascaramiento** — son las que convirtieron un fallo de permisos en un falso
    positivo silencioso, y explican por qué pasó desapercibido desde el día uno:
    1. **El endpoint no chequeaba "0 filas"**: `updated` quedaba `[]`, `updated[0]` era `undefined`,
       y respondía `{ data: undefined }` con status **200**. ✅ **Cerrado por la guarda** (parte 2
       del fix).
    2. **El modal solo mira `response.ok`**, nunca el cuerpo: un 200 que no actualizó nada es
       indistinguible de uno que sí. **Se dejó así a propósito** — con la guarda, un fallo ya no
       llega como 200, así que mirar `response.ok` volvió a ser suficiente.
  - **PREEXISTENTE — ninguna tanda de tipos lo introdujo.** Verificado por historial, no por
    deducción: `git log -S` sobre el payload del modal y sobre el `.update(updates)` del endpoint
    devuelve **un único commit cada uno** (`03eb969`, "turnero funcionando, falta pulir"), o sea que
    esas líneas se escribieron una vez y **nunca se modificaron**. **L2** y **T3** tocaron el modal
    solo en `catch`/anotaciones de tipo y **T4** ni siquiera lo tocó. Argumento estructural
    independiente: **una política RLS no se crea ni se quita desde TypeScript**, que además se borra
    al compilar.
  - **── QUÉ RESOLVIÓ CADA PARTE ──**
  - **(1) SQL — migración `033_bloqueos_update_y_deletes_agenda_rls.sql`** (aplicada a mano en el SQL
    Editor, con su copia suelta `MIGRACION-09-bloqueos-update-y-deletes-agenda.sql`). Tres políticas,
    todas con el mismo `USING` y **sin `WITH CHECK`** (en Postgres el `USING` oficia de check para la
    fila nueva, así que nadie puede mover una fila a otro tenant):
    ```sql
    USING (medico_id = get_medico_id() AND public.check_permiso(auth.uid(), 'gestionar_turnos'))
    ```
    - **`bloqueos_update` — CREADA.** Es la que nunca había existido: **cierra el bug raíz**. Espeja
      `turnos_update`, o sea que **el asistente con `gestionar_turnos` puede editar bloqueos**.
    - **`bloqueos_delete` — REEMPLAZADA.** Antes era solo-médico (y escrita con un **subquery inline
      a `profiles`** en vez de `get_user_role()`, un drift menor que se normalizó de paso). **Cierra
      H1.**
    - **`turnos_delete` — REEMPLAZADA.** Mismo cambio y misma razón: **bug gemelo** en la tabla
      hermana, encontrado al preparar el fix. El endpoint ya dejaba pasar al asistente y la política
      era solo-médico, así que el borrado le fallaba en silencio.
    > **Decisión de producto (Opción A de las tres evaluadas): la agenda es una unidad de permiso.**
    > Quien puede crear y editar turnos y bloqueos, también puede borrarlos. Se eligió alinear **la
    > base con los endpoints** (que ya autorizaban al asistente) en vez de restringir los endpoints.
    > ⚠ Es el **único dominio** donde el borrado no queda reservado al médico — contrastar con
    > pacientes (regla 9), estudios (regla 10) y documentos (regla 5). Registrado también en
    > `CLAUDE.md` → Auth y roles.
  - **(2) Código — guardas de "0 filas"** (lo que convierte un fallo de RLS en algo **diagnosticable**
    en vez de mudo). Sin esto, cualquier problema futuro de RLS sobre estas tablas se repetiría igual
    de silencioso:
    - `src/app/api/turnero/bloqueos/[id]/route.ts` → guarda en **PATCH y DELETE**, ambas con **403**
      ("la base de datos rechazó…"). Al DELETE se le agregó **`.select('id')`**, sin el cual no había
      forma de contar filas.
    - `src/app/api/turnero/[id]/route.ts` → guarda en el **DELETE** de turnos, con **404**
      `'Turno no encontrado o sin permisos'`. ⚠ **La asimetría 404 vs 403 es intencional:** este
      handler **no hace fetch previo** del turno (la pertenencia va solo por el
      `.eq('medico_id', …)`), así que las 0 filas colapsan **tres causas indistinguibles** —no
      existe / otro tenant / RLS lo filtró— y el código honesto es un 404 genérico, el mismo que ya
      usaba el **PATCH de ese archivo** en su propia guarda. **El PATCH no se tocó.**
    - **`H3` cerrado de paso:** se eliminó la rama muerta de `updateError.code === '42501'` en los
      tres handlers. Un `UPDATE`/`DELETE` filtrado por RLS **nunca levanta 42501** —solo un
      `WITH CHECK` violado aborta—, así que esa rama era inalcanzable por la vía que decía cubrir y
      **daba la falsa sensación de que el caso RLS estaba contemplado**: probablemente parte de por
      qué el bug sobrevivió tanto.
    - **El modal no se tocó.** `block-slot-modal.tsx` estaba correcto de punta a punta; ya propaga
      `err.error` cuando la respuesta no es `ok`, así que los mensajes nuevos se muestran solos y el
      drag/resize vuelve a disparar `revert()`.
  - **(3) `H2` se arregló solo con la migración** (arrastrar/redimensionar usa el mismo PATCH), pero
    **entró en la verificación**, que es donde se comprobó.
  - **Verificación hecha (2026-08-06) — navegador, DOS SESIONES.** `tsc`/`build`/`lint` no cubrían
    nada de esto. Se confirmó: médico edita motivo y fechas y persisten; arrastrar y redimensionar
    sobreviven al F5; **el asistente con `gestionar_turnos` edita y borra de verdad**; crear y borrar
    siguen funcionando. Orden aplicado: **primero el código, después el SQL** — así la guarda mostró
    el 403 honesto sobre la base sin política, que fue la prueba directa de que el diagnóstico era
    correcto y de que la guarda funciona.
  - **✅ H5 RESUELTO (Grupo 4, 2026-08-16) — el helper de tenant se extrajo a `lib/`.** Lo que este
    ítem anotaba —`getTenantMedicoId` duplicado inline en los dos handlers de
    `bloqueos/[id]/route.ts`, ~18 líneas cada uno— ya no existe: los dos llaman a
    **`resolverAcceso(supabase, user.id, 'gestionar_turnos')`**, una línea cada uno. El trabajo
    completo (censo real, las tres tandas y el porqué del corte) está documentado en el ítem
    ✅ **RESUELTO (Grupo 4, 3 tandas)** de "Lint preexistente" → *los 4 `any` de Route Handlers*;
    no se repite acá.

- **✅ RESUELTO (migración 040, 2026-08-11) — `turnos_audit_log` no registraba los DELETE.** El
  trigger cubría solo INSERT y UPDATE, así que **el borrado no dejaba rastro**. Importaba desde la
  033: el asistente con `gestionar_turnos` borra turnos de verdad y **no quedaba registro de quién**.
  Se aplicó exactamente la **"salida natural"** que este ítem había identificado —desnormalizar el
  tenant y soltar la FK—, más la rama nueva en la función y el trigger.
  - **Qué hizo la 040, en orden** (todo en una transacción; el orden importa): columna `medico_id`
    nullable → **backfill** por JOIN contra `turnos` **mientras la FK seguía viva** → `SET NOT NULL`
    → índice `idx_turnos_audit_medico` → `turno_id` a nullable y su FK de **`ON DELETE CASCADE` a
    `ON DELETE SET NULL`** → `log_turno_cambio()` con **rama DELETE** → trigger recreado como
    **`AFTER INSERT OR UPDATE OR DELETE`** → `audit_select` reescrita.
  - **Los DOS obstáculos que el ítem listaba quedaron resueltos:** el `CASCADE` (que borraba el
    historial completo del turno) pasó a `SET NULL`, y `audit_select` dejó de resolver el tenant por
    **JOIN al turno** —lo que hacía invisibles justo las filas huérfanas— para leer `medico_id` de la
    propia fila. De paso se normalizó a `TO authenticated` (antes no declaraba `TO`, o sea `{public}`).
  - ⚠ **La fila `'eliminado'` nace con `turno_id NULL`, NO con `OLD.id`** — y no es una
    simplificación: `ON DELETE SET NULL` gobierna las filas hijas que **ya existen**, no habilita
    insertar una hija nueva apuntando a un padre que se fue. En un AFTER DELETE ese INSERT violaría
    la FK y **abortaría el borrado entero**. El id del turno queda dentro de `detalle`
    (`to_jsonb(OLD)`), así que no se pierde información.
  - ✅ **LA DISCREPANCIA `BEFORE`/`AFTER` QUEDÓ CERRADA, y conviene dejar escrito cómo.** Este ítem
    afirmaba —verificado contra la base viva en 2026-08-08— que el trigger era **BEFORE**, mientras
    que `schema.sql` y la migración fuente `005_turnos.sql:176` decían **AFTER**. La 040 hace
    **DROP + CREATE** del trigger, así que **fija la dirección de forma explícita**: es **AFTER**, y
    la ambigüedad se termina ahí. `005_turnos.sql` no se tocó (historia ya aplicada) y `schema.sql`
    quedó alineado en el pase de docs del Grupo 2.
  - ⚠ **La atribución del actor tiene una red de seguridad, y hay que saber leerla:** `usuario_id` es
    NOT NULL, así que la rama DELETE usa `COALESCE(auth.uid(), OLD.agendado_por)`. Si el borrado lo
    hiciera el admin client (service_role, sin sesión), `auth.uid()` es NULL y la fila **atribuiría el
    borrado a quien AGENDÓ el turno**, no a quien lo borró. Ver el ítem de la baja del endpoint
    `historia` más abajo: ese camino ya no existe.
- **✅ RESUELTO (migración 036, 2026-08-07) — `bloqueos_agenda` no tenía `updated_at` ni trigger.**
  La tabla solo definía `created_at` (`005_turnos.sql`), mientras que `turnos` tenía ambos
  (`turnos_updated_at`). Desde la 033 los bloqueos **son editables de verdad**, así que dejó de ser
  cosmético: no quedaba registro de **cuándo** se editó uno. La 036 agregó la columna y colgó el
  trigger `bloqueos_updated_at`, espejo exacto de `turnos_updated_at`; `BloqueoAgenda`
  (`types/turno.ts`) ya declara el campo, y `BloqueoAgendaInsert` **no** lo lleva (lo pone el DEFAULT).
  - **Detalle que vale conservar:** la migración **sembró las filas existentes con su `created_at`**
    en vez de dejar el DEFAULT. Sin ese paso, todos los bloqueos históricos habrían quedado con
    `updated_at = now()`, afirmando una edición que **nunca ocurrió**.
  - ⚠ **Lo que esto NO cerró:** registra el **cuándo**, no el **quién** ni el **qué**. **Sigue sin
    haber un equivalente de `turnos_audit_log` para bloqueos** (la única tabla de auditoría del
    proyecto es esa, y su FK apunta a `turnos(id)`). Una auditoría completa de bloqueos es trabajo
    aparte, no previsto todavía.
- **✅ RESUELTO (migración 037, 2026-08-07) — `bloqueos_select` no exigía `ver_turnos`.** Era
  **tenant-only** (`medico_id = get_medico_id()`) desde la 005, a diferencia de `turnos_select`, que sí
  chequeaba permiso: un asistente **sin** `ver_turnos` no veía la agenda en la app pero **podía leer
  los bloqueos por PostgREST directo** — mismo tipo de hueco que la `026` cerró en `estudios`.
  Severidad baja (el contenido es `motivo`, texto del consultorio, no dato clínico), pero era una
  lectura que nadie autorizó. Dos precisiones sobre **cómo** se cerró, que no son detalle menor:
  - **El criterio NO espeja a `turnos_select`:** la política nueva pide **`ver_turnos` OR
    `gestionar_turnos`**, siguiendo el criterio que la 033 dejó asentado (*"la agenda es una unidad de
    permiso"*). ⚠ El motivo es concreto: los 12 permisos son booleanos **independientes** y nada obliga
    a que `gestionar_turnos` implique `ver_turnos`, así que un asistente con `gestionar_turnos` y **sin**
    `ver_turnos` es configurable hoy. Con un `USING` que pidiera solo `ver_turnos` se le habrían **roto
    los endpoints de edición y borrado**, que hacen fetch previo y `.select()` de verificación sobre
    esta misma tabla.
  - ⚠ **La advertencia sobre la guarda de "0 filas" SE ACTIVÓ:** ya no es hipotética. El `OR
    gestionar_turnos` está elegido justamente para que la guarda del PATCH siga siendo correcta (quien
    pasa el chequeo del endpoint pasa también el SELECT → **no hay 403 falsos**), pero **el comentario
    del código quedó desactualizado** — ver el ítem del comentario del PATCH de bloqueos, más abajo.
- **✅ RESUELTO (migración 037, 2026-08-07) — las políticas de `bloqueos_agenda` aplicaban a
  `{public}`, no a `{authenticated}`.** Ninguna declaraba `TO`, y en Postgres eso equivale a
  `TO PUBLIC`: la política se evaluaba para todos los roles, `anon` incluido. La `029` normalizó otras
  tablas y a esta no la tocó; la `033` tampoco (se limitó al criterio de permisos). Sin impacto
  explotable —el rol `anon` no pasa el `get_medico_id()`—, pero era **defensa en profundidad**. La 037
  dejó las **4** en `TO authenticated`; las tres de escritura se **re-emitieron con su expresión
  textual** (copiada de la 015 y la 033), solo para cambiarles el rol: no se reinventó ninguna.
- **✅ RESUELTO (2026-08-07, commit `6cd48c2`) — el chequeo de solapamiento no filtraba por `estado`.**
  Un turno **cancelado** en la franja bloqueaba la creación o edición de un bloqueo con un **409**.
  Dos correcciones respecto de cómo estaba descrito acá:
  - **El fix es más amplio: son 4 sitios, no 2.** Además de `POST /api/turnero/bloqueos`
    (`bloqueos/route.ts:64`) y su `PATCH` (`bloqueos/[id]/route.ts:95`), se alinearon los dos del
    turnero: `turnero/route.ts:133` y `turnero/[id]/route.ts:77`.
  - **Excluye `cancelado` Y `pendiente_confirmar`**, no solo cancelados:
    `.not('estado', 'in', '(pendiente_confirmar,cancelado)')`. Un turno sin confirmar tampoco "ocupa"
    la franja.
  - ⚠ **Dejó una asimetría nueva:** los **2 sitios de `consultas`** quedaron con `(cancelado)` a
    secas. Ver el ítem *"el solapamiento de consultas quedó desalineado"*, más abajo.

- **✅ RESUELTO (migración 039, 2026-08-11) — `turnos_select` no exigía `gestionar_turnos`: era el
  mismo hueco que la 037 había cerrado en bloqueos.** Las dos tablas de la agenda tenían **criterios
  distintos** de lectura; ahora comparten el **mismo `USING`**, textualmente.
  - **Se eligió la salida (a)** de las dos que este ítem planteaba: replicar el `OR` de la 037 en
    `turnos_select`, consistente con *"la agenda es una unidad de permiso"* (033). ⚠ **La (b)** —que
    la UI de `/perfil` no permita la combinación— **sigue disponible y no queda excluida**: arregla la
    causa en la UI, pero por sí sola dejaría la base sin defensa ante PostgREST directo o un script.
  - **El síntoma que cerró:** un asistente con `gestionar_turnos` y **sin** `ver_turnos` **escribía
    turnos que no podía leer** → 404 falsos y, más grave, **falsos negativos de solapamiento** (la
    query de solape pasa por esta política, devolvía vacío y **dejaba crear un turno encima de otro**).
  - ⚠ **Es defensa en profundidad, no el único arreglo:** la Tanda A ya había unificado el criterio en
    `src/lib/agenda/solapamiento.ts`, pero **eso no cerraba este bug** —solo lo concentraba en un
    lugar en vez de seis—, porque el helper consulta con el **cliente de sesión** y pasa por RLS.
  - **Se hizo con `ALTER POLICY`** (modifica el `USING` **en el lugar**, sin el instante intermedio en
    que la política no existe). Es **ampliación** de acceso (`A` → `A OR B`), así que era imposible que
    los datos existentes la violaran y **nadie que ya leyera turnos dejó de leerlos**.
  - ⚠ **Dejó abierto el ROL** — ver el ítem nuevo de normalización a `TO authenticated`, más abajo.
- **✅ RESUELTOS JUNTOS (Tanda A del Grupo 2, 2026-08-10, sin migración) — las DOS asimetrías
  inversas del chequeo de solapamiento.** Eran dos fichas separadas —(1) el PATCH de turnos no
  filtraba `categoria`; (2) los 2 sitios de `consultas` habían quedado con `(cancelado)` a secas
  mientras el turnero excluía también `pendiente_confirmar`— y se cerraron con **la salida que ambas
  proponían**: *"un criterio único de 'franja ocupada' escrito en un solo lugar"*, en vez de seguir
  parchando 6 sitios.
  - **El helper:** `src/lib/agenda/solapamiento.ts` → `buscarSolapamientos(...)`. Consolidó **12
    queries en 6 endpoints** en una sola implementación, que mira `turnos` y `bloqueos_agenda` en
    paralelo. Ver `CLAUDE.md` → **nota técnica 23**.
  - **Cómo se resolvió cada asimetría, y qué criterio ganó:**
    - **`categoria`: "nada se pisa con nada".** El chequeo turno-vs-turno **ya no filtra por
      categoría** — la agenda modela la **disponibilidad física del médico**, así que un `curso`, un
      `personal` o un `administrativo` ocupan igual que un `turno_medico`. O sea que, de las dos
      opciones que la ficha planteaba, **el que estaba mal era el POST**, no el PATCH.
    - **`estado`: `pendiente_confirmar` SÍ ocupa.** Acá el criterio **cambió respecto de los dos
      lados**: no ganó ni el del turnero ni el de consultas. Ocupan `pendiente`, `confirmado`,
      `presente` y `pendiente_confirmar`; **no** ocupan `cancelado`, `ausente` y `reprogramado`.
      ⚠ Esto **supersede** al commit `6cd48c2`, que había excluido `pendiente_confirmar` en 4 sitios.
  - ⚠ **De inclusión, no de exclusión.** Se pasó de `.not('estado','in',(…))` a `.in(...)`, derivado
    de un `Record<TurnoEstado, boolean>` **exhaustivo**. Invierte el default: antes **todo estado
    nuevo ocupaba** sin que nadie lo decidiera; ahora un valor nuevo en el ENUM **rompe la
    compilación** hasta que alguien elija. Es la parte del fix que evita que la asimetría vuelva.
  - **Dos arreglos que la tanda encontró de paso** (no estaban en ninguna ficha): se **propaga el
    error** de cada query —**8 de las 12** lo descartaban, así que un fallo de red daba `data`
    `undefined` y el endpoint concluía **"franja libre"**, un *fail-open* silencioso—, y se cerró el
    agujero de **"una sola fecha"** en el PATCH de turnos con un fetch previo.
- **✅ RESUELTO (commit `ba5188d`, 2026-08-10) — el comentario desactualizado del PATCH de bloqueos.**
  Era deuda de comentario, no de código: decía que `bloqueos_select` *"hoy es tenant-only, así que si
  algún día se endurece esa política habría que revisar esta guarda"*, cuando la **037 ya la había
  endurecido**.
  - **Hoy el comentario dice lo correcto** (`src/app/api/turnero/bloqueos/[id]/route.ts:112-115`):
    que el `.select()` pasa por `bloqueos_select`, que desde la 037 exige `ver_turnos` OR
    `gestionar_turnos`, y que **ese `OR` está elegido justamente para que la guarda de "0 filas" siga
    siendo correcta** — quien pasa el chequeo del endpoint (`gestionar_turnos`) pasa también el
    SELECT, así que no hay 403 falsos.
  - ⚠ **Este ítem quedó marcado como pendiente más tiempo del que correspondía** (se arregló en la
    `ba5188d` y siguió figurando abierto hasta el pase de docs del Grupo 4).

- **✅ RESUELTO (migración 042, 2026-08-18) — políticas RLS sin cláusula `TO`, o sea evaluadas para
  `{public}`.** Lo destapó la 039 mirando `turnos`, y al barrer el proyecto **el alcance real
  resultó mucho mayor**.
  - ⚠ **NO eran 4 políticas: eran 49, repartidas en 18 tablas.** Este ítem se abrió como *"las 4 de
    `turnos`"* porque ese fue el hallazgo puntual, pero la auditoría previa a la migración encontró
    que la 029 y la 037 habían normalizado **solo lo que tocaban**, y que todo lo demás seguía como
    había nacido. Queda anotado porque el número equivocado estuvo meses en este archivo.
  - **El estado que había:** una política sin cláusula `TO` equivale en Postgres a **`TO PUBLIC`** —
    se evalúa para todos los roles, `anon` incluido. **No era explotable**: las 49 colgaban de
    `get_medico_id()` o de `auth.uid()`, que para `anon` no resuelven. Era **defensa en profundidad y
    consistencia de esquema**, no un parche de urgencia.
  - **Cómo se hizo:** con **`ALTER POLICY … TO authenticated`**, que cambia **solo el rol** y deja las
    expresiones intactas. ⚠ Este ítem proponía **DROP + CREATE** re-emitiendo cada expresión a mano, y
    **eso habría sido un error**: habría reintroducido el drift de `difusion_posts` (la 008 las define
    como solo-médico y la base las tiene tenant-only, que es la decisión vigente — nota técnica 14) y
    habría puesto en riesgo el `WITH CHECK` asimétrico de las 12 políticas de UPDATE, de las que
    **diez no lo declaran** y **dos sí**. Con `ALTER POLICY` no hay texto que copiar mal.
  - **Resultado verificado en la base:** las **65** políticas del esquema `public` quedaron en
    `{authenticated}`, **cero** en `{public}`. Las 16 que ya lo tenían no se tocaron.
  - Con esto se cierra el último seguimiento que habían dejado abiertos la 037 y la 039: las dos
    tablas de la agenda son hoy idénticas en criterio de lectura **y en rol**.

- **📌 NOTA DE DECISIÓN (2026-08-11), no es un pendiente que espere input — `historia_clinica` queda
  DORMIDA.** Se registra acá para que no se reabra como pregunta abierta en una futura tanda.
  - **Qué se decidió:** la funcionalidad de **antecedentes** del modelo viejo de HC **se
    discontinúa**. La historia clínica viva es el conjunto de `consultas`.
  - **La baja es REVERSIBLE y de código, no de datos:** se borraron el endpoint, su schema Zod y sus
    tipos, y se quitó el insert de fila vacía del alta de pacientes. **La tabla NO se dropeó** y
    conserva sus filas, con sus 4 políticas RLS, su trigger y su índice intactos.
  - **Por qué no se dropeó:** conservación de la HC (**Ley 26.529**). ⚠ **Los datos de esa tabla son
    de prueba** —no hay antecedentes reales cargados—, así que la decisión no destruye información
    clínica; el criterio conservador se mantiene igual por si el modelo cambia.
  - **Si el criterio de producto cambia:** el formulario, el endpoint, el schema y los tipos están en
    el **historial de git**. Los **6 campos** que la tabla modela (patológicos, quirúrgicos, hábitos
    tóxicos, actividad física/laboral, perímetro de cintura) **no tienen equivalente en `consultas`**,
    así que recuperarlos es traer de vuelta la funcionalidad, no mapear columnas.

### Modelo de datos — reglas de unicidad (✅ CERRADA, 2026-08-19/20)

> Tanda de **migración** cerrada: de las tres reglas decididas el 2026-08-05, **dos se aplicaron**
> (migraciones **043** y **044**, con su auditoría previa de duplicados) y **una se DESCARTÓ** por
> incorrecta. El porqué de los alcances —y de por qué el UNIQUE de matrícula no se hace— vive en
> `CLAUDE.md` → **nota técnica 27**, que es la referencia única; acá solo queda el registro de qué
> se hizo.

- **✅ RESUELTO (migración 043, 2026-08-19) — el DNI de paciente ahora es único POR MÉDICO.**
  Se dropeó `pacientes_dni_key UNIQUE (dni)` y se creó **`pacientes_creado_por_dni_key
  UNIQUE (creado_por, dni)`**, las dos en la misma transacción (entre el DROP y el CREATE la tabla
  queda sin protección de unicidad, y la transacción cierra esa ventana).
  - **La auditoría previa dio limpio:** 0 duplicados de `(creado_por, dni)` sobre 11 pacientes en 7
    tenants, 0 filas sin DNI. La constraint entró sin fallar.
  - ⚠ **`idx_pacientes_dni` se CONSERVÓ.** Hasta la 043 era redundante con el índice de la constraint
    vieja; desde la 043 es el **único** índice sobre `dni` solo, porque el de la constraint nueva es
    `(creado_por, dni)` y `dni` no es su prefijo izquierdo.
  - **La auditoría de la app no encontró nada que ajustar:** no existe una sola query con
    `.eq('dni', …)` en el repo, ningún `.single()` cuelga de una búsqueda por DNI, y las dos
    validaciones de duplicado (`POST /api/pacientes` y `PATCH /api/pacientes/[id]`) no consultan la
    base: reaccionan al **23505**, así que el cambio de constraint las volvió **más correctas** — el
    mensaje *"Ya existe un paciente registrado con este DNI"* antes le mentía al segundo médico.
  - **Los dos casos borde que este ítem dejaba abiertos siguen igual y no requieren decisión:** la
    columna sigue `NOT NULL` (no hay pacientes sin DNI), y un paciente **archivado sigue ocupando su
    DNI** dentro del tenant — `archivado_at` no participa de la constraint, que es lo que evita
    duplicar un DNI archivando y recreando.

- **❌ DESCARTADO (2026-08-20) — (a) UNIQUE de matrícula profesional. No se hace, y no es deuda.**
  La regla decidida el 2026-08-05 (*"dos profesionales no pueden compartir matrícula"*) **es
  incorrecta como constraint**, no cara: en Argentina **los números de matrícula se repiten entre
  jurisdicciones**, así que un UNIQUE sobre el número rechazaría altas perfectamente válidas.
  Cualquier unicidad de matrícula tendría que ser **compuesta** (tipo + número + jurisdicción), y la
  jurisdicción hoy **ni se guarda**. El razonamiento completo —y por qué esto **no** es un one-liner
  pendiente— vive en **`CLAUDE.md` → nota técnica 27**; no se duplica acá.
  > La complejidad técnica que este ítem ya anotaba (las matrículas viven en un **JSONB**
  > `[{tipo, numero}]`, hasta 5 por profesional, y un `ADD CONSTRAINT UNIQUE` no aplica) **sigue
  > siendo cierta** — pero es la razón secundaria. La principal es que la regla en sí estaba mal.
  > La columna **`matricula` (TEXT) deprecada** (nota técnica 3) queda como estaba: no se le pone
  > UNIQUE y su baja sigue sin agendarse.

- **✅ RESUELTO (migración 044 + captura en la UI, 2026-08-20) — (b) UNIQUE de DNI de profesional.**
  Este ítem advertía que **no era "agregar una UNIQUE"** sino cuatro pasos, porque la columna no
  existía. Se hicieron los cuatro:
  1. **Columna:** `profiles.dni TEXT` **NULLABLE** (los 23 perfiles existentes —10 médicos, 13
     asistentes— no tenían el dato; `NOT NULL` habría hecho fallar el ALTER).
  2. **Constraint:** `profiles_dni_key UNIQUE (dni)`, de alcance **GLOBAL** — deliberadamente lo
     opuesto a la 043. El porqué, en **`CLAUDE.md` → nota técnica 27**.
  3. **Captura en la UI:** input en el tab *Datos* de `/perfil`, **visible para los dos roles** y
     **fuera** del bloque gateado por `isMedico` donde viven matrículas y título. **No** se pide en
     el registro, para no meter fricción en el alta. Vacío se guarda **`NULL`**, nunca `''`.
  4. **Validación** en `actualizarPerfil` (7-8 dígitos, solo números, mensaje distinto por tipo de
     falla) **+ intercepto del 23505** con mensaje propio.
  - ⚠ **Sobre la advertencia de que "con NULL la UNIQUE no protege nada hasta que se cargue":** es
    cierta y **es el comportamiento buscado**. El DNI del profesional es **opcional a nivel
    producto** (la ley no lo exige; ver nota técnica 27), así que la constraint no está para forzar
    la carga sino para impedir que **dos cuentas** declaren el mismo documento.

- **✅ REGLA TRANSVERSAL YA RESUELTA POR DISEÑO — un paciente y un profesional PUEDEN compartir DNI.**
  Un asistente (o el propio médico) puede ser **también paciente** del consultorio, y eso debe seguir
  siendo posible. **Se cumple solo**, porque `pacientes` y `profiles` son **tablas separadas con
  constraints separadas**: nada las cruza.
  ⚠ **Anotado explícitamente para que nadie lo "arregle":** **no agregar un UNIQUE cruzado entre las
  dos tablas** ni un chequeo de "este DNI ya existe como profesional" al dar de alta un paciente.
  Sería romper un caso de uso válido creyendo que se previene un duplicado.

- **✅ DECISIÓN DE NEGOCIO CERRADA — un médico NO puede ser también asistente de otro médico.**
  El modelo actual asigna **un rol único por perfil** (`profiles.role ∈ {medico, asistente}` con
  `medico_id` para el vínculo) y **se decidió mantenerlo así**. **No rediseñar a roles múltiples**
  (ni tabla de roles N:M, ni array de roles, ni perfiles duplicados por persona). Queda registrado
  como decisión tomada para que no se reabra en un futuro rediseño: el costo de roles múltiples
  —RLS, `get_medico_id()`, `check_permiso()`, navegación y todos los guards— no se justifica por un
  caso que el consultorio no tiene.

- **✅ Requisitos comunes de la tanda — cumplidos.** Auditoría de duplicados **de solo lectura y
  previa** en las dos migraciones (la 043 dio 0 duplicados de `(creado_por, dni)`; la 044 no
  necesitaba una, la columna nacía vacía); flujo de migraciones del proyecto respetado —versionada en
  `supabase/migrations/` + suelta `MIGRACION-NN-…` en la raíz, **ejecución manual** en el SQL Editor y
  **verificación contra la base real**, no contra `schema.sql`—; y `schema.sql` + `src/types/roles.ts`
  actualizados al cierre. Ninguna de las dos necesitó limpieza de datos.

### Bugs menores detectados
- **✅ RESUELTO (migración 034, 2026-08-07) — un asistente DESVINCULADO no podía volver a solicitar
  vinculación con el mismo médico.** Detectado el 2026-08-06. **Síntoma:** el asistente que ya había
  estado vinculado y fue **desvinculado** volvía al onboarding, enviaba la solicitud y recibía
  **"Ya enviaste una solicitud a este médico"**, quedando **sin forma de volver a entrar** al sistema
  con ese médico. Severidad MEDIA-ALTA por impacto: el onboarding es **la puerta de entrada** de los
  asistentes y no había workaround desde la UI (se arreglaba tocando la base a mano).

  > ⚠ **La HIPÓTESIS que este ítem registraba era INCORRECTA, y conviene dejarlo escrito.** Decía que
  > la causa era que el chequeo de duplicados de `enviarSolicitud` **no filtraba por `estado`**, y
  > planteaba la constraint como un factor secundario *"a comprobar"*. Fue al revés: **la causa era la
  > constraint, no el `if`** — tanto, que el fix **no tocó una sola línea de código**.

  - **Causa raíz:** `UNIQUE(solicitante_id, medico_id)` (`010_multitenancy.sql:70`), **total y sin
    `estado`**: un par (asistente, médico) podía tener **exactamente UNA fila en toda la historia**.
    Como la fila vieja sobrevive a la desvinculación —`desvincularAsistente()` solo pone
    `profiles.medico_id = NULL` y no toca esta tabla—, el cupo del par quedaba ocupado para siempre
    por una solicitud en `'aprobada'` (o `'rechazada'`), y el segundo INSERT moría con **23505**.
  - ⚠ **La constraint nunca implementó lo que decía implementar:** el comentario de la propia 010
    (`:59`) prometía *"una sola solicitud **activa** por par"* y lo implementado fue *"una sola en la
    historia"*. La 034 no cambió la regla de negocio: **la hizo cumplir como estaba escrita**.
  - **El fix:** se dropeó la constraint total y se creó un **ÍNDICE ÚNICO PARCIAL**
    (`… WHERE estado = 'pendiente'`). ⚠ **Índice y no constraint no es preferencia de estilo:**
    Postgres **no admite constraints UNIQUE parciales** (no existe `ADD CONSTRAINT … UNIQUE (…) WHERE
    …`), la cláusula `WHERE` solo se expresa en un `CREATE UNIQUE INDEX`. Por eso el objeto vive ahora
    en `pg_indexes` y **ya no en `pg_constraint`**; a efectos de integridad son equivalentes (mismo
    SQLSTATE 23505).
  - **Cubre los DOS caminos** que necesitaban una segunda solicitud del mismo par: tras
    **desvinculación** (fila en `'aprobada'`) y tras **rechazo** (fila en `'rechazada'`, donde la UI ya
    invitaba a reintentar con "Buscar otro médico").
  - **Sin cambios de código, a propósito:** `enviarSolicitud()` sigue traduciendo el 23505 y su
    mensaje —*"Ya enviaste una solicitud a este médico"*— **pasa a ser verdadero**: a partir de acá
    solo puede chocar contra una solicitud realmente **pendiente**. `desvincularAsistente()` tampoco se
    tocó: la fila vieja se conserva como rastro de que el vínculo existió.
  - **Seguro por construcción:** se pasó de una regla **más estricta** a una **más laxa**, así que era
    imposible que los datos existentes violaran la nueva (igual se verificó: 0 pares duplicados).
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
- **✅ RESUELTO (Grupo 4, 2026-08-16) — todos los helpers de fecha unificados contra
  `formatFechaAR`.** Este ítem contaba **dos** helpers sin unificar; el censo encontró **seis
  implementaciones** (el canon + 5 duplicados), porque además de los dos anotados estaban los
  **locales de las dos plantillas PDF** (`certificado-template.tsx`, `pedido-template.tsx`), que el
  barrido por nombre no vio: se llaman `fmt*`, no `formatFecha*`.
  - **Casa única: `src/lib/utils/format-date.ts`.** `formatFechaAR(fecha, patron)` es el motor (fija
    `TZ_AR`), y se le sumaron dos wrappers finos **con `try/catch`** que degradan al string crudo:
    `formatFecha(fecha, patron = 'd MMM yyyy')` y `formatFechaLarga(fecha)`. El catch va en los
    wrappers y **no** en el motor, para no cambiarle el contrato a sus llamadores y para que un dato
    degenerado no sea un 500 en la ruta pública `/verificar`.
  - **`formatFecha` / `formatFechaLarga` salieron de `src/lib/utils.ts`** (que quedó con `cn`,
    `escapeHtml` y `sanitizePdfFilename`), y los locales de `/verificar` y de las dos plantillas PDF
    se borraron. ⚠ **Trampa del pase:** en las plantillas el helper se llamaba `formatFecha` pero
    producía el formato **largo**, así que sus 7 usos fueron a `formatFechaLarga`.
  - **Se cerraron dos formateos server-side que no eran helpers** y por eso no estaban anotados: el
    `toLocaleDateString` de los dos endpoints de consultas (texto que **se persiste** en
    `turnos.notas`) y los `format()` inline de `lib/pdf/consulta-template.tsx` y de la ficha de
    paciente. **La equivalencia se verificó A/B en runtime** bajo `TZ=UTC` y `TZ=AR`: idéntica sobre
    columnas `DATE`, corregida sobre `timestamptz`.
  - ⚠ **Sin backfill:** las notas de turnos ya escritas conservan la fecha corrida.
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
- **✅ RESUELTO (Grupo 5 — Frentes 3 y 4, 2026-08-17, sin migración) — un mensaje individual con
  `parent_id` quedaba NO LEÍDO de forma persistente… y eran DOS cosas distintas.** Re-diagnosticado
  con dos sesiones abiertas (médico + asistente), el síntoma se partió en dos, y **la causa candidata
  que este ítem proponía no era la del bug**:
  - **(a) EL BUG — la BANDEJA no encendía el indicador, aunque el badge SÍ contaba.** El badge cuenta
    **mensajes** (`contarMensajesNoLeidos` **no filtra por `parent_id`**) y la bandeja pinta
    **hilos**, pero decidía el estado del hilo mirando **una sola fila: la raíz**. `obtenerBandeja()`
    trae solo raíces (`.is('parent_id', null)`), así que el estado de lectura de las respuestas
    **nunca llegaba al cliente**: el usuario veía *"1 sin leer"* y **ninguna conversación marcada**,
    sin forma de saber cuál abrir. La fila estaba realmente sin marcar en la base, sí, pero porque
    nadie podía llegar a ella.
    - **Fix:** nueva señal **`tiene_respuestas_no_leidas`**, calculada en `obtenerBandeja()` con una
      segunda query **acotada a los ids de las raíces ya traídas** (booleana y **sin migración**: el
      criterio de "no leído" grupal es la **AUSENCIA** de fila en `mensajes_lecturas`, o sea un
      `NOT EXISTS`, y PostgREST no lo expresa como filtro de recurso embebido — un booleano calculado
      en la base habría pedido vista o función).
    - **`esNoLeido` pasa a evaluar raíz *O* respuestas, con el corte por autoría REDUCIDO a la
      raíz.** Ese corte era un `return false` que cortaba la función entera, así que un hilo que
      **yo** inicié quedaba "leído" para siempre aunque el otro respondiera — el caso más común, y el
      segundo eslabón del bug (independiente del filtro de `parent_id`).
  - **(b) La "causa candidata" de este ítem —el error tragado en silencio— resultó OBSERVABILIDAD,
    no el bug.** El marcado **funciona** en el camino feliz. Se cerró igual, porque el silencio era
    total: la rama **individual** de `marcarMensajeLeido` hacía el UPDATE **sin `.select()`**, y
    PostgREST responde `204` con cuerpo vacío, así que **0 filas afectadas era indistinguible de un
    éxito** — la misma lección que las **guardas de "0 filas"** de la migración 033. Ahora encadena
    **`.select('id')`** y devuelve el sentinel **`MARCADO_SIN_FILAS`** si no afectó ninguna fila; el
    llamador (`hilo-modal.tsx`) **captura el resultado del `Promise.all` que antes descartaba** y
    distingue **error real** (un único `toast.warning` agregado, nunca N) de **0 filas** (solo
    `console.error`: anomalía de datos que el usuario no puede accionar). Ver `CLAUDE.md` → **nota
    técnica 26**.
  - **La rama GRUPAL no se tocó:** su 0-filas es **idempotencia legítima** (`ON CONFLICT DO NOTHING`
    = *"ya estaba marcado"*) y ya inspeccionaba su `{ error }`; instrumentarla habría dado **falsos
    positivos**. Es el mismo camino que ya se había arreglado con el `ignoreDuplicates` del ítem del
    badge; este síntoma era del `UPDATE leido = true`, que es el otro camino.
  - ⚠ **En uso normal NO aparece ningún aviso nuevo:** re-marcar un mensaje ya leído **afecta 1
    fila** (el UPDATE no filtra por `leido = false`), así que el 0-filas es prácticamente inalcanzable
    salvo deriva de RLS o dato inconsistente.
- **⚠ LIMITACIÓN CONOCIDA (2026-08-03) — el deep-link no abre hilos fuera de las 100 conversaciones
  más recientes. Severidad MUY BAJA.** `obtenerBandeja()` trae los mensajes raíz con **`.limit(100)`**
  (`src/app/(app)/mensajes/actions.ts:46`), y `bandeja.tsx` resuelve el `?hilo=X` buscando **dentro
  de esa lista**. Si el hilo no está, el modal **simplemente no abre** — no crashea ni rompe la
  página. **Se decidió no implementar un fetch puntual:** pedía una server action nueva, estado
  async, spinner y manejo de "no existe / sin permiso", demasiada superficie para un caso hoy casi
  inalcanzable desde la campanita, que solo lista mensajes **no leídos** (recientes por definición).
  Si algún día se agrega búsqueda de mensajes o el volumen crece, revisarlo junto con paginar la
  bandeja.
  - **Re-confirmada como FUERA DE ALCANCE en el Grupo 5 (2026-08-17).** La tanda del indicador de
    no-leído cruzó las dos caras de esta limitación y **no tocó ninguna**: ni el `.limit(100)` ni el
    **orden por `created_at` de la RAÍZ** (un hilo con una respuesta nueva **no sube** en la lista).
    La señal `tiene_respuestas_no_leidas` se calcula **sobre las raíces que la bandeja ya trajo**, así
    que **hereda esta cota** en vez de ensancharla. Sigue abierta.
- **✅ NO REPRODUCIBLE / YA ESTABA RESUELTO (Grupo 5 — Frente 2, verificado en navegador 2026-08-17)
  — el LOGO del emisor SÍ se renderiza en los previews de pedido y de certificado.** El ítem se
  abrió el 2026-08-03 y quedó vivo **por inercia**: se había resuelto en una tanda anterior y nadie
  lo cerró. **No hubo cambio de código en este frente.**
  - **Verificación:** el logo se ve correctamente **en el preview HTML y en el PDF**, y una consulta
    al **`emisor_snapshot`** del documento confirmó que está **bien guardado** (data-URI válido).
  - **La hipótesis principal del ítem quedó descartada con dato, no con teoría:** no era el congelado
    de la **regla de negocio 11** mostrando un snapshot sin logo — el snapshot **tenía** el logo.
  - Lo que el ítem dejó verificado y **sigue siendo cierto**: la ruta de datos es **simétrica** entre
    logo y firma (`lib/pdf/documentos.ts` **selecciona y guarda los dos**; las páginas de detalle los
    leen igual, `medicoFirma={emisor?.firma_url ?? null}` / `medicoLogo={emisor?.logo_url ?? null}`),
    que era justamente la razón por la que un bug de render era poco probable.
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
- **✅ RESUELTO (2026-08-07, commit `57032ed`) — al editar un turno creado desde la HC, el campo
  "Paciente" arrancaba VACÍO.** Severidad BAJA, **PREEXISTENTE** (detectado al verificar T4; no lo
  causaron las tandas de tipos, que solo tocaron anotaciones). Se abría un turno con
  `origen: 'desde_hc'` y el buscador de paciente aparecía en blanco, **aunque el calendario sí mostraba
  el nombre** en el evento. El `paciente_id` nunca se perdía, así que era cosmético/confuso, no
  destructivo.
  - **Causa:** `turno-form.tsx` sembraba el buscador **solo** desde `initialData.paciente_nombre_libre`
    y **nunca leía `initialData.paciente.nombre_completo`**, que es el campo que trae el join de
    `GET /api/turnero` (`.select('*, paciente:paciente_id (id, nombre_completo)')`).
  - **Fix aplicado — exactamente el "fix natural" que este ítem proponía**, en
    `src/components/turnero/turno-form.tsx:170`, con el porqué comentado arriba (`:165-169`):
    `setSearchTerm(initialData.paciente_nombre_libre ?? initialData.paciente?.nombre_completo ?? '')`.
    La precondición de tipos ya estaba cumplida desde T4/T5 (`TurnoConPaciente`).
  - ⚠ **Sigue vigente el hecho que lo originaba, y conviene no perderlo:** los turnos `desde_hc` se
    insertan desde los endpoints de consultas con **`paciente_id` y SIN `paciente_nombre_libre`**
    (`api/consultas/route.ts` y `api/consultas/[id]/route.ts`). Eso **no cambió** —y es correcto: el
    dato canónico es el `paciente_id`, duplicar el nombre lo desactualizaría—; lo único que cambió con
    el Grupo 1 es **cuándo** se ejecuta ese insert (solo al finalizar la consulta, ver `CLAUDE.md` →
    nota técnica 22). Quien toque esos inserts tiene que saber que este fix asume esa forma.
- **💡 MEJORA DE UX (2026-08-04, NO es un bug) — los turnos médicos no muestran el motivo en el
  evento del calendario.** El dato **se guarda bien**; simplemente no se pinta: el evento de un
  turno médico muestra hora + nombre del paciente, y el `motivo` queda solo dentro del modal. Sería
  una mejora mostrarlo **cuando la altura del evento lo permita**, como ya hacen los **bloqueos** con
  su descripción. Es **funcionalidad nueva**, no una regresión: entra por diseño (ver `DESIGN.md` →
  categorías del turnero y `.fc-event-*`), decidiendo umbral de altura y truncado.
- **✅ RESUELTO (2026-08-07, commits `9a291f2` + migración 035) — la obra social NO se mostraba cuando
  estaba cargada como texto libre (`obra_social_otro`). Severidad MEDIA. PREEXISTENTE y SISTÉMICO.**
  No rompía nada crítico, pero **ocultaba un dato clínico-administrativo relevante** en varios
  formularios y documentos.
  - **Síntoma:** al buscar y seleccionar un paciente en el formulario de **pedidos** o de
    **certificados**, el **número de afiliado sí aparece** pero la **obra social queda vacía** — solo
    para los pacientes cuya obra social está en `obra_social_otro`. Con una obra social del catálogo
    (`obra_social_id`) se muestra bien.
  - **Caso verificado contra la base:** el paciente de prueba **Paula Zavaleta**
    (`be0db45c-8fbd-44da-8e9a-fa3b8d44937f`) tiene `obra_social_id: null`,
    `obra_social_otro: 'IOSEP'`, `numero_afiliado: '6545'`. Afecta a **todo** paciente cargado con
    obra social "otra", no es un caso aislado.
  - **Causa raíz — DOS eslabones, los dos hay que tocar:**
    1. **El dato ni siquiera llega al front.** `GET /api/pacientes?q=`
       (`src/app/api/pacientes/route.ts:48`) proyecta
       `id, nombre_completo, dni, fecha_nacimiento, obra_social_id, numero_afiliado, telefono, email,
       obras_sociales ( nombre )` — el join por `obra_social_id`, **pero NO incluye
       `obra_social_otro`**.
    2. **Los componentes no contemplan el fallback:** leen solo `p.obras_sociales?.nombre`, sin caer
       a `obra_social_otro`.
  - **PREEXISTENTE — ninguna tanda de tipos lo introdujo.** La tanda **T5** (que tipó el buscador con
    `PacienteBusqueda`) solo lo **hizo visible** al verificarla en el navegador: el comportamiento es
    **idéntico** al de antes, y el `.select` del endpoint no lo tocó ninguna tanda.
  - **✅ El patrón correcto YA EXISTE en el repo — no hay que inventarlo, hay que replicarlo.**
    Varias superficies ya hacen exactamente el fallback que falta:
    | Ya correcto | Dónde |
    |---|---|
    | `os?.nombre ?? (p.obra_social_otro?.trim() \|\| null)` | `api/difusion/destinatarios/route.ts:55` — **el ejemplo canónico**: su `.select` (`:40`) sí trae `obra_social_otro` |
    | `p.obras_sociales?.nombre ?? p.obra_social_otro ?? …` | `pacientes/patient-table.tsx:45` y `:134` |
    | ídem | `(app)/pacientes/[id]/page.tsx:63-64` |
    | ídem | `(app)/pacientes/[id]/historia/page.tsx:70` (su select incluye `obra_social_otro`) |
    | ídem | `api/pacientes/[id]/historia/pdf/route.ts:78` (ídem) |
  - **Superficies AFECTADAS (inventario verificado, 2026-08-05):**
    | Afectado | Detalle |
    |---|---|
    | `pedidos/pedido-form.tsx:104` | `setValue('obra_social_nombre', p.obras_sociales?.nombre ?? null)` |
    | `certificados/certificado-form.tsx:101` | idéntico — mismo patrón copiado |
    | **`dashboard/recent-patients.tsx:17` + `:48`** | ⚠ **caso INDEPENDIENTE que conviene arreglar junto**: es un Server Component con **su propio `.select`**, que tampoco trae `obra_social_otro`, y muestra `'—'`. **No pasa por el endpoint**, así que el fix del punto 1 no lo alcanza: hay que tocar su select y su render por separado. |
  - **NO afectado (verificado):** el **turnero no muestra obra social** en ninguno de sus componentes
    (`grep` sobre `src/components/turnero/` → 0 resultados), así que **turnos queda fuera del fix**.
    Los PDF de pedido/certificado (`pedido-pdf.tsx:265`, `certificado-pdf.tsx:271`) leen
    `obra_social_nombre` **ya resuelto y persistido en el documento**, así que se arreglan solos en
    cuanto el formulario lo mande bien (⚠ los documentos **ya emitidos** conservan el valor vacío:
    el snapshot es inmutable por regla de negocio 5 — no hay backfill).
  - **✅ DECISIONES DE PRODUCTO TOMADAS:**
    1. **`obra_social_otro` es intencional y se queda.** El texto libre para obras sociales fuera de
       la lista **no se elimina**: es la vía de escape legítima cuando el catálogo no la tiene.
    2. **Todo formulario que muestre obra social debe mostrarla también si vino como
       `obra_social_otro`**, no solo la del catálogo. Aplica a pedidos, certificados y cualquier
       formulario futuro.
    3. **IOSEP debería estar en el catálogo** (es común en la zona del consultorio) y hoy **falta** —
       por eso quedó cargada como texto libre. **Cargarla es una acción SEPARADA** (ver Capa 2, en
       "Datos / catálogo"), y **no reemplaza al fix de código**.
  - **── CAPA 1 — ✅ RESUELTA (2026-08-07, commit `9a291f2`) ──** Se ejecutaron los tres pasos, y las
    **dos ediciones que iban juntas** (select + tipo) entraron en el mismo commit:
    1. **Endpoint:** `GET /api/pacientes?q=` ahora proyecta `obra_social_otro`.
       (`GET /api/pacientes/[id]` no necesitó cambio: su `select('*, …')` ya lo traía.)
    2. **Tipo:** `PacienteBusqueda` (`src/types/paciente.ts`) incluye el campo — pasó de **8 a 9
       campos** + el join. Ver `CLAUDE.md` → Mapa de tipos.
    3. **Componentes:** el fallback se aplicó en `pedido-form.tsx`, `certificado-form.tsx` y
       `dashboard/recent-patients.tsx` (select **y** render, que iba por su cuenta).
    - **Se implementó con `.trim()`**, algo más robusto que el fallback propuesto acá: un
      `obra_social_otro = '   '` ya **no** gana sobre el `null`, siguiendo el ejemplo canónico de
      `api/difusion/destinatarios/route.ts`.
    - **De paso cerró el "hallazgo relacionado":** la copia duplicada `PacienteSugerido` de
      `certificado-form.tsx` se unificó con **`PacienteBusqueda`** y la interface se borró.
    - ⚠ **LO QUE NO CIERRA, y sobrevive:** la **tarjeta de preview** de `pedido-form.tsx` sigue sin
      mostrar la obra social — es otro eslabón, no lo tapa este fix. Ver el ítem propio más abajo.
  - **── CAPA 2 — el dato del catálogo ──** ✅ **IOSEP cargada** (migración 035); el resto sigue
    abierto: ver "Datos / catálogo" → *"Faltan obras sociales de la zona en el catálogo (IOSEP)"*.
    ⚠ **Las dos capas eran necesarias:** cargar IOSEP **no arregla** a los pacientes ya guardados como
    "otra" (dependían de la Capa 1), y la Capa 1 **no evita** que se sigan cargando obras sociales
    comunes como texto libre.
  - ⚠ **SIGUE VIGENTE — los documentos YA EMITIDOS conservan el valor vacío.** `obra_social_nombre` se
    persiste en la fila del pedido/certificado al emitir y **el snapshot es inmutable** (regla de
    negocio 5): **no hay backfill**. El fix solo alcanza a los documentos emitidos de acá en adelante.
- **✅ RESUELTO (Grupo 4, 2026-08-16) — la TARJETA DE PREVIEW de `pedido-form.tsx` ya muestra la obra
  social.** Se aplicó el fix que este ítem proponía: **se ensanchó el `Pick`**. `PacienteElegido`
  (`pedido-form.tsx:33-36`) pasó a llevar `obras_sociales` y `obra_social_otro` en vez de
  `obra_social_id`, que era lo que no servía para pintarla.
  - **La tarjeta resuelve con el helper compartido:** `obraSocialElegida = resolverObraSocial(...)`
    (`pedido-form.tsx:141`), así que muestra tanto la del catálogo como la de texto libre con el mismo
    criterio que el resto de la app.
  - ✅ **La sospecha del último bullet se confirmó y se cerró:** `certificado-form.tsx` tenía la misma
    tarjeta con el mismo recorte, y quedó igual (`:121`).
- **✅ RESUELTO (Grupo 5 — Frente 1, migración 041, 2026-08-17) — la HORA del próximo control no se
  persistía: se perdía y caía a las 09:00.** Era un límite del **modelo**, no del formulario.
  - **Causa:** `consultas.proximo_turno_sugerido` era **`DATE`**, no `timestamptz`, así que la base
    guardaba `2026-08-20` y **la hora se descartaba**. `consulta-detail.tsx` sembraba la hora con
    `proximo_turno_sugerido.split('T')[1]`; como el valor guardado **no tenía `T`**, caía al default
    **`'09:00'`**. El caso concreto: elegías **14:00**, guardabas borrador, y al **finalizar más
    tarde** el turno se agendaba a las **09:00**, en silencio.
  - ⚠ **PREEXISTENTE, pero MÁS VISIBLE desde el Grupo 1:** antes el turno se creaba en el mismo
    request en que se elegía la hora, así que la pérdida casi no se notaba. Desde que **el turno se
    crea solo al finalizar** (`CLAUDE.md` → nota técnica 22), **agendar y elegir la hora son momentos
    distintos** y el desfase quedó a la vista.
  - **Fix (1) — migración `041`:** la columna pasó de `DATE` a **`timestamptz`**. **Sin backfill**:
    las filas existentes eran data de prueba, así que no hubo que decidir a qué hora anclar una fecha
    que nunca tuvo hora.
  - **Fix (2) — el sembrado del formulario:** corregido con **`parseFechaHoraAR`** (nuevo — ancla la
    hora de PARED argentina al instante correcto) y **`formatFechaAR`** (para releerla en zona AR).
    Ver `CLAUDE.md` → **nota técnica 25**.
  - **Limpieza de arrastre:** se eliminó el helper local `fmtDate` de la plantilla PDF de consulta
    —repartido entre `formatFechaLarga` y `fmtFecha`— y la prop **`mode`** muerta de `ConsultaForm`
    (que era el tercer punto del ítem del "nudo de tipos"; ver Bloque A → *Lint preexistente*).

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
- **✅ VERIFICACIÓN DE L3c — CONFIRMADA (2026-08-05).** Quedaba comprobar en runtime que un error **de
  la base** llega al usuario con el **mensaje detallado** y no con el fallback genérico: el
  `mensajeDeError` de `perfil/actions.ts` hace **duck-typing sobre `.message`** porque supabase-js sin
  `.throwOnError()` devuelve un **objeto plano**, no una instancia de `Error`, y un `instanceof Error`
  ahí **compilaría igual y fallaría en silencio**. Era razonamiento, no evidencia.
  - **Cómo se forzó:** con un cambio local temporal de **una línea** en `actualizarPerfil` — agregar
    una **columna inexistente** al `.update()`, que hace que PostgREST responda **400 (PGRST204)** con
    cuerpo JSON. Elegido sobre una violación de constraint real porque **no puede escribir nada**
    (PostgREST rechaza el PATCH entero antes de que Postgres vea una sentencia) y ejercita **la misma
    rama** de `postgrest-js` (`PostgrestBuilder.ts:203`, `error = JSON.parse(body)`) que cualquier
    error de base.
  - **Resultado:** el toast mostró el **mensaje crudo de PostgREST**, no el genérico. **El
    duck-typing funciona**; el narrowing no está roto.
  - ⚠ **Descubrimiento del diagnóstico previo, que explica por qué no se había podido forzar antes:**
    desde la UI de `/perfil` **no hay forma** de provocar un error de base. `profiles` **no tiene
    ninguna UNIQUE** más allá de la PK, su único CHECK (`role`) está sobre una columna que ninguna de
    las 6 funciones escribe, las validaciones de la app son un **superconjunto** de los `NOT NULL`
    alcanzables, y una **denegación de RLS en UPDATE no produce error** (filtra filas). No era falta
    de búsqueda: no existía el camino.
  - **Consecuencia para el plan:** esto **destraba** la tanda *"mensajes de error propios"*, que
    estaba explícitamente bloqueada detrás de esta verificación (*"verificar L3c primero"*).
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
  > **Epílogo (2026-08-05):** de esos 21, **13 eran el bloque "tipos de dominio"** y quedaron
  > cerrados por las tandas **T1–T6** (ver el ítem que sigue). Restaban **8**.
  > **Epílogo final (2026-08-06):** esos 8 los cerró la serie **"lint a 0"** (5 sub-tandas). **El lint
  > del proyecto quedó en CERO** — ver el ítem 🏁 más abajo.
- **✅ RESUELTO (bloque TIPOS DE DOMINIO, tandas T1–T6, 2026-08-05) — 21 → 8 problemas (−13).**
  Lo que el hito de L4 había apartado como *"trabajo de otra naturaleza"*: **no se arreglaba con
  anotaciones, había que crear o aplicar tipos que modelaran las proyecciones reales de la API.**
  Se ejecutó en **seis tandas**, cortadas por afinidad de tipo y de verificación —no por archivo—,
  de menor a mayor riesgo:

  | Tanda | Qué hizo | Verificación | Conteo |
  |---|---|---|---|
  | **T1** | `getTenantMedicoId(supabase: any)` de `pacientes/[id]/route.ts` → **`Awaited<ReturnType<typeof createClient>>`**, el patrón que ya usaban **8+ handlers**; era el único outlier | `tsc` | 21 → **20** |
  | **T2** | los 2 `(profile as any)[permisoRequerido]` de `consultas/route.ts` y `consultas/[id]/route.ts` → tipo local **`PermisosProyectados`** + `permisoRequerido: PermisoProyectado` + **`.single<ProfileTenantRow>()`** | `tsc` | 20 → **18** |
  | **T3** | **`BloqueoAgenda`** (tipo que **ya existía** desde siempre) aplicado en `calendar-view.tsx` y `block-slot-modal.tsx` — no hubo que crear nada | `tsc` + humo | 18 → **16** |
  | **T4** | creado **`TurnoConPaciente`**; el estado `selectedEvent` del calendario pasó a **unión discriminada** `{ type: 'turno'; raw: TurnoConPaciente } \| { type: 'bloqueo'; raw: BloqueoAgenda }` | **navegador** | 16 → **13** |
  | **T5** | creado **`PacienteBusqueda`**, aplicado en `turno-form.tsx` y `pedido-form.tsx` (eliminando el tipo local incompleto `PacienteSugerido`, que era la causa de 2 casts) + tipado el `initialData` de `turno-form` como `TurnoConPaciente` | **navegador** | 13 → **9** |
  | **T6** | creado **`TurnoParaRecordatorio`** para el cron, aplicado con **`.overrideTypes<TurnoParaRecordatorio[], { merge: false }>()`** | `tsc` | 9 → **8** |

  **`tsc`, `build` y `lint` limpios en las seis**, con **cero problemas nuevos** confirmado por
  comparación programática **por (archivo, regla)** —no por línea— en cada una.

  **Los 3 tipos nuevos y el endpoint que modela cada uno:**

  | Tipo | Archivo | Modela |
  |---|---|---|
  | `TurnoConPaciente` | `types/turno.ts` | `GET /api/turnero` → `*, paciente:paciente_id (id, nombre_completo)` |
  | `TurnoParaRecordatorio` | `types/turno.ts` | cron de recordatorios → `*, paciente:paciente_id(nombre_completo, email, telefono)` |
  | `PacienteBusqueda` | `types/paciente.ts` | `GET /api/pacientes?q=` → 8 campos + `obras_sociales ( nombre )` |

  > ⚠ **(a) `TurnoConPaciente` y `TurnoParaRecordatorio` son DOS tipos a propósito — no unificarlos.**
  > Son **proyecciones distintas de la misma relación**: el turnero embebe `id + nombre_completo`
  > (para navegar a la ficha) y el cron embebe `nombre_completo + email + telefono` (para enviar el
  > recordatorio). **Ninguno es subconjunto del otro** — en el cron **no llega el `id`** y en el
  > turnero **no llegan los datos de contacto**—, así que reusar uno en lugar del otro **prometería
  > campos que la query no trae**. Es el caso testigo de la regla general: **el shape del embebido lo
  > fija cada endpoint, no la tabla.**

  > ⚠ **(b) T2 usa `PermisosProyectados`, NO `PermisoKey` — y esto se verificó, no se supuso.** El
  > `select` del helper proyecta **11 de los 12** permisos: **falta `acceso_mensajeria`**. Con
  > `PermisoKey` (las 12 claves) se podría pedir un permiso **que la query no trajo**, el chequeo
  > leería `undefined` y **denegaría el acceso en silencio** — un bug con apariencia de permiso mal
  > configurado. Por eso el tipo es `Omit<PermisosAsistente, 'acceso_mensajeria'>` y el parámetro es
  > `keyof` de eso. **Comprobado empíricamente:** al pasar `'acceso_mensajeria'` a propósito, `tsc`
  > lo rechaza enumerando las 11 claves válidas. **Si algún día hace falta ese permiso acá, se agrega
  > al `select` (cambio de runtime); no se ensancha el tipo.**

  **De paso, cerró dos cosas que venían anotadas:** el `initialData?: any` de `turno-form.tsx`
  (pendiente que T4 no pudo tocar por alcance, cerrado en T5) y el tipo local **incompleto**
  `PacienteSugerido` de `pedido-form.tsx`, cuya desalineación con el endpoint era **la causa** de sus
  2 casts — no un descuido de estilo.
- **🏁 ✅ RESUELTO (serie "lint a 0", 2026-08-06) — los 8 problemas preexistentes que quedaban. EL
  LINT DEL PROYECTO ESTÁ EN CERO.** `npm run lint` no imprime **nada**: ni errores, ni warnings, ni la
  línea de resumen. Recorrido completo del proyecto: **96** (antes de la tanda 1A) → 8 (tras T6) →
  **0**. Se hizo en **5 sub-tandas**, cortadas por naturaleza del cambio y por cómo se verifica cada
  una:

  | Sub-tanda | Qué cerró | Naturaleza | Verificación |
  |---|---|---|---|
  | **1** | **A2** (`verificar/[codigo]/page.tsx:41`) + **A6** (`perfil-form.tsx:50`) | Tipado mecánico | `tsc` |
  | **2** | **A4 + A5** (`historia-clinica-form.tsx`) | **Borrado de código muerto** | build (nada lo importaba) |
  | **3** | **A1** (`perfil/page.tsx:34`) + **A3** (`notificaciones/list.tsx:19`) | Diseño de tipos | `tsc` |
  | **4** | **B1** (`onboarding-client.tsx:44`) | Estado derivado en render | **navegador** |
  | **5** | **B2** (`calendar-view.tsx:47`) | `useSyncExternalStore` | **navegador (móvil + desktop)** |

  - **Sub-tanda 1 — tipado mecánico.** **A6:** `TITULOS_DISPONIBLES.includes(value as any)` →
    `(TITULOS_DISPONIBLES as readonly string[]).includes(value)` — el cast se movió **del valor al
    array**, que es lo que lo hace seguro. ⚠ **No confundir con el precedente de L3b**, donde un
    `as any` sobre ese mismo array se **borró** por redundante: ahí el valor ya era de la unión
    correcta; acá es `string`, más ancho, y borrarlo a secas **no compila**. **A2:**
    `formatMatriculas` pasó de `any` a **`unknown`** con **type-guard real por elemento** (antes el
    `.map((m: Matricula) => …)` **prometía** la forma sin chequearla), y se blindó para aceptar
    `numero` como **string O number** (es JSONB sin constraint).
    ⚠ **NO FUE SOLO LIMPIEZA DE TIPOS — fue un fix de robustez sobre una ruta PÚBLICA:** la versión
    original **lanzaba una excepción** (`TypeError: Cannot read properties of null`) si el array JSONB
    traía un elemento `null`, o sea un **500 en la página pública de verificación de documentos**. El
    type-guard lo cierra. Se verificó la equivalencia ejecutando las versiones lado a lado: para
    arrays bien formados el output es **byte a byte idéntico**, separador `'  |  '` incluido.
  - **Sub-tanda 2 — se borró el vestigio del modelo VIEJO de historia clínica.** Cuando la HC era un
    **documento fijo** sobre la tabla `historia_clinica`; el modelo cambió a **"conjunto de
    consultas"** (tabla `consultas`), que es la HC viva en `.../[id]/historia`. Se borraron
    `components/pacientes/historia-clinica-form.tsx` (390 líneas, **cero importadores**, verificado
    por 5 vías incluidas dinámicas y barrels) y el **stub de ruta fantasma**
    `(app)/pacientes/[id]/historia-clinica/page.tsx` (48 bytes, `return null`, sin un solo enlace), y
    se quitó la entrada `'historia-clinica'` del diccionario de `breadcrumb.tsx` — **conservando
    `historia`**, la de la ruta viva. **NO se tocó** la tabla `historia_clinica`, ni
    `historia.schema.ts`, ni los Route Handlers: siguen en uso.
  - **Sub-tanda 3 — diseño de tipos.** **A1:** se **exportó** la interface `Asistente` de
    `perfil-form.tsx` y se anotó `let asistentes: Asistente[] = []`. **Solo anotación**, a propósito:
    la deduplicación contra `obtenerAsistentes()` quedó como tanda aparte (ver pendientes de abajo).
    **A3:** se crearon **`SolicitudPendientePayload`** y el type-guard **`esPayloadSolicitud`** en
    `types/notificacion.ts`, se reemplazó el tipo local `NotificationItem` (con `payload: any`) por
    **`ItemPendiente`** del barrel, y el guard estrecha el payload antes de leer `.id`. De paso el
    literal `'solicitud'` pasó a la constante **`ITEM_TYPE_SOLICITUD`**. Sin cambio observable — y con
    una mejora en datos degenerados: un payload `null` **crasheaba el render** y ahora no.
  - **Sub-tanda 4 — B1, el debounce del onboarding.** La visibilidad de los resultados se **deriva en
    render** (`const resultadosVisibles = queryValida ? resultados : []`) en vez de vaciar el estado
    desde el efecto; el efecto quedó **solo agendando el timer**, conservando el guard que evita
    disparar una búsqueda por tecla. ⚠ **Cambio de comportamiento menor, decidido y aceptado:** al
    re-buscar tras bajar de 3 caracteres ahora se ve brevemente **la lista vieja** en vez de un
    destello de "no se encontraron médicos" (mejor UX). **El requisito se cumple**: al bajar de 3
    caracteres la lista desaparece.
  - **Sub-tanda 5 — B2, `useIsMobile`.** Migrado de `useState + useEffect` a
    **`useSyncExternalStore`** (React 19), el patrón canónico para suscribirse a un `MediaQueryList`.
    `getServerSnapshot` devuelve `false` y React lo usa **en SSR y también en la hidratación**, así que
    **no hay mismatch** y la secuencia de valores es idéntica a la anterior. El parámetro `breakpoint`
    se mantuvo parametrizado. **`editable={!isMobile}` —del que cuelga el drag/resize (H2)— recibe el
    mismo valor en el mismo momento que antes.**
    - ⚠ **Ajuste que destapó el fix:** apareció un warning de desarrollo **"flushSync was called from
      inside a lifecycle method"** en el efecto del `changeView`. **`api.changeView()` usa `flushSync`
      internamente**, y con la nueva semántica de scheduling la llamada podía caer mientras React
      todavía renderizaba. Se **difirió a `queueMicrotask`** con flag de cancelación en el cleanup.
      Verificado en vivo: warning desaparecido, la vista cambia bien en desktop, móvil y transición, y
      el drag/resize sigue intacto. **El aprendizaje quedó en `CLAUDE.md` → nota técnica 21**, porque
      aplica a cualquier llamada imperativa a la API de FullCalendar.

- **✅ RESUELTO (2026-08-07) — deduplicar `/perfil` contra `obtenerAsistentes()`.** La página
  `(app)/perfil/page.tsx` mantenía una **consulta inline** (perfil + enriquecido con
  `admin.auth.admin.getUserById`) mientras la action `obtenerAsistentes()` **declaraba exactamente el
  mismo shape** y tenía **cero consumidores**. Ahora la página **consume la action**
  (`perfil/page.tsx:43`) y esa duplicación desapareció. Se hizo con verificación en vivo —listar
  asistentes, cambiar permisos, desvincular—, que era la razón por la que la sub-tanda 3 lo había
  dejado en "solo anotar".
  - **La interface `Asistente` se MUDÓ** de `perfil-form.tsx` a **`src/types/roles.ts`**: dejó de ser
    un tipo de componente para ser un tipo de dominio, que es lo que permitió apoyar a las dos puntas
    en la misma forma. Registrado en `CLAUDE.md` → Mapa de tipos.
  - ✅ **También se cerró el sub-ítem:** **`SolicitudPendientePayload`** reemplazó el **tipo anónimo**
    que `obtenerSolicitudesPendientes()` declaraba inline en su firma de retorno
    (`app/onboarding/actions.ts:285`), cerrando el círculo **productor ↔ consumidor**: ahora los dos
    lados nombran la misma forma.

- **✅ RESUELTO (2026-08-11) — `POST /api/pacientes/[id]/historia` se dio de baja, y la tabla
  `historia_clinica` quedó DORMIDA.** El endpoint estaba **sin ningún llamador** (su único consumidor
  era el formulario de HC vieja que borró la sub-tanda 2, commit `3104d75`), pero seguía **vivo y
  alcanzable por HTTP directo**, donde escribía en la agenda. La **decisión de producto** que este
  ítem dejaba abierta se tomó: **la funcionalidad de antecedentes se discontinúa**, y la baja se hizo
  **reversible** — se borró el código, **no** los datos.
  - **Qué se borró (solo código de aplicación, sin migración):**
    `src/app/api/pacientes/[id]/historia/route.ts` (el POST huérfano),
    `src/lib/validations/historia.schema.ts` (su validador, que por eso dejó de estar acompañado) y
    los tipos `HistoriaClinica` / `Insert` / `Update` de `src/types/pedido.ts` (que **ya tenían cero
    consumidores**, verificado por grep con límite de palabra).
  - **Qué se modificó:** `POST /api/pacientes` **dejó de insertar la fila vacía** (era lo único que
    seguía escribiendo en la tabla), más los comentarios del barrel `types/index.ts` y las menciones
    de `CLAUDE.md` (tabla del modelo de datos, reglas 1 y 9, mapa de tipos).
  - ⚠ **La tabla NO se dropeó, a propósito.** Conserva sus filas históricas por la conservación de la
    HC (**Ley 26.529**). Queda **sin lectores ni escritores** en la app: es el estado "dormida", no
    "eliminada". Sus 4 políticas RLS, su trigger y su índice siguen en pie.
  - **Lo que la baja cerró de paso — el endpoint escribía en la AGENDA.** Además del upsert sobre
    `historia_clinica`, sincronizaba turnos a partir de `historia_clinica.proximo_control`:
    **insertaba**, **actualizaba** y **borraba con admin client (bypass RLS)** turnos con
    `origen = 'desde_hc'`, `estado = 'pendiente_confirmar'` y **`consulta_id` NULL** — sin chequeo de
    solapamiento. Como `turnos_consulta_id_unico` (mig. 038) es un índice **PARCIAL**
    (`WHERE consulta_id IS NOT NULL`), esos turnos **quedaban fuera de la garantía de unicidad**: era
    el único camino que podía volver a meter turnos en la agenda sin colgar de una consulta
    finalizada, o sea reintroducir por otra puerta el problema que el Grupo 1 cerró (`CLAUDE.md` →
    nota técnica 22). **Ese camino ya no existe.**
  - ⚠ **`origen: 'desde_hc'` NO se tocó y NO es residuo** — lo escribe el flujo vivo de consultas
    (`api/consultas/route.ts` y `api/consultas/[id]/route.ts`) al finalizar una consulta. Se relevó
    explícitamente antes de la baja: no quitarlo del enum, ni del schema Zod, ni del CHECK.
  - **Si alguna vez se recupera la funcionalidad de antecedentes:** los **6 campos** que esa tabla
    modela (patológicos, quirúrgicos, hábitos tóxicos, actividad física/laboral, perímetro de
    cintura) **no tienen equivalente en `consultas`**, y tanto el formulario como el endpoint, el
    schema y los tipos están en el **historial de git**.
  - ✅ **CERRÓ DE RAÍZ la atribución del actor en el borrado con admin client.** La migración **040**
    (auditoría de DELETE) dejó una **red de seguridad** en la rama DELETE de `log_turno_cambio`:
    `COALESCE(auth.uid(), OLD.agendado_por)`, porque `usuario_id` es NOT NULL y un borrado por
    service_role no tiene `auth.uid()`. Esa red **atribuye el borrado a quien AGENDÓ el turno**, no a
    quien lo borró — y su encabezado señalaba como raíz pendiente *"que `POST /api/pacientes/[id]/
    historia` deje de borrar con admin client"*. **Ese endpoint era el ÚNICO que borraba turnos con
    admin client en todo el repo, y ya no existe**, así que la raíz quedó cerrada por eliminación:
    hoy todo borrado de turnos pasa por el cliente de sesión y `auth.uid()` resuelve.
    ⚠ **La red de seguridad se conserva** (es correcta como defensa), pero ya no hay ningún camino
    conocido que la active. ⚠ **El comentario de la migración 040 quedó desactualizado** y **no se
    toca**: las migraciones son historia aplicada. La verdad vive acá.
  - ⬜ **Queda abierto (auditoría de datos, NO de código) — reducido a UNA consulta.** Sobre
    `historia_clinica` **ya está confirmado que los datos son de prueba** (ver la nota de decisión en
    "Agenda y RLS"), así que esa parte se cierra. Lo que **sí** sigue sin verificar es si quedaron
    **turnos huérfanos** de cuando el endpoint tenía UI:
    `SELECT count(*) FROM turnos WHERE origen='desde_hc' AND consulta_id IS NULL;` — un `SELECT` de
    solo lectura. ⚠ Si devuelve filas, **están en la agenda real del médico** y su limpieza se decide
    con él, no por criterio técnico.
- **✅ RESUELTO (T1, T2 y T6) — los 4 `any` de Route Handlers que NO eran de `catch`.** Quedaron
  deliberadamente afuera de L1 por ser diseño de tipos, y se cerraron en el bloque de tipos de
  dominio: los 2 `(profile as any)[permisoRequerido]` de `consultas` (**T2**), el
  `(t.paciente as any).nombre_completo` del cron (**T6**) y el `getTenantMedicoId(supabase: any)` de
  `pacientes/[id]` (**T1**).
  ✅ **RESUELTO (Grupo 4, 3 tandas, 2026-08-16) — el helper de tenant se extrajo a
  `src/lib/auth/tenant.ts`.** Lo que este ítem anotaba como *"duplicado inline en ~14 endpoints"* era
  en realidad **más grande**: el censo encontró **33 sitios de resolución en ~26 archivos**, y no una
  sino **dos responsabilidades mezcladas** (resolver tenant / autorizar por permiso). Se cerró en tres
  tandas, cortadas por eso:
  - **Tanda 1 — `resolverTenant` + `tenantDeProfile`:** los **20 sitios que resuelven tenant SIN
    chequear permiso** (Route Handlers, Server Components y Server Actions). `tenantDeProfile` es la
    variante **pura**, para los llamadores que ya leyeron el `profile` por otro motivo y no deben
    pagar una segunda query.
  - **Tanda 2a — `resolverAcceso`:** los sitios que resuelven tenant **y** chequean permiso
    (`consultas`, `estudios`, PDFs). Devuelve un **resultado discriminado** en vez de `null`, para que
    el llamador distinga *"sin permiso"* de *"sin tenant"*. De paso, **`lib/utils/verificar-permiso.ts`
    se reimplementó como wrapper fino sobre el canon**, sin tocar su firma ni sus llamadores.
  - **Tanda 2b — OR + turnero:** `resolverAcceso` pasó a aceptar **un permiso o un array** (alcanza
    tener cualquiera) y se migraron los **7 sitios de `api/turnero/*`**, normalizando de paso su
    criterio `permiso === false` a **fail-closed**. El GET de la agenda pasó a pedir
    **`ver_turnos` OR `gestionar_turnos`**, que es lo que la RLS ya exigía desde la 039.
  - **Ninguna resolución de tenant o permiso quedó a mano en `src/app/api/`.** Ver `CLAUDE.md` →
    nota técnica 24.
- **✅ RESUELTO (T3, T4 y T5) — el "grupo (C)" del turnero (7 `any` de datos de dominio).** Al
  diagnosticarlo se vio que **no era un grupo homogéneo**, y ése fue el motivo del corte en tres
  tandas: 2 se resolvían con **`BloqueoAgenda`, que ya existía** (T3), 3 dependían de crear
  `TurnoConPaciente` (T4), 1 era el buscador de pacientes —**otro endpoint y otro shape**, nada que
  ver con el turno— (T5), y 1 era el estado del calendario.
  ⚠ **Hallazgo que reordenó el plan:** `selectedEvent` **no tapaba un tipo sino una UNIÓN** — un mismo
  estado alimenta los **dos** modales, que leen campos **disjuntos**—, así que tiparlo como
  `TurnoConPaciente` a secas **no compilaba**. De ahí la unión discriminada de T4, que **espeja lo que
  `extendedProps` ya llevaba** (`{ type, raw }`).
- **Nota: tipar los handlers de FullCalendar NO tipó `event.extendedProps`.** Es
  `Record<string, any>` **por diseño de la librería**, así que el `const { type, raw } = ...` sigue
  devolviendo `any` después de L2. **Es esperado y no es deuda nueva** —el linter ni lo marca, porque
  no hay anotación explícita—: lo **contuvo** el grupo (C) en **T4**, poniéndole tipo al **destino**
  (la unión `SelectedEvent`) con **una sola aserción explícita y comentada** en el punto donde el dato
  vuelve a entrar desde FullCalendar. ⚠ El `any` de `extendedProps` **sigue ahí y va a seguir**: es de
  la librería. Que el turnero no tenga `any` **declarados** no significa que ese punto sea type-safe
  por arte de magia — lo sostiene esa aserción.
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
  - **Quedan 4 llamadas imperativas más a la API de FullCalendar** (relevadas al cerrar B2, ver
    `CLAUDE.md` → nota técnica 21). **Ninguna reporta el warning de `flushSync` hoy** y por eso no se
    tocaron, pero conviene tener el inventario: **`refetchEvents()` en el efecto de
    `[activeCategories]` es la única estructuralmente igual a la que hubo que diferir** (llamada
    imperativa síncrona dentro de un `useEffect`) — **es el primer lugar donde mirar** si el warning
    reaparece en otro flujo. Las otras tres (`refetchEvents()` en `handleEventDrop` /
    `handleEventResize` y en `refreshAction`) corren en **handlers de evento**, fuera del render de
    React, así que son seguras.
  - **Indentación a 4 espacios** en los bloques `onDelete`/`onSubmit` de esos dos archivos, contra
    los 2 del resto del repo. Cosmético; **no tocar dentro de una tanda de tipos** (ensuciaría el diff).
- **✅ RESUELTO (Grupo 4, 2026-08-16) — la convención de prefijo `_` se ADOPTÓ formalmente.**
  `eslint.config.mjs` define ahora `argsIgnorePattern: '^_'`, `varsIgnorePattern: '^_'` y conserva el
  `ignoreRestSiblings: true` que ya tenía. **Se preservó la severidad `warn`** de
  `eslint-config-next` y el resto de los defaults de la regla.
  - **El conteo de este ítem se quedaba corto:** decía 8 lugares (`_req` ×5, `_request` ×3); el censo
    encontró **15** — faltaban `_pid`, dos `_prevState` y **cuatro `_` pelados** en callbacks
    (`.map((_, i) => …)`), que un barrido por nombre no ve.
  - **Fue preventivo, como el ítem anticipaba: no silenció ni un warning.** El lint quedó en cero
    antes y después. Se verificó con un **control positivo** (sondas por `--stdin`): un `_x` sin usar
    queda mudo y un `x` sin usar sigue warneando, o sea que la regla no se apagó de más.
  - ⚠ **La "nota de coherencia" era peor de lo que decía: eran 4 falsos, no 2.** Además de los dos
    `_request` de `consultas/[id]`, los `_req` de los PDF de **pedidos** y **certificados** también se
    usaban (`getBaseUrl(_req)`, 45 líneas más abajo). **Los 4 se renombraron** a `request`/`req`, así
    que el prefijo ya no le miente a nadie. Los **11 `_` restantes son estructurales** (firmas
    impuestas, placeholders posicionales, rest siblings) y se conservan.
  - **El costo sigue vigente y asumido:** de acá en más cualquier identificador que empiece con `_`
    deja de reportarse. Renombrar un unused legítimo en vez de borrarlo deja al linter mudo.
- **Plan de las tandas restantes** (nota de planificación, no compromiso de fecha). ⚠ **Ninguna es
  limpieza de lint**: la serie **L1→L4** agotó el lint mecánico y el bloque **T1→T6** agotó los tipos
  de dominio. Lo que queda es de otra naturaleza.
  - ~~**Tanda "tipos de dominio"**~~ **✅ HECHA (T1–T6, 2026-08-05).** Estaba anotada **dos veces** en
    este mismo plan (duplicación previa); ambas entradas quedan cerradas por el ítem ✅ de arriba.
  - ~~**Los 6 `any` sueltos**~~ **✅ CERRADOS (serie "lint a 0", 2026-08-06).** Dos por **borrado** del
    archivo que los contenía (`historia-clinica-form.tsx`, código muerto), y los otros cuatro por
    tipado. **La pista de `perfil/page.tsx:34` se confirmó**: era arrastre de código muerto, y se
    cerró **anotando**, dejando la deduplicación contra `obtenerAsistentes()` como tanda propia. Ver
    el ítem 🏁 de arriba.
  - ~~**Tanda "efectos y estado derivado"**~~ **✅ HECHA (sub-tandas 4 y 5, 2026-08-06).** Se hicieron
    **por separado**, como estaba previsto: `onboarding-client.tsx:44` derivando en render (con el
    guard del timer conservado) y `calendar-view.tsx:47` con **`useSyncExternalStore`**.
    ⚠ **La advertencia de este plan sobre B2 resultó EXAGERADA, y conviene dejarlo escrito:** decía
    que *"cambia comportamiento en móvil"*. **No lo cambió.** `getServerSnapshot` se usa **también en
    el render de hidratación**, así que la secuencia de valores (`false` en SSR → `false` al hidratar
    → valor real tras montar) es **idéntica** a la del `useState + useEffect`, y FullCalendar sigue
    montando con los mismos `initialView` y `editable` que antes. Lo que sí apareció fue **otra cosa**,
    imposible de anticipar desde el análisis de tipos: el warning de **`flushSync`** al llamar
    `api.changeView()` desde el efecto (ver el ítem 🏁 y `CLAUDE.md` → nota técnica 21).
  - **Tandas ya decididas que viven FUERA de esta sección** (se listan acá solo como índice, para que
    el plan no dé la impresión de que el lint es todo lo que queda):
    - ~~**Fix RLS de bloqueos de agenda**~~ **✅ HECHA (migración 033 + guardas de "0 filas",
      2026-08-06).** Se creó `bloqueos_update` y se abrieron `bloqueos_delete` y `turnos_delete` al
      asistente con `gestionar_turnos`; H1, H2 y H3 cerrados, **H5 sigue abierto** (va con la tanda
      del helper de tenant). → Bloque A → *"Agenda y RLS — bug raíz resuelto y seguimientos"*.
    - **Fix de la obra social cargada como `obra_social_otro`** — en **dos capas** (código: `select` +
      fallback en los formularios y el dashboard; datos: cargar IOSEP al catálogo). → Bloque A →
      *"Bugs menores detectados"* y *"Datos / catálogo"*.
    - **Extraer el helper de tenant a `lib/`** — duplicado inline en ~14 endpoints. Anotado arriba,
      en el ítem ✅ de los Route Handlers.
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
    interceptar** y mapear a textos propios.
    ✅ **DESBLOQUEADA (2026-08-05):** estaba detrás de *"verificar L3c primero"* —porque el fix
    **elimina** el mensaje crudo que la verificación necesitaba comparar— y **esa verificación ya está
    hecha y confirmada** (ver el ítem ✅ de L3c más arriba). Se puede encarar cuando se quiera.
    ⚠ **Dato útil que dejó el diagnóstico de L3c:** desde `/perfil` **no hay forma de provocar un
    error de base a mano** (sin UNIQUE en `profiles`, el único CHECK sobre una columna que no se
    escribe, validaciones de app que son superconjunto de los `NOT NULL`, y RLS que en UPDATE filtra
    en vez de abortar). Si esta tanda necesita probar sus mensajes nuevos, va a tener que **forzar el
    error igual que se forzó la verificación**: una columna inexistente en el `.update()`, temporal.
- **✅ YA ESTABA RESUELTO (verificado en el Grupo 5, 2026-08-17) — el nudo de tipos de
  `consulta-detail.tsx`.** (Abierto 2026-07-30.) Al ir a ejecutarlo se verificó contra el código y
  **los tres `as any` / `: any` ya no existían**: el `useForm` ya llevaba **los tres genéricos**
  (`useForm<ConsultaFormInput, unknown, ConsultaFormData>`, sin cast en el `resolver`) y
  `numericProps` ya estaba tipado. Se resolvió en una tanda intermedia sin cerrar este ítem.
  - **Lo único que seguía vivo era el tercer punto** —la prop **`mode`** desestructurada y nunca
    usada—, y se limpió junto con el **Frente 1** del Grupo 5 (ver el ítem de la hora del próximo
    control, en *Bugs menores detectados*).
  - El **porqué** de la forma correcta quedó documentado en `CLAUDE.md` → **Convenciones de código**
    (los tres genéricos cuando `z.input` ≠ `z.output`, y la trampa de que `z.coerce.number()` vuelve
    el INPUT `unknown`). Lo que sigue es el diagnóstico original, conservado como registro:
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
- **⚠ DECISIÓN PENDIENTE (2026-07-30) — `calendar-view.tsx:156`, el `currentView` "sin usar".**
  (Línea corrida por la serie "lint a 0"; antes figuraba como `:125`.) El linter marcaba
  `currentView`, pero **`setCurrentView` SÍ se usa** (`viewDidMount` y `datesSet`): borrar el estado
  entero habría quitado un re-render que hoy ocurre al cambiar de vista, o sea un **cambio de
  comportamiento disfrazado de limpieza**. Quedó como
  `const [, setCurrentView] = useState('timeGridWeek')` con el porqué comentado en el código. Si
  se decide eliminar el estado completo, evaluar antes si ese re-render hace falta para el
  turnero — es una decisión aparte, no lint.
  - **Dato nuevo (2026-08-06):** como el `changeView` ahora está **diferido a un microtask**, el
    `setCurrentView` que disparan `viewDidMount`/`datesSet` ocurre **un microtask más tarde** que
    antes. Hoy no cambia nada (el valor no se lee), pero si alguna vez ese estado se usa de verdad,
    este timing es parte del cuadro.

### Datos / catálogo
- **⚠ "Particular / Sin obra social": la ambigüedad está CONFIRMADA (verificado 2026-08-08).**
  Existe como **registro real** en la seed de `obras_sociales` (migración 001) **y** como opción
  hardcodeada del formulario. Este ítem pedía *"verificar que no haya duplicación/ambigüedad"*: la
  verificación está hecha y **sí la hay**.
  - **Las dos opciones son visualmente idénticas en el `<Select>` y guardan cosas distintas:**
    - `patient-form.tsx:244` → `<SelectItem value="particular">Particular / Sin obra social</SelectItem>`,
      cuyo handler (`:72-74`) pone **`obra_social_id = undefined` y `obra_social_otro = ''`**: el
      paciente queda **sin ninguna obra social**.
    - La **fila del catálogo con el mismo texto** → guarda **`obra_social_id = <id de esa fila>`**: el
      paciente queda **vinculado a un registro real**.
  - **Consecuencia:** dos pacientes "particulares" quedan modelados distinto según **cuál de las dos
    filas clickeó** quien lo dio de alta, y **cualquier filtro o agrupación por obra social los
    separa**. No hay forma de distinguirlo desde la UI: se ven iguales.
  - **Decisión de producto pendiente: quitar una de las dos.** ⚠ Si se elige borrar la fila del
    catálogo, hay que **revisar antes los pacientes que ya la apuntan** (quedarían con un
    `obra_social_id` colgado); si se elige quitar la opción hardcodeada, el cambio es solo de UI.
- **✅ RESUELTO PARCIALMENTE (migración 035, 2026-08-07) — faltaban obras sociales de la zona en el
  catálogo (IOSEP). CAPA 2 del bug de obra social; NO es código.** Detectado al diagnosticar el bug de
  la obra social que no se muestra (ver Bloque A → "Bugs menores detectados").
  - ✅ **IOSEP cargada.** La 035 la inserta con `ON CONFLICT (nombre) DO NOTHING` (idempotente:
    `obras_sociales.nombre` es `TEXT NOT NULL UNIQUE`). **No se tocó el seed de la 001** a propósito:
    esa migración ya está aplicada, editarla no cambiaría la base real y —como la secuencia no corre
    desde cero— daría la **falsa impresión** de que IOSEP está cargada en un entorno nuevo.
  - ⬜ **SIGUE ABIERTO — revisar qué OTRAS obras sociales comunes de la zona faltan**, para que en
    adelante se elijan de la lista (`obra_social_id`) en vez de escribirse a mano. Es tarea de
    **datos/catálogo** y **requiere al médico**: no se decide por criterio técnico.
  - ⬜ **SIGUE ABIERTO y es OPCIONAL — reasignar los pacientes ya cargados** de `obra_social_otro` a
    `obra_social_id` (p. ej. pasar a Paula a la IOSEP del catálogo). Sería una **migración de datos
    aparte**, y **no hace falta** para que se vean bien: con la Capa 1 ya resuelta, el texto libre se
    muestra correctamente.
  - **Nota:** `obra_social_otro` **no se elimina** — es intencional y seguirá existiendo para las
    obras sociales que no estén en la lista (decisión de producto registrada en el ítem del bug).

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
- **✅ RESUELTO (migración 033, 2026-08-06) — faltaba la política de UPDATE en `bloqueos_agenda`.**
  La tabla tenía `SELECT`, `INSERT` y `DELETE` pero **nunca tuvo `bloqueos_update`** (desde la `005`),
  mientras que su hermana `turnos` **sí** tenía `turnos_update`: editar un bloqueo no persistía nada y
  el usuario recibía un **falso éxito**. La 033 la creó espejando `turnos_update`, y de paso
  **reemplazó `bloqueos_delete` y `turnos_delete`** —que eran solo-médico mientras los endpoints ya
  dejaban pasar al asistente, el mismo falso positivo— por el criterio de la agenda
  (`get_medico_id()` + `check_permiso('gestionar_turnos')`). Se sumaron **guardas de "0 filas"** en
  los endpoints. Detalle completo, decisión de producto, estado de H1–H5 y seguimientos abiertos en
  **Bloque A → "Agenda y RLS — bug raíz resuelto y seguimientos"**.
  > ⚠ **Lección transversal, no solo de esta tabla:** una **denegación de RLS en `UPDATE`/`DELETE`
  > no produce error** — el `USING` filtra filas y la operación devuelve 0 filas en silencio (solo
  > un `WITH CHECK` violado levanta `42501`). Cualquier endpoint que escriba y **no chequee cuántas
  > filas tocó** puede estar reportando éxito sin haber escrito nada. Vale tenerlo presente al
  > auditar el resto de los endpoints de escritura.
- **✅ RESUELTO para `bloqueos_agenda` (migración 037, 2026-08-07) — lectura sin permiso + rol
  `{public}`.** `bloqueos_select` era **tenant-only** (un asistente sin ningún permiso de agenda podía
  leer los bloqueos por PostgREST directo) y las 4 políticas se evaluaban para `{public}`. La 037 pide
  ahora **`ver_turnos` OR `gestionar_turnos`** y normaliza las cuatro a `TO authenticated`. Detalle y
  el porqué del `OR` en **Bloque A → "Agenda y RLS"**.
  - ✅ **El mismo hueco en `turnos` quedó CERRADO por la migración 039 (2026-08-11).** `turnos_select`
    exigía **solo `ver_turnos`**, así que un asistente con `gestionar_turnos` y sin `ver_turnos`
    escribía turnos que no podía leer —404 falsos y **falsos negativos de solapamiento**—. Desde la
    039 pide el **mismo `USING` que `bloqueos_select`**: `ver_turnos` OR `gestionar_turnos`. Las dos
    tablas de la agenda quedaron con el mismo criterio de lectura. Detalle en **Bloque A → "Agenda y
    RLS"**.
    ✅ **Y el ROL también quedó cerrado (migración 042, 2026-08-18):** las 4 políticas de `turnos`
    pasaron a `TO authenticated`, dentro de la normalización de las **49** que no declaraban `TO` en
    **18 tablas**. Detalle en **Bloque A → "Agenda y RLS"**.
- **`consultas_delete` se endureció (migración 038, 2026-08-08) — nota de seguridad.** La política
  ahora exige, además del tenant, que la fila esté en **`estado = 'borrador'`**. Es **defensa en
  profundidad de la regla de negocio 1 y de la Ley 26.529**: una consulta **finalizada** pasó a ser
  **imborrable desde la base**, para todos los roles y por cualquier vía (endpoint, PostgREST directo
  o un script futuro), sin depender de que el código se acuerde de chequearlo. El mismo cambio abrió
  el borrado de **borradores** al asistente **autor** (`creado_por`), que antes no podía y recibía un
  falso éxito. Ver Bloque A → *"descartar un BORRADOR de consulta"*.
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

### Autorización a nivel de APLICACIÓN (defensa en profundidad sobre la RLS)

> Los tres ítems de acá abajo eran el **mismo hallazgo repetido**: la RLS frenaba de verdad, pero la
> aplicación no chequeaba nada, así que el usuario recibía un **error genérico** (o directamente un
> formulario que iba a fallar) donde correspondía un **403 con motivo**. Cerrados en el Grupo 4
> (2026-08-16) con `resolverAcceso`.

- **✅ RESUELTO (2026-08-16) — endpoints de pedidos, certificados y pacientes sin chequeo de permiso
  en la app.** `GET`/`POST` de `/api/pedidos` y `/api/certificados`, y `GET`/`POST` de
  `/api/pacientes` (colección), resolvían tenant con `resolverTenant` y **no miraban el permiso**:
  solo los frenaba la RLS. Ahora piden con `resolverAcceso` **exactamente lo mismo que la política de
  esa tabla** — los `GET` el permiso de lectura (`ver_pedidos` / `ver_certificados` /
  `ver_pacientes`) y los de escritura el de creación/edición (`crear_pedidos` /
  `crear_certificados` / `editar_pacientes`).
  ⚠ El alta de pacientes exige **`editar_pacientes`**: no existe un `crear_pacientes`, y es el mismo
  permiso que pide `pacientes_insert`.

- **✅ RESUELTO (2026-08-16) — cuatro formularios se abrían por URL sin chequear permiso.**
  `/pedidos/nuevo`, `/certificados/nuevo` y `/pacientes/nuevo` no consultaban `profiles` ni llamaban
  a `verificarPermiso`, y el `?edit=true` de la ficha solo miraba `archivado`. Un asistente sin el
  permiso veía el formulario completo y **el rechazo llegaba recién al guardar**. Las tres páginas
  llevan ahora la guarda con `resolverAcceso` (`sin-permiso` → `/sin-acceso`, `sin-tenant` →
  `/dashboard`, `sin-perfil` → `/login`) y el `?edit=true` quedó gateado por el permiso.
  ⚠ **Es autorización, no UX:** distinto del grisado de botones, que es solo la capa visible.

- **✅ RESUELTO (2026-08-16) — el turnero autorizaba con un criterio que ABRÍA ante un valor
  inesperado.** Sus 7 sitios preguntaban `profile?.<permiso> === false`, que con un permiso
  `null`/`undefined` **no dispara el guard**. Era seguro **solo porque las columnas son
  `BOOLEAN NOT NULL DEFAULT FALSE`** — o sea, por una constraint de la base y no por el código.
  Al migrar a `resolverAcceso` pasaron al criterio **fail-closed** (`!permiso`), que ante lo
  inesperado deniega. **Cambio estrictamente más restrictivo: no habilita nada que estuviera
  cerrado**, y con las columnas actuales no altera ningún caso real.

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
- **⚠ COSMÉTICO (2026-08-08, ampliado 2026-08-11) — un bloqueo creado sobre un turno que NO ocupa la
  franja se dibuja a MEDIA FRANJA. Severidad MUY BAJA.** Efecto secundario visible del criterio de
  solapamiento: cuando un turno no ocupa, se puede crear un bloqueo encima de él, y ahí
  **FullCalendar apila los eventos solapados** y el bloqueo se pinta con la mitad del ancho, como si
  cubriera medio horario.
  - **⚠ La SUPERFICIE se amplió con la Tanda A del Grupo 2 (2026-08-10), y el conjunto cambió — no
    solo creció.** Antes (`6cd48c2`) los estados que no ocupaban eran **dos**: `cancelado` y
    `pendiente_confirmar`. Ahora son **tres**: **`cancelado`, `ausente` y `reprogramado`** — y
    **`pendiente_confirmar` volvió a OCUPAR**, así que ese camino al bug desapareció y aparecieron
    dos nuevos. Fuente única del criterio: `src/lib/agenda/solapamiento.ts` (`CLAUDE.md` → nota 23).
  - **Es solo pintura:** el bloqueo cubre el rango completo y se respeta al agendar; lo único raro es
    el ancho del evento.
  - **Salidas posibles:** `eventOverlap` / `slotEventOverlap` en la config del calendario, o un
    `eventOrder` que mande los bloqueos al fondo. Ver `DESIGN.md` → categorías del turnero y
    `.fc-event-bloqueo`.
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
