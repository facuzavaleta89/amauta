# CLAUDE.md

Instrucciones maestras para la IA que trabaja en este repo. Conciso a propósito:
el detalle vive en los documentos referenciados al final.

> ⚠ **Next.js 16 no es el que conocés.** Hay breaking changes respecto a versiones
> previas (APIs, convenciones, estructura). Ante la duda, leé la guía en
> `node_modules/next/dist/docs/` antes de escribir código. Ver también `AGENTS.md`.

---

## Descripción

**Amauta** — app web de gestión médica para un consultorio de diabetología
unipersonal. Gestiona pacientes, historia clínica, turnos, pedidos, certificados,
difusión, notas y mensajería interna. Dos roles (médico titular y asistentes) con
permisos granulares. **Estado: v1.0 deployada y funcional** (faltan pulidos finales,
ver `PENDIENTES.md`).

---

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js **16.2.1** (App Router) + React **19.2.4** |
| Lenguaje | TypeScript 5 (strict) |
| UI | shadcn/ui (Radix) + Tailwind CSS **v4** + `tw-animate-css` |
| DB / Auth | Supabase (PostgreSQL) + `@supabase/ssr` 0.9 |
| Formularios | React Hook Form 7 + Zod **4** |
| Calendario | FullCalendar 6 |
| Gráficos | Recharts 3 |
| Drag & drop | `@dnd-kit` |
| PDF | `@react-pdf/renderer` 4 + jsPDF 4 |
| Email | Resend 6 (⚠ envío aún no conectado) |
| Tablas | TanStack Table 8 · **Toasts** Sonner 2 · **QR** `qrcode` |
| Build | Babel React Compiler habilitado (`reactCompiler: true`) |

Node LTS 20+. Tailwind v4 se configura en `src/app/globals.css` con `@theme`
(el `tailwind.config.ts` de la raíz está **vacío** a propósito).

---

## Estructura de carpetas

```
/src
  /app
    /(auth)          → login, registro, callback (Server Actions en actions.ts)
    /(app)           → layout autenticado con sidebar + header
      layout.tsx     → guard: getUser() → carga profile → onboarding si falta medico_id
      /dashboard /pacientes /turnero /pedidos /certificados /difusion
      /recetas /perfil /notas /mensajes /notificaciones /sin-acceso
    /api             → Route Handlers (CRUD, PDF, cron, difusión)
    /onboarding      → flujo de vinculación de asistentes
    /verificar/[codigo] → verificación pública de documentos por QR (sin login)
    layout.tsx       → layout raíz (html, fuente Inter, Toaster, metadata)
  /components
    /ui              → shadcn/ui (button, card, dialog, form, table, tabs…)
    /layout          → layout-shell, sidebar, header, breadcrumb, notificaciones
    /shared          → reutilizables (qr-verificacion, page-header…)
    /pacientes /turnero /pedidos /certificados /difusion /perfil
    /mensajes /notas /notificaciones /dashboard /recetas
  /constants         → nav-items.ts (navegación por rol+permiso), obra-sociales.ts
  /contexts          → permisos-context.tsx (+ MensajesContext para badge no leídos)
  /hooks             → stubs vacíos (la lógica vive en Server Components/Actions)
  /lib
    /supabase        → client.ts (browser) · server.ts (RSC/actions) · admin.ts (service role, bypass RLS)
    /pdf /email /whatsapp /validations (schemas Zod) /utils · rate-limit.ts
  /types             → tipos por dominio + index.ts (barrel). Ver sección Tipos.
  proxy.ts           → middleware de Next (⚠ NO crear middleware.ts, ver nota 8)
```

---

## Modelo de datos

Resumen; el esquema completo (columnas, constraints, funciones, triggers, RLS)
está en **`schema.sql`** (snapshot consolidado). Tenant key: `pacientes.creado_por`
= UUID del médico; el resto usa `medico_id`. `get_medico_id()` resuelve el tenant
del usuario actual.

