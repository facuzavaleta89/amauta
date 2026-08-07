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
| Fechas | date-fns 4 + **`date-fns-tz` 3** (formateo en zona AR en el servidor — ver nota 18) |
| Gráficos | Recharts 3 |
| Drag & drop | `@dnd-kit` |
| PDF | `@react-pdf/renderer` 4 + jsPDF 4 |
| Email | Resend 6 (✅ envío de difusión conectado; requiere `RESEND_API_KEY`) |
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
  /constants         → nav-items.ts (navegación por rol+permiso), obra-sociales.ts,
                       difusion.ts (DIFUSION_LIMITE_DIARIO, compartida cliente/servidor)
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
| `difusion_posts` / `difusion_envios` | Comunicación y su historial de envíos. `difusion_envios` es el **log de envíos**: una fila por destinatario, la escribe `POST /api/difusion/enviar` | `medico_id` |
| `solicitudes_asistente` | Workflow de vinculación (onboarding) | — |
| `notas` | Notas personales por usuario | `user_id` |
| `mensajes_internos` / `mensajes_lecturas` | Mensajería interna (individual/grupal). En la publicación `supabase_realtime` (mig. 023) y con `REPLICA IDENTITY FULL` (mig. 032), pero ⚠ la entrega en vivo **NO funciona y quedó DIFERIDA** — causa acotada a infraestructura de Supabase (ver `PENDIENTES.md` → Bloque A y `schema.sql` → REALTIME). ⚠ `mensajes_lecturas` **no tiene política de UPDATE**: los upserts van con `ignoreDuplicates` | `medico_id` / `user_id` |
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

> ⚠ **Agenda — `gestionar_turnos` incluye BORRAR (desde la migración `033`, 2026-08-06).**
> El asistente con ese permiso puede **crear, editar y eliminar** turnos y bloqueos. Antes el
> **borrado** era **solo-médico en la base** (`turnos_delete` / `bloqueos_delete`) aunque los
> endpoints ya dejaban pasar al asistente: esa discrepancia le devolvía un falso éxito. La 033
> alineó las dos políticas al criterio de la agenda (tenant + `gestionar_turnos`) y creó
> `bloqueos_update`, que **nunca había existido**. Es el único dominio donde el borrado no está
> reservado al médico (contrastar con pacientes → regla 9, estudios → regla 10, documentos →
> regla 5).

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
- **Tipar el RESULTADO de una query de supabase-js: `overrideTypes` / `.single<T>()`, nunca `any`.**
  El proyecto **no tiene tipos generados de `Database`** (ni `server.ts` ni `admin.ts` pasan el
  genérico), así que **el `data` de toda query llega como `any`** y `tsc` no valida ninguna forma de
  fila: cada tipo que se aplica acá es una **aserción de la forma real**, no algo que el compilador
  pueda verificar contra la base. Formas vigentes:
  - **Varias filas:** `.overrideTypes<MiTipo[], { merge: false }>()` al final de la cadena.
    ⚠ **`.returns<T>()` está DEPRECADA** en la versión instalada de `postgrest-js` — su propio JSDoc
    remite a `overrideTypes`. No estrenar código sobre ella.
  - **Una fila:** `.single<MiTipo>()` (el genérico de `single`, sin cast).
  - **Parámetros que reciben el cliente:** `Awaited<ReturnType<typeof createClient>>`, **no** el
    `SupabaseClient` de `@supabase/supabase-js` — el factory lo construye con `@supabase/ssr`, y
    anotarlo con el tipo de otro paquete lo ata a una dependencia que no es la que lo produce.
  - ⚠ **Verificar que el tipado se APLICÓ**, no solo que compila: sobre un cliente sin genérico es
    fácil que quede en `any` en silencio y `tsc` pase igual. La sonda barata es leer a propósito un
    campo que la query **no** proyecta y confirmar que el compilador lo rechaza.
- **Fechas para el usuario en el servidor:** en Server Components y Route Handlers, formatear
  **siempre** con `formatFechaAR` (`src/lib/utils/format-date.ts`), **nunca** con `format()` de
  date-fns ni `toLocaleString()` a secas — esos renderizan en la zona del **runtime**, que en
  Vercel es UTC. Ver **nota técnica 18**. (En Client Components no aplica: el navegador ya está
  en la zona del usuario.)
- **`catch`: nunca anotar `any`.** Si el cuerpo **no usa** la variable, va **optional catch binding**
  —`} catch {`, sin paréntesis— que además evita el `no-unused-vars`; ya es el patrón del repo
  (`hooks/use-view-mode.ts`, `(app)/notificaciones/actions.ts`, los Route Handlers de la tanda L1) y
  compila con el `target: ES2017` actual. Si **sí** la usa, `catch (error)` a secas: queda tipada
  `unknown`, y **`console.error(...)` la acepta sin narrowing** — no agregar `instanceof Error` de
  adorno. El narrowing se justifica solo cuando se **lee una propiedad** (`.message`, `.code`), y ahí
  ⚠ **cuidado con supabase-js: `instanceof Error` puede fallar en silencio.** El patrón
  `const { error } = await supabase…; if (error) throw error` —usado en Server Actions como
  `(app)/perfil/actions.ts`— relanza **el objeto plano de `JSON.parse`**, no una instancia de `Error`:
  supabase-js solo construye `PostgrestError` (que sí extiende `Error`) cuando se llama
  **`.throwOnError()`**, y estos llamados no lo hacen. Como el **tipo declarado** sí es `Error`,
  **`tsc` compila un `instanceof Error` sin una queja y el fallo aparece recién en producción**, con
  todos los errores de base cayendo al mensaje genérico. En ese caso el narrowing va **por forma**
  (duck-typing sobre `.message`), no por prototipo: ver `mensajeDeError` en `perfil/actions.ts`.
  Si el error lo construye la app (`throw new Error(...)` tras un `fetch`, como en el turnero),
  `instanceof Error` **sí** es correcto.
- **Handlers de FullCalendar: tipar con los tipos de la librería, nunca `any`.** `EventApi`,
  `DateSelectArg`, `EventClickArg`, `EventDropArg`, `EventSourceFuncArg`, `EventInput` salen de
  **`@fullcalendar/core`**; ⚠ **`EventResizeDoneArg` NO está en `core`** — vive en
  **`@fullcalendar/interaction`** (perder tiempo buscándolo en `core` es el error fácil). Dos
  trampas más: **no** tipar la función de `events` como `EventSourceFunc` —es un **union type**
  (callback o promesa) y resolverlo a través de `useCallback` es frágil: tipá los **parámetros
  individualmente**—; y tener presente que **`event.extendedProps` es `Record<string, any>` por
  diseño**, así que tipar el handler **no** tipa el payload de la app que viaja ahí adentro (eso
  necesita un tipo de dominio propio).
- **Hook que se suscribe a un store del navegador (`matchMedia`, `localStorage`, `online/offline`…):
  `useSyncExternalStore`, no `useState` + `useEffect`.** Sembrar el valor inicial con un `setState`
  síncrono dentro del efecto dispara `react-hooks/set-state-in-effect` y provoca un render en cascada.
  El patrón canónico de React 19 es `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)`,
  con **`getServerSnapshot` devolviendo el valor neutro** (`false`, en el caso de "¿es móvil?"): React
  lo usa en SSR **y también en el render de hidratación**, así que **no hay mismatch** y la secuencia
  de valores es la misma que tenía el `useState + useEffect`. Dos detalles: `subscribe` va memoizada
  (`useCallback`) o React re-suscribe en cada render, y `getSnapshot` debe devolver un **primitivo**
  (o un valor estable) para que la comparación por `Object.is` no cicle. Ejemplo vivo: `useIsMobile`
  en `components/turnero/calendar-view.tsx`. ⚠ **No sirve derivar en render** en estos casos: `window`
  no existe en SSR. Y si el hook alimenta una llamada imperativa a una librería, ver la **nota
  técnica 21**.
- **`useForm` con un schema que tiene `.transform()` o `z.coerce`: van los TRES genéricos.**
  Cuando `z.input` ≠ `z.output`, el tipo del resolver no calza con
  `useForm<TFieldValues>` y aparece la tentación del `as any`. La forma correcta es
  **`useForm<z.input, unknown, z.output>({ resolver: zodResolver(schema) })`** — el tercer genérico
  es el tipo **de salida**. Ejemplo vivo: `consultas/consulta-detail.tsx` con
  `consultaSchema` (`useForm<ConsultaFormInput, unknown, ConsultaFormData>`).
  ⚠ **`z.coerce.number()` hace que el INPUT sea `unknown`** (acepta cualquier cosa, y en una unión
  `unknown` absorbe al otro miembro), así que `field.value` de esos campos es `unknown` y **leerlo
  exige conversión explícita** (`field.value == null ? '' : String(field.value)` — el `== null`
  primero, o `String(null)` da `"null"`). Ese `unknown` **viene del schema, no del componente**: no
  se arregla en el formulario.
  ⚠ Y ojo: el tercer genérico **solo tipa `handleSubmit`**. Si el submit es manual
  (`trigger()` + `getValues()`, como en ese componente), `getValues()` devuelve el **input crudo**,
  **no** el output transformado — la normalización queda del lado del servidor, donde se hace el
  `safeParse`.
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
12. **Envío de difusión por email:** lo puede disparar **cualquier miembro del tenant** (no hay
    permiso granular de difusión — ver nota 14). Un post solo se envía **una vez**: si ya está en
    `enviado`, el POST responde 409. **Tope de 100 emails por día y por tenant** (free tier de
    Resend): el endpoint cuenta los `difusion_envios` del día en curso y, si el envío lo superara,
    **rechaza con 429 sin enviar un solo email** — es todo-o-nada, no envía hasta el tope y corta.
    El envío es **parcialmente tolerante a fallos**: un error de un destinatario no corta el loop,
    queda registrado en su fila de `difusion_envios` (`enviado_ok=false`, `error_msg`) y se
    devuelve en `errores[]`; con **al menos un** envío exitoso el post pasa a `enviado`.
    ⚠ **Sin opt-out (Ley 25.326):** hoy no existe mecanismo de baja ni registro de consentimiento
    del paciente; el pie de la plantilla tiene el `TODO` marcado. Es un **bloqueante de go-live**
    para el envío a pacientes reales (ver `PENDIENTES.md`).

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
   mensajes no leídos, con **canal de Realtime montado** para `mensajes_internos` (migración 023).
   ⏸ **La entrega en vivo NO funciona y el trabajo está DIFERIDO:** el badge de mensajes sube recién
   tras F5 (hallazgo 2026-07-31, **preexistente**). Diagnosticado a fondo en la 1B-parte-2: la causa
   quedó acotada a **infraestructura del servicio Realtime de Supabase**, fuera de nuestro código
   (ver `PENDIENTES.md` → Bloque A).
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

Tanda de **Nombre de archivo unificado de documentos** (sin migración):
- Nuevo helper **neutro** `src/lib/pdf/filename.ts` (`buildDocumentoFilename(tipo, paciente,
  fecha)`), importable desde cliente y servidor. Arma `<tipo>_<paciente>_<fecha>.pdf`, **omite**
  los segmentos vacíos/null y pasa todo por `sanitizePdfFilename`. Elimina el bug del
  `certificado_null_…` (el `tipo` de certificado ya no se interpola) y la divergencia previa
  entre el `a.download` del botón y el `Content-Disposition` del endpoint. Consumidores:
  `api/{pedidos,certificados}/[id]/pdf/route.ts` y `components/{pedidos/pedido-pdf,
  certificados/certificado-pdf}.tsx`.

Tanda de **Difusión por email (Resend)** (sin migración; ver reglas de negocio 12 y nota 16):
- **Cliente de email:** `lib/email/resend.ts` — instancia de Resend (solo servidor), `EMAIL_FROM`
  (de `RESEND_FROM`, fallback al sandbox `onboarding@resend.dev`) y `sendEmail()`, que **nunca
  lanza**: devuelve `{ ok, error? }` para poder registrar el resultado destinatario por
  destinatario sin cortar el loop.