| Tabla | Qué es | Tenant |
|---|---|---|
| `profiles` | Extiende `auth.users`: rol, `medico_id`, firma/sello, 12 permisos | — |
| `obras_sociales` | Catálogo (lectura pública autenticada) | — |
| `pacientes` | Pacientes (DNI único). `archivado_at` → archivar en vez de borrar | `creado_por` |
| `historia_clinica` | HC base 1:1 por paciente, **vacía** al crear (no es una actuación) | vía `pacientes` |
| `consultas` | Consultas cronológicas de HC (Bloque 1, diabetología). `campos_extra` (JSONB) ad-hoc | `medico_id` |
| `estudios` | Archivos adjuntos por paciente (subir/ver/descargar/borrar **implementado**). Bucket privado `estudios` (migración 026), ruta `{medico_id}/{paciente_id}/{uuid}.{ext}` | vía `pacientes` |
| `evoluciones` | Series de laboratorio/antropometría (legacy, gráficos) | vía `pacientes` |
| `turnos` | Agenda. `categoria`, `origen`, `consulta_id` (Bloque 4) | `medico_id` |
| `bloqueos_agenda` | Bloqueos de horario | `medico_id` |
| `turnos_audit_log` | Log de cambios de turnos (trigger) | vía `turnos` |
| `pedidos` | Pedidos de estudios + PDF + QR (`codigo_verificacion`, `estado`). PDF **congelado al emitir** en bucket `documentos` (`pdf_path`), + `emisor_snapshot` (JSONB, mig. 028) | vía `pacientes` |
| `certificados` | Certificados + PDF + QR + `valido_hasta`. PDF **congelado al emitir** en bucket `documentos` (`pdf_path`), + `emisor_snapshot` (JSONB, mig. 028) | vía `pacientes` |
| `recetas` | Estructura lista; emisión **bloqueada** (ANMAT pendiente) | vía `pacientes` |
| `difusion_posts` / `difusion_envios` | Comunicación y su historial de envíos | `medico_id` |
| `solicitudes_asistente` | Workflow de vinculación (onboarding) | — |
| `notas` | Notas personales por usuario | `user_id` |
| `mensajes_internos` / `mensajes_lecturas` | Mensajería interna (individual/grupal). Realtime (migración 023) | `medico_id` / `user_id` |
| `notificaciones` | Avisos del sistema para el médico (turno agendado, recordatorio enviado). Estructura verificada y reconstruida en `schema.sql`; ⚠ **sigue sin migración fuente** | `medico_id` |

Funciones SQL clave: `get_medico_id()`, `get_user_role()`, `get_user_medico_id()`,
`check_permiso(user_id, permiso)`, `verificar_documento(codigo)`, `set_updated_at()`,
`handle_new_user()`, `log_turno_cambio()`.

---

## Auth y roles

- Sesión gestionada por `@supabase/ssr` vía `src/proxy.ts`. `publicRoutes` en proxy:
  `/login`, `/registro`, `/callback`, `/verificar`. Todo lo demás requiere auth.
- `(app)/layout.tsx` (Server Component): `getUser()` → si no hay usuario, `/login`;
  carga `profile`; si es asistente sin `medico_id` → `/onboarding`.
- **Médico:** `role='medico'`, `medico_id=NULL` (dueño del tenant, su `id` es el tenant key).
- **Asistente:** `role='asistente'`, `medico_id`=UUID del médico vinculado.
- Acceso al usuario: **Server** → `createClient()` de `@/lib/supabase/server` +
  `getUser()`. **Client** → recibe `profile` por props. RLS usa `auth.uid()`.

**Permisos granulares (12 booleanos en `profiles`, default FALSE):**
`ver_pacientes`, `editar_pacientes` · `ver_historia_clinica`, `crear_consultas`,
`finalizar_consultas` · `ver_turnos`, `gestionar_turnos` · `ver_pedidos`,
`crear_pedidos` · `ver_certificados`, `crear_certificados` · `acceso_mensajeria`.

> ⚠ La columna se llama **`editar_pacientes`** (no `gestionar_pacientes`).
> El RLS valida con `check_permiso()`, que retorna TRUE para `role='medico'`
> (los médicos siempre tienen acceso total). Fuente: migración `015_permisos_granulares.sql`.

---

## Convenciones de código

- **Archivos de componentes:** kebab-case. **Componentes/Tipos:** PascalCase.
  **Server Actions / helpers:** camelCase.
- **Patrón de datos:** Server Components hacen el fetch y pasan props a Client
  Components. Mutaciones vía **Server Actions** (`'use server'`) o Route Handlers;
  convención de retorno `{ error: string | null }`. Validar **también** en el
  servidor (nunca confiar solo en el cliente); schemas Zod en `lib/validations/`.
- **Sin stores globales de cliente** (no Zustand/Redux): estado con `useState`
  local y Context puntual (`permisos-context`, `MensajesContext`).
- **Cliente Supabase:** `server.ts` en RSC/Actions · `client.ts` en browser ·
  `admin.ts` (service role, **bypass RLS**) solo server y solo cuando es imprescindible.
- **Imports:** alias `@/` → `src/`. Agrupar externas → componentes → lib → types.
  Preferí importar tipos desde `@/types` (barrel `index.ts`).
- Al tocar tipos, mantené la organización por dominio existente (no consolidar en
  un archivo). Valores fijos como uniones de literales, no `string`.

---

## Reglas de negocio críticas

1. **HC inmutable:** una `consulta` en estado `finalizada` no se edita desde la UI.
   Solo el médico finaliza (el asistente con permiso puede crear en `borrador`).
   La **consulta** es la unidad de actuación clínica (la fila de `historia_clinica`
   nace vacía y **no** cuenta como actuación).
2. **Médico = acceso total.** Los asistentes solo acceden a lo habilitado explícitamente.
3. **Tenant aislado:** ninguna data se comparte entre médicos distintos.
4. **Matrículas:** MP (provincial), MN (nacional), ME (especialidad). Varias posibles,
   en `profiles.matriculas` (JSONB `[{tipo, numero}]`). `matricula` (TEXT) está deprecado.
5. **Documentos:** pedidos y certificados llevan logo, matrícula(s) y título del médico
   en el PDF. `estado ∈ {emitido, revocado}`; anular es irreversible y solo del médico.
   **No se borran nunca — solo se anulan** (el borrado físico se quitó de app: endpoints
   y UI). Certificados: si `valido_hasta < hoy` → "expirado" (solo display, no cambia
   `estado`). Cada uno tiene `codigo_verificacion` para la página pública `/verificar/[codigo]`.
   **El PDF se congela al emitir:** se genera **una vez** y se persiste en el bucket privado
   `documentos` (`pdf_path`); las descargas sirven ese objeto **inmutable** (no se regenera
   con los datos actuales del médico). El **estado vive en la base**, no en el PDF: anular
   solo cambia `estado='revocado'` (nunca toca el PDF congelado), y quien escanea el QR ve el
   estado actual en `/verificar/[codigo]`. Al descargar un documento revocado, la UI **avisa**
   con un diálogo (el PDF servido es el original, sin marca de anulación). Los datos del médico
   del documento salen del **`emisor_snapshot`** (ver regla 11), no de `profiles` en vivo.
6. **Firma:** solo el médico tiene `firma_url`; los asistentes no pueden firmar.
7. **Recetas:** solo el médico las ve; la creación está bloqueada (ANMAT pendiente).
8. **Asistente sin vínculo** → redirigido a onboarding, no puede usar la app.
9. **Pacientes se archivan, no se borran** (Ley 26.529 — conservación de la HC). Archivar
   (`archivado_at`) los saca de listados y bloquea escritura (editar, emitir documentos,
   **crear consultas**), pero la HC queda de **solo lectura**. El borrado físico real es la
   **excepción**: solo pacientes sin **ninguna** actuación (consultas, estudios, evoluciones,
   turnos, pedidos, certificados, recetas — la HC vacía no cuenta). Archivar / desarchivar /
   eliminar es **exclusivo del médico** (validado en el endpoint, no solo por RLS).
   Criterio exacto: `DELETE /api/pacientes/[id]` (conteo con admin client).
10. **Estudios (archivos adjuntos):** subir/ver/descargar requieren `ver_historia_clinica`
    (médico siempre; asistente solo con el permiso). **Borrar es exclusivo del médico**
    (chequeo de rol en el endpoint + RLS). Bucket privado `estudios` (migración 026); la
    descarga se sirve por **proxy** del endpoint (`GET /api/estudios/[id]`, `?disposition=
    inline|attachment`), sin exponer la URL de Storage al navegador. La subida va por **Route
    Handler + FormData** (no Server Action: tope de ~1 MB). Los estudios **cuentan como
    actuación** (regla 9: un paciente con estudios no se puede borrar físicamente). En
    paciente **archivado** se ven y descargan, pero **no** se suben ni borran (regla 9).