- **Plantilla:** `lib/email/difusion-template.ts` — `renderDifusionEmailHtml()` genera un HTML
  con estilos inline (sin `@react-email`). Todo el texto del médico pasa por el nuevo helper
  **`escapeHtml`** de `lib/utils.ts`, y recién después se convierten los saltos de línea en
  `<br>` (en ese orden, para que un `<br>` tecleado quede como texto).
- **`POST /api/difusion/enviar`** (runtime `nodejs`, rate limit 10/min por usuario): valida el
  body con `difusionEnvioSchema` (`post_id` + 1..500 `destinatario_ids`), carga el post del
  tenant, **rechaza reenviar** un post ya `enviado` (409) y exige `asunto_email` (400). **No
  confía en los ids del cliente:** recarga los pacientes filtrando por tenant, `archivado_at IS
  NULL`, email no nulo y formato de email válido. Verifica el **límite diario de 100** contando
  las filas de `difusion_envios` del día; si se superaría, **aborta sin enviar nada** (429).
  Envía **secuencialmente** con una pausa de 600 ms, inserta una fila en `difusion_envios` por
  destinatario (`enviado_ok` / `error_msg` / `enviado_at` / `enviado_por`) y responde
  `{ intentados, exitosos, fallidos, errores[] }`. Si **al menos uno** salió bien, el post pasa a
  `estado='enviado'`.
- **`GET /api/difusion/destinatarios`** (rate limit 60/min): pacientes del tenant activos y con
  email de formato válido — **mismo filtro que `/enviar`**, para que la UI no ofrezca gente que
  el backend después descartaría. Devuelve nombre, email, sexo y obra social resuelta.
- **UI:** `components/difusion/enviar-modal.tsx` — modal con búsqueda por nombre y filtros por
  obra social y sexo; la **selección es global** (los filtros solo cambian lo que se ve, no lo
  seleccionado), arranca con todos tildados y avisa en el footer si se pasa de 100. Tras un envío
  parcial no se cierra: muestra la lista de fallidos con el motivo. Checkbox propio en
  `components/ui/checkbox.tsx` (`<input type="checkbox">` nativo estilizado, sin sumar Radix).
- **Detalle del comunicado:** `(app)/difusion/[id]/page.tsx` lee `difusion_envios` cuando el post
  está `enviado` y pasa un `envioResumen` a `difusion-preview.tsx`, que muestra "Envío completo /
  parcial" (total · recibidos · fallidos) y la lista de a quién **no** le llegó, con el motivo.
- **Autorización: tenant-only.** Ambos endpoints resuelven el tenant con el mismo patrón que el
  resto de `/api/difusion` y **no chequean rol**: cualquier miembro del tenant puede enviar,
  coherente con la nota técnica 14 (difusión es permisiva a propósito).

Tanda de **Lazy-init del cliente Resend** (sin migración; ver nota técnica 16):
- La instanciación del cliente pasó del **nivel superior del módulo** al **primer envío**
  (`getResendClient()` memoizado en `lib/email/resend.ts`). Antes, la falta de `RESEND_API_KEY`
  lanzaba **al importar** y **tiraba abajo el build** (`next build` importa el módulo al
  recolectar los datos de `/api/difusion/enviar`); un deploy real se cayó por eso. Ahora la key
  faltante se reporta como `{ ok: false, error }` de `sendEmail`, o sea **por destinatario**,
  igual que cualquier otro error de envío. Detalle completo en la **nota técnica 16**.
- **Constante única del límite diario:** `DIFUSION_LIMITE_DIARIO` en `constants/difusion.ts`
  (módulo neutro), importada por el endpoint de envío y por el modal. Antes el `100` estaba
  duplicado en dos constantes independientes que podían divergir en silencio.

Tanda de **Endurecimiento de la CSP** (Fases 1a y 1b, sin migración; ver nota técnica 17):
- **Fase 1a — CSP de enforcement (`next.config.ts`, 2026-07-28).** Se cerraron las directivas
  que faltaban: `object-src 'none'` (no hay `<object>`/`<embed>` en la app; sin declararla
  heredaba `'self'` de `default-src`) y **`base-uri 'self'` + `form-action 'self'`, que NO
  heredan de `default-src`**: sin declararlas quedaban **sin restricción** — era un agujero
  real (inyección de `<base>` y posteo de formularios a terceros). Se sumó
  `upgrade-insecure-requests` **solo en producción**: en dev se entra por **IP de LAN sobre
  HTTP** (`allowedDevOrigins`) y forzar https rompería ese acceso.
- **Fase 1a — permisos muertos removidos:** `fonts.googleapis.com` de `style-src`,
  `fonts.gstatic.com` de `font-src` (Inter la **auto-hostea `next/font`** en build time desde
  `/_next/static/media/*.woff2`: el navegador nunca pega al CDN de Google) y
  `https://*.supabase.co` de `img-src` (los archivos de Storage se sirven por **proxy
  same-origin**, p. ej. `/api/estudios/[id]`; el navegador nunca pide imágenes a Supabase).
- **Fix posterior (2026-07-29) — `font-src 'self' data:`. ⚠ El `data:` NO SE PUEDE QUITAR:**
  FullCalendar inyecta su CSS por JS con la fuente de íconos **`fcicons` embebida como
  `data:application/x-font-ttf`**. Sin `data:` el turnero pierde los íconos — fue una violación
  real vista en producción, no una precaución teórica.
- **Fase 1b — CSP de ENSAYO en report-only (`src/proxy.ts`, 2026-07-29).** El middleware emite
  una **segunda** cabecera, `Content-Security-Policy-Report-Only`, con un **nonce por request**
  (`buildReportOnlyCsp` + `nextWithNonce`). **Convive** con la CSP de enforcement de
  `next.config.ts`, que sigue siendo el **piso** efectivo: la report-only **no bloquea nada**,
  solo reporta. A propósito **sin `report-uri`/`report-to`** — las violaciones se leen en la
  consola del navegador, no hay endpoint de reportes.
- Lo **único** que la report-only ensaya es `script-src 'self' 'nonce-…' 'strict-dynamic'`
  **sin `'unsafe-inline'`** (ni `'unsafe-eval'`); **el resto de las directivas copia** la de
  enforcement, directiva por directiva. `'strict-dynamic'` hace que los navegadores que lo
  soportan **ignoren `'self'`** y confíen solo en lo que cuelga de un script nonceado (así los
  chunks del runtime de Next quedan permitidos sin listarlos); `'self'` queda como fallback
  para los que no lo soportan.
- El nonce viaja en los **request headers** (`x-nonce` + la propia cabecera report-only) porque
  Next lee de ahí para inyectar `nonce="…"` en los `<script>` que genera; los headers se
  **rearman en cada `NextResponse.next()`** para no perder la mutación de cookies del refresh
  de sesión de Supabase.
- **Estado: el enforcement todavía NO se puede activar.** En producción (Vercel) el nonce **no
  llega a inyectarse** en los `<script>`, así que todas las rutas reportan violaciones de
  `script-src`. Síntoma medido, causa abierta y alternativas en `PENDIENTES.md` → Bloque B →
  "Endurecer la CSP".

Tanda **1A — bugs chicos y limpieza suelta** (2026-07-30, sin migración; ver nota técnica 18):
- **Fix de zona horaria en fechas server-side.** Nuevo helper compartido
  **`src/lib/utils/format-date.ts`** → `formatFechaAR(fecha, patron)` (`formatInTimeZone` de
  **`date-fns-tz`** + const `TZ_AR = 'America/Argentina/Buenos_Aires'`), aplicado a los **4**
  sitios que formateaban en la zona del runtime: `dashboard/next-appointments.tsx`,
  `api/turnero/route.ts` (texto de la notificación), `(app)/dashboard/page.tsx` (subtítulo del
  día) y `dashboard/recent-patients.tsx`. Los formateos **client-side no se tocaron**.
- **`src/app/page.tsx`** dejó de ser la plantilla de `create-next-app`: ahora es un
  `redirect('/dashboard')`. Se borraron los 5 SVG huérfanos de `public/` (quedó vacía).
- Se borró la **migración de 0 bytes** `20260326204733_fix_rls_recursion.sql` (no-op; su
  intención ya estaba cubierta por la `014` + `019`/`021`). **No se tocó la base.**
- **Limpieza de lint acotada: 96 → 75 problemas.** Override en `eslint.config.mjs` que apaga
  `jsx-a11y/alt-text` **solo en `src/lib/pdf/**`** (falso positivo del `<Image>` de
  `@react-pdf/renderer`, que no acepta `alt`), 12 imports/vars muertos y 1 `catch (err: any)`.
  Se borró el stub muerto `src/lib/utils/calcular-imc.ts`. La deuda restante (63 `any`, etc.) y
  el **nudo de tipos de `consulta-detail.tsx`** quedan para una tanda dedicada: `PENDIENTES.md`
  → Bloque A → "Lint preexistente".

Tanda **1B — parte 1: el badge de notificaciones cuenta los avisos del sistema + marcado de leído**
(2026-07-31, **sin migración**; ver nota técnica 19):
- **El bug:** el badge de la campanita hacía `count = solicitudes.length + mensajes.length` y
  **nunca leía la tabla `notificaciones`**, así que un turno agendado por un asistente aparecía en
  la página `/notificaciones` pero **no incrementaba el número**. **No era una regresión:** la
  conexión nunca existió. Y `notificaciones.leida` **jamás se escribía en `true`**.
- **Fuente de verdad compartida** en `src/app/(app)/notificaciones/actions.ts`: la tabla se lee en
  **un único lugar** (`leerNotificacionesSistema`, privada) y dos wrappers sirven a cada contexto —
  `obtenerItemsPagina()` (página: solicitudes + avisos, historial completo) y
  `obtenerNotificacionesNoLeidas()` (badge: solo no leídos). Badge y página comparten el shape
  normalizado `ItemPendiente`, así que un `tipo` nuevo entra una vez y lo ven los dos.
- **Tipo nuevo** `src/types/notificacion.ts` (`Notificacion`, `NotificacionTipo`, `ItemPendiente`,
  `ITEM_TYPE_SOLICITUD`), en el barrel. La tabla no tenía tipo TS.
- **Marcado de leído** (no existía): `marcarNotificacionesLeidas()` + el Client Component
  `components/notificaciones/marcar-leidas.tsx`, que marca al **entrar** a `/notificaciones` y
  aporta el botón "Marcar todas como leídas".
- **`api/turnero/route.ts`:** el insert de la notificación ahora **chequea su error** (antes era
  silencioso); se loguea sin datos personales y el POST **no falla** por eso.
- ⚠ **El Realtime quedó explícitamente FUERA** (es la 1B-parte-2: ver la tanda de acá abajo y
  `PENDIENTES.md` → Bloque A).

Tanda **1B — parte 2: el badge BAJA al leer + el Realtime queda DIFERIDO** (2026-08-02,
**migración 032**; ver nota técnica 19):
- **El bug (segundo síntoma, independiente del Realtime):** al abrir un mensaje el badge **no se
  descontaba** hasta un F5. Causa: `mensajesIniciales` **sembraba un `useState`**, así que el
  componente se quedaba pegado al valor del montaje — `revalidatePath` recalculaba la prop en el
  servidor pero nada pisa el estado de un componente que **no se remonta**. Es el mismo error de
  fondo que la nota 19 ya documentaba para los avisos del sistema.
- **Fix (`components/layout/notificaciones-bell.tsx`):** se eliminó ese `useState`. La lista se
  **deriva en cada render** de la prop del servidor (base) **mergeada por id** con los mensajes que
  llegaron por Realtime y todavía no están en la prop; un estado aparte (`mensajesAbiertos`) oculta
  al instante los que el usuario abre. **El estado local guarda solo lo que el servidor todavía no
  sabe**, no una copia de lo que ya manda.