11. **`emisor_snapshot` (foto del emisor):** al emitir un pedido o certificado se guarda en
    `emisor_snapshot` (JSONB) una **foto de los datos del médico firmante** en ese momento —
    `{ full_name, titulo, matriculas, firma_url, logo_url }`, el mismo shape que consume la
    prop `medico` de las plantillas PDF. El **preview HTML** de `/pedidos/[id]` y
    `/certificados/[id]` y la **regeneración del PDF** leen de ahí, **no** de `profiles` en
    vivo, para que preview y PDF **coincidan siempre** y el documento sea reconstruible fiel
    aunque se pierda el objeto de Storage (resuelve el problema de la *"firma viva"*). El
    snapshot es **obligatorio al emitir**: si no se puede cargar el médico, el documento **no
    se emite** (500) — a diferencia del congelado del PDF, que es best-effort (un Storage caído
    no impide emitir; el documento queda con `pdf_path` NULL y se regenera al vuelo desde el
    snapshot). Un documento **sin snapshot es un bug**: el preview muestra un aviso ámbar (no
    cae a `profiles`) y la regeneración del PDF **falla explícita**. **No hay backfill:** el GET
    nunca escribe `pdf_path` ni `emisor_snapshot`. `recetas` **no** tiene la columna (emisión
    bloqueada por ANMAT); habrá que sumarla cuando se habilite.

---

## Estado de desarrollo

Bloques 1–6 completados: HC/consultas, perfil del médico, permisos granulares,
ajustes del turnero (24/7, categorías, integración con HC), mejoras en documentos
(QR de verificación, estados, badges), y obras sociales + notas + mensajería interna.

Tanda de pulidos posterior (P1–P5):
1. **Turnero:** fix de zona horaria en fecha/hora por defecto desde la vista mes (helper
   de fechas compartido en `src/lib/utils/`).
2. **HC:** PDF de consulta y de HC completa ahora se generan **en el servidor**
   (`api/consultas/[id]/pdf`, `api/pacientes/[id]/historia/pdf`); `medicacion_actual`
   reordenada (entre motivo y anamnesis); campos dinámicos `campos_extra` (migración 022).
3. **UI:** selector mosaico/lista compartido (`shared/view-toggle`, hook `use-view-mode`,
   preferencia en localStorage) en difusión y notas; `post-list.tsx` implementado.
4. **Notificaciones:** campanita del header `NotificacionesBell` unifica solicitudes +
   mensajes no leídos, con Realtime para `mensajes_internos` (migración 023).
5. **Pacientes/documentos:** archivar en vez de borrar (`archivado_at`, migración 024);
   documentos solo se anulan (ver reglas de negocio 5 y 9).

Tanda de **Storage** (migración 026, ver regla de negocio 10):
- **Estudios complementarios por paciente** — subida (Route Handler + FormData, rollback del
  objeto si falla el insert), listado, **previsualización** (modal: imágenes con `<img>`, PDFs
  con `<iframe>`), descarga (proxy del endpoint, patrón blob) y borrado (solo médico).
- Bucket **privado** `estudios` (10 MB, MIME pdf/jpeg/png/webp) con 4 políticas RLS sobre
  `storage.objects` aisladas por tenant; endurecidas también las 4 de la tabla `estudios`
  (ahora exigen `ver_historia_clinica`). Nuevos: `lib/supabase/storage.ts`,
  `lib/validations/estudio.schema.ts`, `api/estudios/route.ts` + `api/estudios/[id]/route.ts`,
  `components/pacientes/estudios-{upload,list}.tsx`, `pacientes/[id]/estudios/page.tsx`.

Tanda de **Persistencia de PDFs** (migraciones 027–028, ver reglas de negocio 5 y 11):
- **PDF congelado al emitir** en el bucket privado `documentos` (5 MB, solo `application/pdf`,
  migración 027), ruta `{medico_id}/{tipo}/{documento_id}.pdf` (determinística → upsert). 3
  políticas RLS sobre `storage.objects` por tenant (select/insert/update); **sin DELETE** a
  propósito (los documentos no se borran, regla 5). Descarga: si `pdf_path` existe se sirve el
  objeto por proxy; si no, se regenera al vuelo (best-effort al emitir, con timeout de 8 s).
- **`emisor_snapshot`** (JSONB, migración 028) en `pedidos`/`certificados`: foto del médico al
  emitir; preview y PDF leen de ahí (regla 11). Los 19 documentos de prueba previos se borraron
  (script suelto `LIMPIEZA-documentos-prueba.sql`, fuera de `supabase/migrations/`), así que hoy
  todos los documentos tienen snapshot.
- Se **cerró el hueco de la regla 9** en los POST de pedidos/certificados: ahora rechazan (409)
  emitir a un paciente archivado (antes solo lo bloqueaba la UI).