- **`marcarMensajeLeido` (`(app)/notificaciones/actions.ts`):** suma `revalidatePath('/mensajes')` y
  `revalidatePath('/', 'layout')` — el contador de los dos badges se calcula en `(app)/layout.tsx`,
  y los grupos de rutas no agregan segmento a la URL, así que ese layout solo se alcanza
  invalidando por la raíz. Además el upsert de `mensajes_lecturas` pasó a **`ignoreDuplicates: true`**
  (`ON CONFLICT DO NOTHING`): con el default (`DO UPDATE`) marcar dos veces el mismo mensaje grupal
  **fallaba**, porque esa tabla **no tiene política de UPDATE**. Se resolvió **sin tocar la base**.
- **Migración 032 — `REPLICA IDENTITY FULL` en `mensajes_internos`** (aplicada). Compañera de la
  023: el canal filtra por `medico_id`, que **no es la PK**, y con identidad DEFAULT la fila
  replicada no lleva esa columna. ⚠ **La hipótesis quedó REFUTADA** (con FULL aplicado el evento
  sigue sin llegar), pero **la migración se conserva**: deja la tabla en el estado que el filtro
  necesita. Ver `schema.sql` → sección REALTIME.
- **Limpieza:** se borró `components/notificaciones/mensaje-card.tsx` (código muerto, 0 importadores).
- ⏸ **El Realtime quedó DIFERIDO**, no resuelto: agotados publicación, replica identity, RLS,
  GRANTs, persistencia, forma del INSERT y cliente —todo **descartado por experimento**—, la causa
  quedó acotada a **infraestructura del servicio Realtime de Supabase**, fuera del repo. La
  instrumentación `[RT avisos]` se **removió** al diferir. Diagnóstico completo, lista de descartes
  y próximo paso (logs del dashboard → soporte) en `PENDIENTES.md` → Bloque A.

Tanda del **modal del hilo desde la campanita** (2026-08-03, sin migración; ver nota técnica 20):
- **El bug:** clickear un mensaje en la campanita cambiaba la URL a `/mensajes?hilo=X` pero el modal
  **solo aparecía tras F5**. **PREEXISTENTE** —nació con el deep-link en `098dbc1`—, no lo introdujo
  la tanda del badge: el `href` del `<Link>` es byte-idéntico antes y después.
- **Causa:** `components/mensajes/bandeja.tsx` derivaba el hilo abierto de un **inicializador
  perezoso de `useState`**, que corre **una sola vez al montar**; en una navegación en cliente
  `Bandeja` no se remonta, así que el prop nuevo llegaba y el estado no se recalculaba.
- **Fix — la URL como única fuente de verdad:** el hilo abierto se **deriva de `useSearchParams()`
  durante el render**; abrir y cerrar sincronizan la URL (History API) y **cerrar limpia el
  `?hilo`**. Se eliminó `hiloInicial` de `(app)/mensajes/page.tsx` (mantenerlo como fallback
  **reabría el modal solo** al cerrarlo) y el clic **dentro de la bandeja** se unificó al mismo
  mecanismo: **un solo camino** para abrir el modal.
- **Limitación conocida:** si el hilo no está entre las **100** conversaciones que trae
  `obtenerBandeja()` (`.limit(100)`), el modal **no abre** (no crashea). Anotada en `PENDIENTES.md`.

**Pendiente:** ver `PENDIENTES.md` (pulidos finales en tres bloques: Funcional,
Seguridad, Estético), el bucket **`difusion`** (aún no creado; `documentos` y `estudios`
ya existen por migración), el **opt-out de difusión** (Ley 25.326, bloqueante de go-live), la
**Fase 2 de la CSP** (sacar `script-src 'unsafe-inline'` del enforcement — bloqueada porque el
nonce no se propaga en Vercel, ver nota 17) y la sección "Recetas" (bloqueada por certificación
ANMAT). El canal **WhatsApp** sigue **sin implementar** (`difusion_posts.canal` lo acepta, pero
solo se envía por email).

---

## Documentación del proyecto

- **`README.md`** — puesta en marcha para desarrolladores (requisitos, instalación, scripts).
- **`DESIGN.md`** — sistema de diseño (paleta OKLCH, tipografía, componentes, categorías del turnero).
- **`schema.sql`** — snapshot consolidado del esquema (tablas, funciones, triggers, RLS). No reemplaza las migraciones de `supabase/migrations/`.
- **`PENDIENTES.md`** — tareas de pulido (Funcional / Seguridad / Estético) con ubicaciones en el código.
- **`src/types/`** — tipos por dominio + `index.ts` (barrel). Deriva del esquema; **no** hay tipos autogenerados por Supabase.

---

## Mapa de tipos (`src/types/`)

Qué archivo abrir para revisar un tipo, **sin depender del barrel**. Los tipos se importan desde
`@/types` (barrel `index.ts`), pero **viven agrupados por dominio** y un archivo puede contener
varias entidades — `pedido.ts` es el caso extremo, con **seis**. Al tocar tipos, **mantené esta
organización** (no consolidar en un archivo, no crear uno por entidad).

| Archivo | Tipos que viven ahí |
|---|---|
| `roles.ts` | `UserRole`, `Profile` (+`Insert`/`Update`), `PermisosAsistente`, `PermisoKey`, `PERMISOS_DEFAULT`, `PERMISO_LABELS`, `PERMISOS_GRUPOS`, `Matricula`, `MatriculaTipo`, `TITULOS_DISPONIBLES`, `TituloPreset`, `SolicitudAsistente` (+`Insert`/`Update`), `SolicitudEstado` |
| `paciente.ts` | `Paciente` (+`Insert`/`Update`), `PacienteWithObraSocial`, `ObraSocial`, **`PacienteBusqueda`** (proyección de `GET /api/pacientes?q=`: 8 campos + `obras_sociales ( nombre )`) |
| `consulta.ts` | `Consulta` (+`Insert`/`Update`), `ConsultaEstado`, `ConsultaConRelaciones`, `CampoExtra`, `CampoExtraSeccion` |
| `pedido.ts` | ⚠ **seis entidades:** `Pedido`, `Certificado` (+`CertificadoTipo`), `Receta`, `Evolucion`, `HistoriaClinica` y `Estudio` (cada una con sus `Insert`/`Update`), más **`EmisorSnapshot`** (regla de negocio 11) |
| `turno.ts` | `Turno` (+`Insert`/`Update`), `TurnoEstado`, `BloqueoAgenda` (+`Insert`), `TurnoAuditLog`, más **dos proyecciones con join**: **`TurnoConPaciente`** (`GET /api/turnero` → `paciente:paciente_id (id, nombre_completo)`) y **`TurnoParaRecordatorio`** (cron → `paciente:paciente_id(nombre_completo, email, telefono)`) |
| `mensaje.ts` | `MensajeInterno`, `MensajeInsertar`, `MensajeFormValues`, `MensajeNoLeido`, `MensajeLectura` |
| `notificacion.ts` | `Notificacion`, `NotificacionTipo`, `NotificacionTipoValor`, `ItemPendiente`, `ITEM_TYPE_SOLICITUD` |
| `difusion.ts` | `DifusionPost` (+`Insert`/`Update`), `DifusionEstado`, `DifusionCanal`, `DifusionEnvio` (+`Insert`) |
| `nota.ts` | `Nota` (+`Insert`/`Update`) |
| `index.ts` | **barrel** — solo `export *`, sin declaraciones propias |

**Trampas al buscar:** el nombre del archivo **no siempre coincide** con la entidad —`Certificado`,
`Receta`, `HistoriaClinica`, `Estudio` y `Evolucion` están todos en `pedido.ts`; `UserRole` y los
permisos en `roles.ts`—, y `MensajeLectura` refleja la **proyección del join** (`user_id`,
`leido_at`), no la tabla `mensajes_lecturas` completa. Para el mapeo **tabla ↔ tipo**, la referencia
es `schema.sql`.

> ⚠ **El shape de un join embebido lo fija CADA ENDPOINT, no la tabla — dos proyecciones de la misma
> relación NO son intercambiables.** Varios de estos tipos modelan una **respuesta concreta de la
> API**, no una fila: `TurnoConPaciente`, `TurnoParaRecordatorio`, `PacienteBusqueda`,
> `ConsultaConRelaciones`, `PacienteWithObraSocial` y `MensajeLectura`.
> **El caso testigo son los dos tipos de turno:** el turnero embebe `id + nombre_completo` (para
> navegar a la ficha) y el cron embebe `nombre_completo + email + telefono` (para mandar el
> recordatorio). **Ninguno es subconjunto del otro**, así que reusar uno en lugar del otro
> **prometería campos que la query no trae** — y como el cliente de Supabase **no tiene tipos
> generados** (ver convenciones), `tsc` **no puede detectar esa mentira**: se descubre en runtime.
> Antes de reusar uno de estos tipos en un endpoint nuevo, **comparar el `.select()`**; si difiere,
> va un tipo propio, con el endpoint de origen documentado en el JSDoc.

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
15. **Migración 031 — Rate limiting persistente (`src/lib/rate-limit.ts`).** El rate limiter
    vivía en un `Map` en la **memoria del proceso**; en Vercel serverless cada request cae en
    una instancia distinta y las lambdas se reciclan, así que los contadores no se compartían y
    **el login no tenía protección real de fuerza bruta**. Ahora el conteo vive en la tabla
    `public.rate_limits` y se incrementa de forma atómica vía la función `check_rate_limit`
    (RLS de la tabla activa **sin políticas**; EXECUTE solo `service_role`/`postgres` — ver
    `schema.sql` → sección RATE LIMITING). El módulo la llama con el **admin client** (el login
    ocurre sin sesión). **Fail-open:** si la RPC falla o tarda >2s (`AbortSignal.timeout`), se
    **permite** el request y se loguea — si esa tabla no responde, la auth tampoco, así que
    fail-closed convertiría un problema puntual en una caída total del login. La interfaz
    (`rateLimit`/`rateLimitAction`) es **async**; migrar a Redis a futuro sería reescribir solo
    ese módulo, sin tocar a los ~25 llamadores.
    **Límites por endpoint:** login **5/min** por IP+email (`login:<ip>:<email>`), registro
    **3/min** por IP (`registro:<ip>`), `/verificar/[codigo]` **30/min** por IP
    (`verificar:<ip>`). Las rutas API autenticadas conservan sus límites por `user.id`. La
    **limpieza** de ventanas viejas (`DELETE ... WHERE window_start < now() - 1h`) se sumó al
    cron `api/cron/recordatorios`, aislada. El mismo cron corrigió la comparación del
    `CRON_SECRET` a tiempo constante (`crypto.timingSafeEqual`).