- Nuevos/cambios: `lib/pdf/documentos.ts` (generación + persistencia reutilizable), extensión de
  `lib/supabase/storage.ts` (`DOCUMENTOS_BUCKET`, `buildDocumentoPath`, `DocumentoTipo`),
  `emisor_snapshot`/`EmisorSnapshot` en `types/pedido.ts`, POST/GET de pedidos y certificados,
  páginas de detalle (leen snapshot), `pedido-pdf`/`certificado-pdf` (diálogo de descarga de
  revocados + banner de "sin emisor"), y `.env.example` (`NEXT_PUBLIC_SITE_URL`).

Tanda de **Reproducibilidad y limpieza del esquema** (migraciones 029–030, ver notas
técnicas 6, 12, 13 y 14):
- **029:** corrigió un **drift de seguridad** en RLS (la base se había vuelto más permisiva
  que las migraciones fuente) y limpió duplicados (función `update_updated_at_column`,
  `get_user_role()` sin args, política duplicada de notificaciones, DEFAULT roto de
  `profiles.role`).
- **030:** versionó los objetos huérfanos (`consultas`, `notificaciones`, columnas de
  `turnos` y `profiles`). El estado final ya es reproducible; la secuencia desde cero **no**.
- **Repo:** se corrigieron 6 desajustes TS↔esquema (`Certificado.tipo` nullable,
  `TurnoAuditLog.accion` sin `| string`, `role: UserRole` en los joins de mensajes, nueva
  interface `MensajeLectura`, comentario de `proximo_control`) y se eliminaron **16 archivos**
  de código muerto (11 componentes stub + 4 hooks stub + el barrel redundante
  `types/supabase.ts`). Se **mantuvo** `lib/pdf/receta-template.tsx` como marcador del
  template de recetas (bloqueado por ANMAT).

**Pendiente:** ver `PENDIENTES.md` (pulidos finales en tres bloques: Funcional,
Seguridad, Estético), el bucket **`difusion`** (aún no creado; `documentos` y `estudios`
ya existen por migración) y la sección "Recetas" (bloqueada por certificación ANMAT).

---

## Documentación del proyecto

- **`README.md`** — puesta en marcha para desarrolladores (requisitos, instalación, scripts).
- **`DESIGN.md`** — sistema de diseño (paleta OKLCH, tipografía, componentes, categorías del turnero).
- **`schema.sql`** — snapshot consolidado del esquema (tablas, funciones, triggers, RLS). No reemplaza las migraciones de `supabase/migrations/`.
- **`PENDIENTES.md`** — tareas de pulido (Funcional / Seguridad / Estético) con ubicaciones en el código.
- **`src/types/`** — tipos por dominio + `index.ts` (barrel). Deriva del esquema; **no** hay tipos autogenerados por Supabase.

---

## Notas y deuda técnica

1. **Hooks:** los 4 stubs (`use-auth`, `use-pacientes`, `use-role`, `use-turnos`) se
   **eliminaron** en la tanda de reproducibilidad; la lógica vive en Server
   Components/Actions. Queda solo `use-view-mode.ts`, que tiene lógica real (preferencia
   mosaico/lista en localStorage).
2. **Permisos legacy:** `puede_ver_historias` / `puede_editar_agenda` (Bloque 2) fueron
   reemplazados por los 12 granulares; siguen en la tabla por compatibilidad.
3. **`profiles.matricula`** (TEXT) deprecada → usar `matriculas` (JSONB).
4. **`proxy.ts` es el middleware** en esta versión de Next (función `proxy()` + `config.matcher`).
   **No crear `middleware.ts`.** Para rutas públicas, editar `publicRoutes` en `proxy.ts`.
5. **Admin client para permisos:** el médico actualiza permisos del asistente vía
   `admin.ts` (bypass RLS), porque `profiles_update_own` solo permite el perfil propio.
6. **✅ Esquema sin migración fuente — RESUELTO (migración 030).** `consultas`,
   `notificaciones`, las columnas de Bloque 4 de `turnos` y `profiles.titulo/matriculas/
   logo_url` ya tienen su `CREATE` versionado. **Limitación conocida:** el ESTADO FINAL es
   reproducible, pero la SECUENCIA de migraciones **no** corre desde una base vacía (013,
   014, 015, 022 y 025 referencian `consultas` y la tabla recién se crea en la 030 → falla
   en la 013). Requiere una consolidación de baseline, no hecha; ver `PENDIENTES.md` → Bloque A.
7. **Migración vacía:** `20260326204733_fix_rls_recursion.sql` tiene 0 bytes.
8. **Migración 025 (seguridad):** `verificar_documento` ya **no expone** DNI completo ni
   contenido clínico (devuelve DNI enmascarado, fija `search_path`, y solo `service_role`
   puede ejecutarla); se dropearon dos RLS huérfanas en `consultas` que salteaban los
   permisos, el `DELETE` de `pedidos`/`certificados` (solo se anulan) y `log_turno_cambio`
   fija `search_path`.