16. **Difusión por email — dependencia operativa de env vars (Resend).**
    - **`RESEND_API_KEY` (requerida para enviar):** sin ella el envío de difusión no funciona;
      el resto de la app sí. ⚠ **El cliente de Resend se instancia de forma PEREZOSA** (en el
      primer envío, vía `getResendClient()` memoizado en `lib/email/resend.ts`), y la key
      faltante se reporta como `{ ok: false, error }` de `sendEmail` — o sea, queda registrada
      **por destinatario** en `difusion_envios`, igual que cualquier otro error de envío.
      **No se puede volver a un throw de nivel superior:** así estaba antes y **rompía el
      build**. `next build` importa el módulo al recolectar los datos de
      `/api/difusion/enviar`, así que sin la env var el build entero fallaba con
      *"Failed to collect page data for /api/difusion/enviar"* — un deploy real se cayó por
      esto. Reproducido y verificado el 2026-07-27: con el código viejo el build sin key falla;
      con el actual, pasa (exit 0).
    - **`RESEND_FROM` (opcional):** dirección remitente; si no está, cae a
      `onboarding@resend.dev`, el **sandbox** de Resend. En sandbox Resend **solo entrega a la
      casilla dueña de la cuenta**, así que el envío real a los emails de los pacientes requiere
      **verificar un dominio** en Resend (registros DNS) y setear `RESEND_FROM` con una dirección
      de ese dominio. Hasta entonces el flujo es probable de punta a punta, pero no llega a los
      pacientes.
    - Ritmo de envío: secuencial con pausa de 600 ms (~2/s, el rate del API de Resend) y tope
      diario de 100 (ver regla de negocio 12). El endpoint declara `runtime = 'nodejs'` porque el
      SDK de Resend no corre en Edge.
    - Ambas están documentadas en `.env.example` (`RESEND_API_KEY` activa con placeholder,
      `RESEND_FROM` comentada por ser opcional) y en `README.md` → Variables de entorno.
17. **CSP — dos cabeceras, y dos permisos que NO son residuo.** Hoy conviven a propósito la
    **CSP de enforcement** de `next.config.ts` (el piso real, endurecido en la Fase 1a) y la
    **`Content-Security-Policy-Report-Only`** con nonce por request de `src/proxy.ts` (el ensayo
    de la Fase 1b, que no bloquea nada). Antes de "limpiar" cualquiera de las dos:
    - **`font-src data:` es NECESARIO** — FullCalendar embebe su fuente de íconos `fcicons` como
      data-URI; quitarlo rompe los íconos del turnero (ya pasó en producción).
    - **`style-src 'unsafe-inline'` es IRREDUCTIBLE** con las librerías actuales: Radix (y
      Sonner, FullCalendar) escriben **atributos `style=""`** para posicionar popovers, selects y
      diálogos, y **los nonces no aplican a atributos** `style` (solo a elementos
      `<style>`/`<script>`). No intentar sacarlo.
    - ⚠ **El nonce no se propaga en Vercel:** síntoma confirmado en producción (los `<script>`
      salen sin `nonce=`), causa **abierta**; **Turbopack quedó descartado** (el mismo build con
      `next start` local sí inyecta el nonce). Es lo que bloquea la Fase 2 (sacar de verdad
      `'unsafe-inline'` de `script-src` en enforcement). Detalle en `PENDIENTES.md` → Bloque B.
18. **Fechas: en el servidor se formatea SIEMPRE con `formatFechaAR`, nunca con `format()` a
    secas.** `src/lib/utils/format-date.ts` expone `formatFechaAR(fecha, patron)` —
    `formatInTimeZone` de **`date-fns-tz`** fijando `TZ_AR = 'America/Argentina/Buenos_Aires'` —
    y acepta un string ISO o un `Date`.
    - **Por qué existe (bug real, no precaución teórica):** `format()` de date-fns y
      `toLocaleString()` renderizan en la zona horaria **del runtime**, y en **Vercel el runtime
      es UTC**. Todo lo formateado en Server Components y Route Handlers salía **+3 h**; y como
      el mismo instante alimenta día y hora, un **turno nocturno se mostraba en el día
      equivocado** (un turno de las 22:30 ART figuraba al día siguiente, 01:30). ⚠ **Es
      invisible en dev:** con la máquina en UTC-3 se ve bien; para reproducirlo hay que ir al
      deploy o forzar `TZ=UTC`.
    - **El parseo NUNCA fue el problema:** PostgREST serializa los `timestamptz` como ISO **con
      offset**, así que `new Date(...)` siempre construyó el instante correcto. Lo que hay que
      fijar es la zona **de salida**. Por eso el helper recibe el **string ISO original** y no un
      `Date` ya parseado — no agregar `new Date()` intermedios al llamarlo.
    - **Alcance:** aplica a **server-side**. En Client Components el navegador ya está en la zona
      del usuario, y ahí sí se usa `format()`/`toLocaleString()` (turnero, `turno-form`, etc.).
    - ⚠ **Todavía sin unificar:** `formatFecha`/`formatFechaLarga` de `lib/utils.ts` tampoco
      fijan zona. Hoy **no hay bug** porque solo reciben columnas `DATE` (sin hora), pero pasarles
      un `timestamptz` reactiva el problema. Ver `PENDIENTES.md` → Bloque A → "Bugs menores".
19. **Notificaciones: el badge y la página derivan de UNA fuente compartida — no agregar una query
    suelta.** Todo lo "pendiente de leer" se normaliza a `ItemPendiente`
    (`src/types/notificacion.ts`) en `src/app/(app)/notificaciones/actions.ts`, y **la tabla
    `notificaciones` se lee en un único lugar** (`leerNotificacionesSistema`, privada), con dos
    wrappers por contexto: `obtenerItemsPagina()` (página: solicitudes + avisos, **historial
    completo**) y `obtenerNotificacionesNoLeidas()` (badge: **solo no leídos**). El bug que esto
    cierra fue precisamente que cada lado definiera su propio universo por su cuenta: el badge
    contaba solicitudes + mensajes y la página leía la tabla, así que un aviso de "turno agendado"
    salía en la lista pero no en el número. **Si aparece un `tipo` nuevo de notificación, entra por
    ahí y lo ven los dos; no sumar una query aparte en el layout ni en la página.**
    - **Alcance por rol:** los avisos del sistema **solo los lee el médico**. La RLS
      `notificaciones_select` es `medico_id = auth.uid()` (no `get_medico_id()`), así que para un
      asistente la consulta devolvería siempre vacío — un resultado engañoso, indistinguible de "no
      hay avisos". Por eso `leerNotificacionesSistema` **corta con `[]` si el rol no es médico**,
      antes de tocar la tabla, y el `(app)/layout.tsx` ni siquiera la invoca para asistentes. El
      chequeo va en la función y no solo en el llamador porque se exporta desde un archivo
      `'use server'`: es invocable por cualquier cliente autenticado.
    - ⚠ **Ningún sumando del badge se SIEMBRA en `useState` con una prop.** Los avisos del sistema se
      leen **directo de la prop**; los mensajes se **derivan en cada render** de la prop mergeada por
      id con lo que llegó por Realtime (`mensajesRealtime`), y solo eso último vive en estado. La
      regla es: **el estado local guarda únicamente lo que el servidor todavía no sabe**. Sembrar la
      prop en un `useState` fue exactamente el bug de la 1B-parte-2 — el badge se quedaba pegado al
      valor del montaje y **no bajaba al leer**, porque `router.refresh()`/`revalidatePath` no pisan
      el estado de un componente que **no se remonta**.
    - El **marcado de leído** corre en un **efecto de cliente**
      (`components/notificaciones/marcar-leidas.tsx`), no en el render de la página: la action llama
      `revalidatePath`, **no soportado durante el render**.
    - ⚠ **`mensajes_lecturas` no tiene política de UPDATE.** Los upserts sobre esa tabla van con
      **`ignoreDuplicates: true`** (`ON CONFLICT DO NOTHING`); con el default (`DO UPDATE`) marcar
      dos veces el mismo mensaje grupal **falla por RLS**. Además no hay nada que actualizar: la fila
      es solo la PK `(mensaje_id, user_id)`.
20. **El modal del hilo se DERIVA de la URL — no volver a sembrarlo en `useState`.** En
    `src/components/mensajes/bandeja.tsx` el hilo abierto sale de
    `useSearchParams().get('hilo')` **durante el render**, y el modal se muestra buscando ese id
    entre los threads. **No hay estado ni setter para el modal**, y `(app)/mensajes/page.tsx` **no**
    pasa el param como prop.
    - **Por qué (bug real, no precaución):** antes el hilo abierto se calculaba en un
      **inicializador perezoso de `useState`**, que corre **una sola vez al montar**. Al clickear un
      mensaje en la campanita se navega a `/mensajes?hilo=X`, pero si `Bandeja` **ya está montada**
      React la reconcilia sin remontarla: el prop nuevo llegaba y el estado **no** se recalculaba, así
      que el modal **solo abría tras F5**. Mismo error de fondo que la nota 19.
    - **Una sola fuente de verdad.** No agregar un fallback tipo `searchParams.get('hilo') ?? prop`:
      al cerrar, la URL pierde el param **al instante** pero la prop del servidor todavía trae el id
      viejo, así que el fallback **reabre el modal solo**. Por la misma razón el clic **dentro de la
      bandeja** también abre por URL: un solo camino, no dos mecanismos.
    - **Se usa la History API (`window.history.pushState/replaceState`), no `router.push/replace`.**
      Next las integra con el router y **sincronizan `useSearchParams`**
      (`node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md`). Con `router.*` cada
      apertura y cierre dispararía un **round-trip RSC** (la page re-ejecuta auth + `obtenerBandeja` +
      `obtenerUsuariosTenant`) y, como `useSearchParams` recién cambia cuando la navegación
      *commitea*, el modal quedaría **esperando al servidor**: el clic se siente muerto. `push` al
      abrir (el botón atrás cierra el modal), `replace` al cerrar (no ensucia el historial).
    - **Hidratación:** `useSearchParams()` solo fuerza render en cliente si la ruta es
      **prerenderizada**; `/mensajes` es **dinámica** (auth por cookies) —sale como `ƒ` en el build—,
      así que el hook ya tiene el param en el render del servidor, el primer render del cliente
      coincide y **no hace falta un `<Suspense>`**. Si alguna vez esa ruta se volviera estática, esto
      hay que revisarlo.
    - ⚠ **Limitación:** el hilo se busca entre los threads cargados y `obtenerBandeja()` tiene
      `.limit(100)`; un hilo más viejo **no abre** (no rompe). Ver `PENDIENTES.md` → Bloque A.
21. **La API imperativa de FullCalendar NO se llama en forma síncrona desde un `useEffect` — se
    difiere a `queueMicrotask`.** `api.changeView()` (y en general cualquier método de FullCalendar que
    haga un flush interno) usa **`flushSync`** por dentro. Llamarlo derecho desde el cuerpo de un
    efecto puede caer **mientras React todavía está renderizando**, y React avisa con
    *"flushSync was called from inside a lifecycle method. React cannot flush when React is already
    rendering."*.
    - **Bug real, no precaución:** apareció en `calendar-view.tsx` al migrar `useIsMobile` a
      `useSyncExternalStore` (serie "lint a 0", 2026-08-06). Con el `useState + useEffect` anterior el
      flush caía en un momento seguro por casualidad; con la semántica de scheduling de
      `useSyncExternalStore` dejó de caer ahí. Es warning de **desarrollo** —la vista cambiaba igual—,
      pero es una llamada síncrona en un momento que React marca como incorrecto.
    - **El patrón:** calcular el objetivo en el cuerpo del efecto, y **diferir la llamada**:
      ```ts
      let cancelled = false
      queueMicrotask(() => {
        if (cancelled) return
        const api = calendarRef.current?.getApi()
        if (!api) return
        if (api.view.type !== targetView) api.changeView(targetView)
      })
      return () => { cancelled = true }
      ```
      El flag de cancelación en el cleanup evita actuar sobre un calendario ya desmontado (o pisar con
      un objetivo viejo si la dependencia cambió otra vez). ⚠ **`queueMicrotask`, no `setTimeout`:** el
      microtask corre en el **mismo tick**, apenas React termina, así que no hay frame de demora ni
      parpadeo. Y el `getApi()` va **adentro** del microtask, para leer el estado del calendario en el
      momento real de la llamada.
    - **Alcance:** aplica a **toda** llamada imperativa desde un efecto. Las de
      `handleEventDrop`/`handleEventResize`/`refreshAction` corren en **handlers de evento** —fuera del
      render— y no necesitan esto. El inventario de las que quedan (y cuál mirar primero si el warning
      reaparece) está en `PENDIENTES.md` → "Prolijidad del turnero".