9. **Migración 026 (Storage):** crea el bucket privado `estudios` (10 MB, MIME
   pdf/jpeg/png/webp) y sus 4 políticas RLS sobre `storage.objects`, aisladas por tenant
   comparando el **primer segmento** del path (`storage.foldername(name)[1]` = `medico_id`)
   contra `get_medico_id()` y atadas a `ver_historia_clinica` (el `DELETE` además exige rol
   médico). Endurece las 4 políticas de la tabla `estudios` (antes cualquier asistente del
   tenant accedía; ahora exigen `check_permiso('ver_historia_clinica')`, mismo hueco que tenía
   `consultas` antes de la 025). Reconstruida en `schema.sql` → sección STORAGE.
10. **Migraciones 027–028 (Persistencia de PDFs):** la **027** crea el bucket privado
    `documentos` (5 MB, solo `application/pdf`) con 3 políticas por tenant sobre
    `storage.objects` — select (`ver_pedidos` OR `ver_certificados`), insert/update
    (`crear_pedidos` OR `crear_certificados`) — y **sin DELETE a propósito** (los documentos
    no se borran, regla 5). La **028** agrega `emisor_snapshot JSONB` (nullable) a `pedidos` y
    `certificados` (no a `recetas`). Ambas reconstruidas en `schema.sql`. La limpieza de datos
    de prueba vive en `LIMPIEZA-documentos-prueba.sql` (raíz, **fuera** de
    `supabase/migrations/`, un solo uso). **Aprendizaje operativo:** los objetos de Storage
    **no** se borran por SQL directo (el trigger `storage.protect_delete` bloquea
    `DELETE FROM storage.objects`); se borran por la API de Storage o el Dashboard.
11. **`NEXT_PUBLIC_SITE_URL` (requerida en producción):** URL base de los QR de verificación
    de documentos. Antes se derivaba del header `Host` (que el cliente controla); con PDFs
    congelados un `Host` falsificado grabaría un QR **envenenado permanente**, así que la env
    var tiene **prioridad** y el header quedó solo como fallback (ver `getBaseUrl` en
    `src/lib/pdf/documentos.ts`). Configurada en Vercel (production/preview/development) y en
    `.env.example` / `.env.local`. Prod: `https://amauta-salud.vercel.app`.
12. **Migración 029 (drift de RLS):** las políticas de la base habían sido modificadas **a
    mano** hacia versiones más permisivas que las migraciones fuente. Como Supabase expone las
    tablas por **PostgREST**, un asistente podía escribir directo salteando la app. La 029
    restauró el chequeo de rol médico en `recetas` (insert/update/delete), `evoluciones`
    (update/delete) e `historia_delete` — el más grave, porque un asistente podía **borrar
    historias clínicas** que la Ley 26.529 obliga a conservar —, todas normalizadas a
    `TO authenticated`. Además: migró el trigger `consultas_updated_at` de
    `update_updated_at_column()` a `set_updated_at()` y dropeó la duplicada (era la única
    SECURITY INVOKER sin `search_path` fijo); dropeó `get_user_role()` **sin argumentos**
    (huérfana; se conserva la de `user_id uuid`); dropeó la política duplicada
    `"Medicos ven sus propias notificaciones"`; y corrigió el DEFAULT de `profiles.role`, que
    era `'secretario'` y **violaba su propio CHECK**.
13. **Migración 030 (objetos huérfanos):** versionó lo que existía en la base sin `CREATE`:
    tablas `consultas` y `notificaciones` completas, columnas `turnos.categoria/origen/
    consulta_id` + sus 3 CHECK, y `profiles.titulo/matriculas/logo_url`. Idempotente. Ver la
    limitación de orden en la nota 6.
14. **Difusión: permisiva a propósito.** Las 4 políticas de `difusion_posts` validan **solo el
    tenant**: cualquier asistente vinculado puede ver, crear, **editar y eliminar** posts. Es
    una **decisión de producto**, no un descuido: los posts son comunicación del consultorio,
    no datos clínicos, y `src/app/api/difusion/[id]/route.ts` (PATCH y DELETE) ya valida solo
    la pertenencia al tenant. Por eso la 029 **no** tocó difusión. Restringirlo en el futuro
    requeriría un permiso granular de difusión (hoy no existe).
