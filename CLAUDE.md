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
  /constants         → nav-items.ts (navegación por rol+permiso),
                       difusion.ts (DIFUSION_LIMITE_DIARIO, compartida cliente/servidor)
  /contexts          → permisos-context.tsx (+ MensajesContext para badge no leídos)
  /hooks             → use-view-mode.ts (preferencia mosaico/lista; los 4 stubs se eliminaron)
  /lib
    /supabase        → client.ts (browser) · server.ts (RSC/actions) · admin.ts (service role, bypass RLS)
    /agenda          → solapamiento.ts (criterio ÚNICO de "franja ocupada" — ver nota 23)
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
| `profiles` | Extiende `auth.users`: rol, `medico_id`, firma/sello, 12 permisos, `dni` (opcional, único **global** — mig. 044, nota 27) | — |
| `obras_sociales` | Catálogo (lectura pública autenticada). ⚠ **No tiene fila para "sin obra social"**: eso se modela como AUSENCIA (la homónima del seed se eliminó en la mig. **045** — nota 28) | — |
| `pacientes` | Pacientes (DNI único **por tenant** desde la mig. 043 — nota 27). `archivado_at` → archivar en vez de borrar | `creado_por` |
| `historia_clinica` | ⚠ **DORMIDA** (modelo viejo de HC: documento único de antecedentes 1:1). **La app ya no la lee ni la escribe**: se dio de baja el endpoint `POST /api/pacientes/[id]/historia` y el insert de fila vacía del alta de pacientes. **La tabla NO se dropeó** (Ley 26.529) y conserva sus filas históricas | vía `pacientes` |
| `consultas` | Consultas cronológicas de HC (Bloque 1, diabetología). `campos_extra` (JSONB) ad-hoc. `creado_por` = **autor** (mig. 038; ⚠ **NULL** en las anteriores, y **no** es el tenant) | `medico_id` |
| `estudios` | Archivos adjuntos por paciente (subir/ver/descargar/borrar **implementado**). Bucket privado `estudios` (migración 026), ruta `{medico_id}/{paciente_id}/{uuid}.{ext}` | vía `pacientes` |
| `evoluciones` | Series de laboratorio/antropometría (legacy, gráficos) | vía `pacientes` |
| `turnos` | Agenda. `categoria`, `origen`, `consulta_id` (Bloque 4). Índice único **parcial** `turnos_consulta_id_unico` (mig. 038): **un turno por consulta** | `medico_id` |
| `bloqueos_agenda` | Bloqueos de horario. `updated_at` + trigger (mig. 036); RLS con permiso y a `authenticated` (mig. 037) | `medico_id` |
| `turnos_audit_log` | Log de cambios de turnos (trigger `turno_audit_trigger`, **AFTER INSERT/UPDATE/DELETE**). Desde la mig. **040 audita también los BORRADOS**: `medico_id` desnormalizado (es el tenant real — la RLS ya **no** hace JOIN al turno), `turno_id` **nullable** con FK `ON DELETE SET NULL` (antes `CASCADE` borraba el historial entero). La fila `'eliminado'` nace con `turno_id NULL` y el id del turno queda en `detalle` | `medico_id` |
| `pedidos` | Pedidos de estudios + PDF + QR (`codigo_verificacion`, `estado`). PDF **congelado al emitir** en bucket `documentos` (`pdf_path`), + `emisor_snapshot` (JSONB, mig. 028) | vía `pacientes` |
| `certificados` | Certificados + PDF + QR + `valido_hasta`. PDF **congelado al emitir** en bucket `documentos` (`pdf_path`), + `emisor_snapshot` (JSONB, mig. 028) | vía `pacientes` |
| `recetas` | Estructura lista; emisión **bloqueada** (ANMAT pendiente) | vía `pacientes` |
| `difusion_posts` / `difusion_envios` | Comunicación y su historial de envíos. `difusion_envios` es el **log de envíos**: una fila por destinatario, la escribe `POST /api/difusion/enviar` | `medico_id` |
| `solicitudes_asistente` | Workflow de vinculación (onboarding). Unicidad **parcial** (`WHERE estado='pendiente'`, mig. 034): el historial ya no bloquea una solicitud nueva | — |
| `notas` | Notas personales por usuario | `user_id` |
| `mensajes_internos` / `mensajes_lecturas` | Mensajería interna (individual/grupal). `ultima_actividad_at` (mig. **047**) es la columna por la que ORDENA y PAGINA la bandeja; la mantiene el trigger `mensajes_actividad_trigger` (ver nota 30). Sus 4 políticas exigen `acceso_mensajeria` + tenant desde la mig. **046** (ver nota 29). En la publicación `supabase_realtime` (mig. 023) y con `REPLICA IDENTITY FULL` (mig. 032), pero ⚠ la entrega en vivo **NO funciona y quedó DIFERIDA** — causa acotada a infraestructura de Supabase (ver `PENDIENTES.md` → Bloque A y `schema.sql` → REALTIME). ⚠ `mensajes_lecturas` **quedó FUERA de la 046 a propósito** (nota 29) y **no tiene política de UPDATE**: los upserts van con `ignoreDuplicates` | `medico_id` / `user_id` |
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

> ⚠ **Agenda — LEER exige permiso en las DOS tablas, con el MISMO criterio
> (`bloqueos_agenda` desde la migración `037`; `turnos` desde la `039`).** Ambas piden
> **`ver_turnos` OR `gestionar_turnos`**. **El `OR` es deliberado:** los 12 permisos son
> **independientes**, así que un asistente con `gestionar_turnos` y **sin** `ver_turnos` es
> configurable desde `/perfil`, y con un `USING` que pidiera solo `ver_turnos` se le romperían los
> endpoints de edición y borrado, que hacen fetch previo sobre esas mismas tablas.
> **Lo que cerró la `039`** (el hueco que quedaba en `turnos`): ese asistente **escribía turnos que
> no podía leer**, lo que además de 404 falsos producía **falsos negativos de solapamiento** — el
> helper de solapamiento consulta con el **cliente de sesión**, recibía `[]` y daba la franja por
> libre, dejando crear un turno encima de otro (ver **nota técnica 23**).
> ✅ **Y desde la migración `042` tampoco las diferencia el ROL.** Durante dos migraciones sí: las 4
> de `bloqueos_agenda` estaban en `TO authenticated` (037) y las de `turnos` seguían en `{public}`,
> porque la 039 usó `ALTER POLICY`, que **preserva el rol**. Nunca fue explotable (las políticas
> cuelgan de `get_medico_id()`, que para `anon` no resuelve), y la **042 lo cerró barriendo el
> proyecto entero**: las **49** políticas de `public` que no declaraban `TO` —en **18 tablas**, no
> solo la agenda— pasaron a `TO authenticated`, otra vez con `ALTER POLICY` para tocar **solo el rol**
> y no reescribir una sola expresión. Hoy las **65** políticas del esquema `public` están en
> `{authenticated}` y **ninguna** en `{public}`. Las dos tablas de la agenda son idénticas en criterio
> de lectura y en rol.

> ⚠ **Mensajería — `acceso_mensajeria` se EXIGE EN LA BASE desde la migración `046`.** Hasta ahí
> **ninguna** de las 4 políticas de `mensajes_internos` lo miraba: el permiso nació en la `015`, dos
> migraciones ANTES que la mensajería (`017`), y cuando llegó ese "uso futuro" nadie lo cableó a la
> RLS — un asistente con el permiso en FALSE que le pegara a PostgREST directo leía, escribía y
> borraba igual. Era el **tercer y último** caso del mismo hueco en el esquema (`consultas` → `025`,
> `estudios` → `026`); con la 046 no queda ninguna tabla en esa situación.
> La 046 aplicó además el **tenant donde faltaba**: `mensajes_ver` lo pedía **solo** en la rama
> grupal, así que un mensaje **individual sobrevivía a un cambio de médico**. Desde acá el tenant
> manda también sobre los individuales, y un usuario que cambia de médico **pierde** acceso a los
> mensajes del anterior. ⚠ **La asimetría entre LEER y BORRAR es DELIBERADA** —el titular puede
> borrar un individual entre dos asistentes pero no leerlo—: ver **nota técnica 29**.

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
- **Se arregla ahora o muere ahora.** Un hallazgo colateral **inofensivo** —un comentario que miente,
  un import huérfano, un nombre que dice lo contrario de lo que hace— se **resuelve en el momento** o
  se **descarta**: no se anota en `PENDIENTES.md` "para después". **Anotar queda reservado para lo
  importante que no entra en la tanda actual** (lo que cambia comportamiento, necesita una decisión
  de producto, o pide su propia verificación). El motivo es concreto: los ítems chicos anotados
  envejecen mal y terminan **mintiendo** —el comentario del PATCH de bloqueos figuró como pendiente
  meses después de estar arreglado—, y un `PENDIENTES.md` con ruido esconde lo que sí importa.

---

## Reglas de negocio críticas

1. **HC inmutable:** una `consulta` en estado `finalizada` no se edita desde la UI.
   Solo el médico finaliza (el asistente con permiso puede crear en `borrador`).
   La **consulta** es la unidad de actuación clínica. ⚠ La tabla `historia_clinica` es el
   **modelo viejo** y quedó **dormida**: ya no se crea una fila por paciente, y las que
   quedan (históricas) **no** cuentan como actuación. Un `borrador`, en cambio, **sí se
   puede descartar** — ver regla 13.
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
   turnos, pedidos, certificados, recetas — la fila dormida de `historia_clinica`, si la
   hay, no cuenta). Archivar / desarchivar /
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
13. **Descartar un borrador de consulta:** una `consulta` en `borrador` se **elimina físicamente y
    sin rastro** — no hay archivado ni log, contraste **deliberado** con pacientes (regla 9, que se
    archivan por la Ley 26.529). Se pudo hacer así porque `consultas` **no tiene trigger de
    auditoría**: "sin rastro" se cumple solo. **Quién puede: el médico** (cualquier borrador de su
    tenant) **o el asistente que la creó** (`consultas.creado_por`, migración 038 — la tabla era la
    única de su familia sin columna de autor; `medico_id` es el **tenant**, no el autor).
    ⚠ Los borradores **anteriores a la 038** tienen `creado_por NULL` → **solo el médico** los
    descarta (con NULL, `creado_por = auth.uid()` da NULL y no pasa: sale de la lógica ternaria de
    SQL, no hay caso especial). La regla vive en **tres capas**: la política `consultas_delete`
    (tenant + `estado='borrador'` + médico OR autor), el **chequeo explícito de autoría** en
    `DELETE /api/consultas/[id]` (403) y la **visibilidad del botón** en la UI. El endpoint además
    rechaza con **409** si el paciente está archivado (regla 9) y trae **guarda de "0 filas"** (403,
    la lección de la 033). Una consulta **finalizada no se borra nunca** (regla 1) y **desde la 038
    eso lo garantiza la base**, no solo el código.

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
- ✅ **La limitación que dejó esta tanda YA NO EXISTE.** Decía que si el hilo no estaba entre las
  **100** conversaciones que traía `obtenerBandeja()` (`.limit(100)`), el modal **no abría**. Las dos
  mitades caducaron: el tope de 100 lo reemplazó la **paginación** (nota 30) y el modal **abre por
  id** desde la tanda de mensajería (ver más abajo y nota 20).

**GRUPO 1 — cinco tandas, migraciones 034–038** (2026-08-07/08). Bugs de datos, de agenda y el
hueco de los borradores. ⚠ **Trae el único cambio de COMPORTAMIENTO visible del grupo** (el
momento en que se crea el turno de la agenda, ver nota técnica 22):
1. **Dedup de `/perfil`** — la página consume `obtenerAsistentes()` (que tenía **cero
   consumidores** mientras la página duplicaba su consulta inline); `SolicitudPendientePayload`
   reemplazó un tipo anónimo en `onboarding/actions.ts`; y la interface **`Asistente` se mudó** de
   `perfil-form.tsx` a `types/roles.ts` (pasó de tipo de componente a tipo de dominio).
2. **Migración 034 — el asistente desvinculado podía volver a solicitar vinculación.** La
   `UNIQUE(solicitante_id, medico_id)` **total** daba una fila por par **en toda la historia**, así
   que la solicitud vieja (`aprobada`/`rechazada`) bloqueaba la nueva para siempre. Pasó a **índice
   único PARCIAL** `WHERE estado = 'pendiente'` (⚠ índice y no constraint: Postgres no admite
   UNIQUE parciales). **Sin una línea de código:** la causa era la constraint, no el `if`.
3. **Migración 035 (IOSEP) + la obra social como texto libre.** `obra_social_otro` ahora se muestra
   en pedidos, certificados y dashboard (fallback con `.trim()`); `PacienteBusqueda` sumó el campo
   (**9 campos**) y absorbió al tipo local `PacienteSugerido`. ⚠ Los **documentos ya emitidos**
   conservan el valor vacío: el snapshot es inmutable (regla 5), no hay backfill.
4. **Turno `desde_hc` con el campo Paciente vacío al editar** — `turno-form.tsx` sembraba el
   buscador solo desde `paciente_nombre_libre` y nunca leía el join `paciente.nombre_completo`.
5. **Trazabilidad de agenda (036 + 037) y solapamiento.** La **036** sumó `updated_at` + trigger a
   `bloqueos_agenda` (compañera de la 033: recién desde que son editables tiene sentido registrar
   cuándo; las filas existentes se sembraron con `created_at`, no con `now()`). La **037** hizo que
   `bloqueos_select` exija **`ver_turnos` OR `gestionar_turnos`** y normalizó las 4 políticas a
   `TO authenticated`. Y el chequeo de solapamiento dejó de contar los turnos `cancelado` y
   `pendiente_confirmar` en **4 sitios** del turnero. ⚠ **Ese último criterio lo SUPERSEDIÓ el
   Grupo 2:** hoy `pendiente_confirmar` **sí ocupa** la franja — ver **nota técnica 23**.
6. **Migración 038 — descartar borradores + el turno solo al finalizar.** Columna
   `consultas.creado_por`, `consultas_delete` reescrita (tenant + `estado='borrador'` + médico OR
   autor) e índice único `turnos_consulta_id_unico`. En código: el descarte de borradores (autoría,
   paciente archivado, guarda de "0 filas") y **el turno `desde_hc` pasó a crearse SOLO al
   finalizar la consulta**, no al guardar un borrador. Ver **regla de negocio 13** y **nota 22**.

**GRUPO 2 — cuatro tandas, migraciones 039–040** (2026-08-10/11). Cierra los seguimientos de agenda
que dejó el Grupo 1 y da de baja el último eslabón del modelo viejo de HC:
1. **Criterio único de "franja ocupada" (sin migración).** Nuevo helper
   **`src/lib/agenda/solapamiento.ts`**: consolidó **12 queries de solapamiento en 6 endpoints** en
   una implementación. Estados que ocupan como **lista de inclusión**, **"nada se pisa con nada"**
   (turno-vs-turno ya no filtra por `categoria`), **propagación del error** (cerró un fail-open en 8
   de las 12 queries) y un **fetch previo** en el PATCH de turnos que cerró el agujero de "una sola
   fecha". Tipo nuevo `TurnoCategoria`. Ver **nota técnica 23**.
2. **Migración 039 — `turnos_select` acepta `ver_turnos` OR `gestionar_turnos`**, espejando a
   `bloqueos_select` (037). Cierra en la base el **falso negativo de solapamiento** que el helper no
   podía cerrar por sí solo. Ver **Auth y roles**.
3. **Migración 040 — `turnos_audit_log` audita los DELETE.** `medico_id` desnormalizado (backfill +
   NOT NULL), `turno_id` nullable con FK `ON DELETE SET NULL`, rama `DELETE` en `log_turno_cambio`,
   trigger recreado como **AFTER INSERT OR UPDATE OR DELETE** (cierra la discrepancia histórica
   BEFORE/AFTER) y `audit_select` sin JOIN al turno. Tipo `TurnoAuditLog` actualizado.
4. **Baja del modelo viejo de HC (sin migración).** Se eliminaron `POST /api/pacientes/[id]/historia`,
   `lib/validations/historia.schema.ts`, los tipos `HistoriaClinica*` y el insert de fila vacía del
   alta de pacientes. **La tabla `historia_clinica` quedó DORMIDA**, no dropeada. ⚠ El valor
   `origen='desde_hc'` **se conservó**: lo usa el flujo vivo de consultas.

**GRUPO 3 — obra social "particular" y limpieza del turnero, migración 045** (2026-08-20).
Dos frentes independientes:
1. **"Particular / Sin obra social" pasa a modelarse como AUSENCIA (migración 045).** Se eliminó
   del catálogo la fila homónima que sembraba la 001 —convivía con la opción hardcodeada del
   formulario y hacía que dos pacientes igualmente particulares quedaran modelados distinto—, con
   `UPDATE` previo de los pacientes que la apuntaran. El literal se unificó en
   **`SIN_OBRA_SOCIAL_LABEL`**, aplicado como fallback **en los consumidores** (⚠ `resolverObraSocial`
   **no cambió**, y la difusión es una excepción deliberada). `/pacientes` sumó el **filtro** de
   pacientes sin obra social (centinela `FILTRO_SIN_OBRA_SOCIAL`) y un **contador de resultados
   permanente**. Ver **nota técnica 28**.
2. **Escapado de LIKE unificado + limpieza (sin migración).** Nuevo **`sanitizarTextoBusqueda`**,
   que absorbió a la `sanitizeSearchQuery` muerta y llevó el escapado a `/pedidos` y
   `/certificados`, que no lo tenían. Y se eliminaron: el estado `currentView` de
   `calendar-view.tsx` con sus props `viewDidMount`/`datesSet` (no sostenían nada visible), el
   `export` de `CATEGORIA_STYLES`, el tipo `ConsultaConRelaciones`, el stub
   `src/constants/obra-sociales.ts` y una prop muerta de la página de historia clínica, que además
   sumó filtro de tenant a la query del paciente.

**MENSAJERÍA — cuatro tandas, migraciones 046–047** (2026-08-21/22). **047 es la última migración
aplicada.** Cierra el último hueco de RLS del esquema, cambia el orden de la bandeja y termina con
el deep-link mudo:
1. **Seguridad de las server actions (sin migración).** Todas las actions del dominio
   —`obtenerBandeja`, `obtenerHilo`, `eliminarMensaje` (`(app)/mensajes/actions.ts`) y
   `enviarMensaje`, `marcarMensajeLeido`, `obtenerUsuariosTenant`, `contarMensajesNoLeidos`,
   `obtenerMensajesNoLeidos` (`(app)/notificaciones/actions.ts`)— aplican hoy las **tres** cosas que
   la app implica: **validación del id** que reciben (`uuidSchema`), **`acceso_mensajeria`** y
   **filtro de tenant**. El canon es `resolverAcceso` (nota 24); ⚠ **`obtenerBandeja` es la
   excepción deliberada** —hace el chequeo a mano con `tenantDeProfile` porque ya leyó el `profile`
   para otra cosa, y una query interna sería una **segunda lectura de la misma fila**—.
   Puntualmente: `eliminarMensaje` no tenía **ninguna** guarda y
   devolvía éxito aunque la RLS rechazara el borrado (ahora exige rol médico y trae **guarda de
   "0 filas"**, la lección de la 033 — pero ver el ⚠ de la nota 29); `obtenerBandeja` calculaba el
   tenant, lo validaba y **nunca lo usaba** para filtrar; los **dos contadores** de la campanita
   filtraban por tenant los grupales y **no** los individuales, así que el badge contaba mensajes
   de un consultorio anterior que la bandeja ya no listaba —un número que no se podía bajar—; y
   `enviarMensaje` no exigía el permiso al **remitente** ni validaba el `parent_id` (ahora el padre
   tiene que **existir, ser del tenant y ser RAÍZ**, lo que cierra la vía para crear un hilo de
   tres niveles). Se corrigió además la revalidación de `revalidatePath('/', 'layout')` al eliminar.
   ⚠ **Regla de producto que queda establecida: el tenant manda TAMBIÉN sobre los mensajes
   individuales.** Un usuario que cambia de médico **pierde** acceso a los mensajes del anterior.
2. **Migración 046 — la RLS deja de pedir menos que la app.** Las **cuatro** políticas de
   `mensajes_internos` pasaron a exigir `acceso_mensajeria` (vía `check_permiso`, que exime al
   titular) y a aplicar el tenant donde faltaba, con `ALTER POLICY` (preserva el rol, ya normalizado
   por la 042). De paso se le fijó `SET search_path = public` a **`get_medico_id()`**, la única
   función `SECURITY DEFINER` del esquema que no lo tenía — y la más usada. Ver **nota técnica 29**,
   que documenta la **asimetría deliberada** entre leer y borrar.
3. **Migración 047 — orden por actividad y paginación.** Columna `ultima_actividad_at` + trigger
   `AFTER INSERT` `SECURITY DEFINER`, backfill y `NOT NULL`; **dos índices parciales** nuevos; y la
   bandeja pasó del tope fijo de 100 conversaciones a **"cargar más" acumulativo con cursor**
   (`BANDEJA_PAGINA` / `BANDEJA_PAGINA_MAX` en `constants/mensajes.ts`). En el componente se
   corrigió un efecto que **reemplazaba la lista entera** en cada revalidación: como abrir un hilo
   dispara una, descartaba las páginas acumuladas y **podía cerrar el modal mientras el usuario
   leía**; ahora **mergea por id**. Ver **nota técnica 30**.
4. **Deep-link a cualquier hilo (sin migración).** `HiloModal` se abre **teniendo solo el id**
   (`hiloId` requerido + `mensajeRaiz` opcional como atajo de pintado) y resuelve el hilo con
   `obtenerHilo`; se agregaron los estados de **carga**, **conversación no disponible** y **error de
   red**. ⚠ Las causas de "no se pudo abrir" —no existe / se borró / sin permiso— se muestran con
   **el mismo texto**, a propósito, para que nadie deduzca qué ids existen probando. El hilo traído
   por id **no se agrega a la lista** de la bandeja. Ver **nota técnica 20**.

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
| `roles.ts` | `UserRole`, `Profile` (+`Insert`/`Update`), `PermisosAsistente`, `PermisoKey`, `PERMISOS_DEFAULT`, `PERMISO_LABELS`, `PERMISOS_GRUPOS`, `Matricula`, `MatriculaTipo`, `TITULOS_DISPONIBLES`, `TituloPreset`, `SolicitudAsistente` (+`Insert`/`Update`), `SolicitudEstado`, **`Asistente`** (se mudó desde `perfil-form.tsx`: es el shape que declara `obtenerAsistentes()` y consume `/perfil`) |
| `paciente.ts` | `Paciente` (+`Insert`/`Update`), `PacienteWithObraSocial`, `ObraSocial`, **`PacienteBusqueda`** (proyección de `GET /api/pacientes?q=`: **9 campos** + `obras_sociales ( nombre )`; incluye `obra_social_otro` desde el fix de la obra social como texto libre) |
| `consulta.ts` | `Consulta` (+`Insert`/`Update`), `ConsultaEstado`, `CampoExtra`, `CampoExtraSeccion`. ⚠ `ConsultaConRelaciones` se **eliminó** (código muerto: cero consumidores en toda la app) |
| `pedido.ts` | ⚠ **cinco entidades:** `Pedido`, `Certificado` (+`CertificadoTipo`), `Receta`, `Evolucion` y `Estudio` (cada una con sus `Insert`/`Update`), más **`EmisorSnapshot`** (regla de negocio 11). ⚠ **`HistoriaClinica*` se eliminó** al dar de baja el modelo viejo de HC (eran 6) |
| `turno.ts` | `Turno` (+`Insert`/`Update`), `TurnoEstado`, `BloqueoAgenda` (+`Insert`), `TurnoAuditLog`, más **dos proyecciones con join**: **`TurnoConPaciente`** (`GET /api/turnero` → `paciente:paciente_id (id, nombre_completo)`) y **`TurnoParaRecordatorio`** (cron → `paciente:paciente_id(nombre_completo, email, telefono)`) |
| `mensaje.ts` | `MensajeInterno`, `MensajeInsertar`, `MensajeFormValues`, `MensajeNoLeido`, `MensajeLectura` |
| `notificacion.ts` | `Notificacion`, `NotificacionTipo`, `NotificacionTipoValor`, `ItemPendiente`, `ITEM_TYPE_SOLICITUD`, **`SolicitudPendientePayload`** + el type-guard **`esPayloadSolicitud`** (lo produce `obtenerSolicitudesPendientes()` y lo consume el badge) |
| `difusion.ts` | `DifusionPost` (+`Insert`/`Update`), `DifusionEstado`, `DifusionCanal`, `DifusionEnvio` (+`Insert`) |
| `nota.ts` | `Nota` (+`Insert`/`Update`) |
| `index.ts` | **barrel** — solo `export *`, sin declaraciones propias |

**Trampas al buscar:** el nombre del archivo **no siempre coincide** con la entidad —`Certificado`,
`Receta`, `Estudio` y `Evolucion` están todos en `pedido.ts`; `UserRole` y los
permisos en `roles.ts`—, y `MensajeLectura` refleja la **proyección del join** (`user_id`,
`leido_at`), no la tabla `mensajes_lecturas` completa. Para el mapeo **tabla ↔ tipo**, la referencia
es `schema.sql`.

> ⚠ **El shape de un join embebido lo fija CADA ENDPOINT, no la tabla — dos proyecciones de la misma
> relación NO son intercambiables.** Varios de estos tipos modelan una **respuesta concreta de la
> API**, no una fila: `TurnoConPaciente`, `TurnoParaRecordatorio`, `PacienteBusqueda`,
> `PacienteWithObraSocial` y `MensajeLectura`.
> **El caso testigo son los dos tipos de turno:** el turnero embebe `id + nombre_completo` (para
> navegar a la ficha) y el cron embebe `nombre_completo + email + telefono` (para mandar el
> recordatorio). **Ninguno es subconjunto del otro**, así que reusar uno en lugar del otro
> **prometería campos que la query no trae** — y como el cliente de Supabase **no tiene tipos
> generados** (ver convenciones), `tsc` **no puede detectar esa mentira**: se descubre en runtime.
> Antes de reusar uno de estos tipos en un endpoint nuevo, **comparar el `.select()`**; si difiere,
> va un tipo propio, con el endpoint de origen documentado en el JSDoc.

---

## Mapa de helpers compartidos

Criterios que viven en **un solo lugar**. Antes de escribir uno nuevo, mirar si ya está acá: casi
todos nacieron de encontrar el mismo criterio duplicado y divergido en varios archivos.

| Helper | Archivo | Qué resuelve |
|---|---|---|
| `resolverObraSocial`, tipo `ConObraSocial` | `src/lib/pacientes/obra-social.ts` | Criterio ÚNICO de la obra social de un paciente: `obras_sociales?.nombre ?? (obra_social_otro?.trim() \|\| null)`. Unificó **12 sitios** que no eran idénticos (unos trimeaban y otros no). Módulo **neutro** y de parámetro **estructural**, para aceptar las filas sin tipar de supabase-js |
| **`SIN_OBRA_SOCIAL_LABEL`**, **`FILTRO_SIN_OBRA_SOCIAL`** | `src/lib/pacientes/obra-social.ts` | El literal `'Particular / Sin obra social'` y el centinela de URL del filtro de `/pacientes` (`'sin-obra-social'`). ⚠ **El fallback se aplica en cada CONSUMIDOR, NUNCA dentro de `resolverObraSocial`** — ver **nota técnica 28** |
| `resolverTenant`, `tenantDeProfile`, **`resolverAcceso`** | `src/lib/auth/tenant.ts` | Resolución del tenant (`medico_id` efectivo) y autorización por permiso. `tenantDeProfile` es la variante **pura**, para quien ya leyó el `profile`. `resolverAcceso` suma el chequeo de permiso y acepta **un permiso o un array (OR)**. Ver **nota técnica 24** |
| `formatFechaAR`, `formatFecha`, `formatFechaLarga`, `TZ_AR` | `src/lib/utils/format-date.ts` | Formateo de fechas en zona AR. El motor lanza; los dos wrappers degradan al texto crudo. Ver **nota técnica 18** |
| **`parseFechaHoraAR`** | `src/lib/utils/format-date.ts` | La **inversa**: ancla una hora de PARED argentina (sin offset) al instante correcto, para persistirla en un `timestamptz`. ⚠ Forma **PAR** con `formatParaInputAR`. Ver **nota técnica 25** |
| **`formatParaInputAR`** | `src/lib/utils/format-date.ts` | La otra mitad del par: instante → string `"YYYY-MM-DDTHH:mm"` para un `<input type="datetime-local">`, en zona AR. ⚠ **No se toca sola**: convertir un solo lado del par corrompe datos en silencio. Ver **nota técnica 25** |
| `buscarSolapamientos` | `src/lib/agenda/solapamiento.ts` | Criterio ÚNICO de "franja ocupada" de la agenda. Ver **nota técnica 23** |
| **`sanitizarTextoBusqueda`** | `src/lib/validations/shared.ts` | Criterio ÚNICO para meter el `?q=` de una búsqueda dentro de un `ilike`: `trim` → `slice(maxLen)` → escape de `%`, `_` y `\`. ⚠ **El escapado va DESPUÉS del recorte de longitud**: al revés, el corte puede partir al medio un par `\%` y dejar un backslash colgado. Lo usan los **4** buscadores por nombre/DNI (`/pacientes`, `GET /api/pacientes`, `/pedidos`, `/certificados`). ⚠ El resultado es para el **patrón**, no para la UI: el texto escapado no vuelve a pantalla (los llamadores mantienen el `q` crudo aparte), y no sirve para un `eq`/`in`/`fts` |
| `BotonCrearConPermiso` | `src/components/shared/boton-crear-con-permiso.tsx` | Botón de acción que se **deshabilita** (en vez de rebotar contra `/sin-acceso`) cuando falta el permiso. Client Component: lee del `PermisosProvider`, así que sirve en páginas Server que **no** consultan `profiles`, sin agregarles una query. Es **solo UX** — la autorización real la hacen la página destino y el endpoint |

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
    - ✅ **UNIFICADO (Grupo 4, 2026-08-16): `src/lib/utils/format-date.ts` es la casa ÚNICA del
      formateo de fechas.** Antes convivían **seis** implementaciones (este canon + 5 duplicados en
      `lib/utils.ts`, las dos plantillas PDF y `/verificar`), cinco de ellas sin zona fija. Hoy el
      archivo expone tres funciones de **formateo** y **no hay ninguna otra** (más el **par**
      `parseFechaHoraAR` / `formatParaInputAR`, que convierten entre instante y hora de pared para
      los `<input>` de fecha — ver **nota técnica 25**):
      - **`formatFechaAR(fecha, patron)`** — el **motor**. Fija `TZ_AR` y **lanza** ante una entrada
        inválida.
      - **`formatFecha(fecha, patron = 'd MMM yyyy')`** y **`formatFechaLarga(fecha)`** — wrappers
        finos sobre el motor **con `try/catch` que degrada al string crudo**. El catch va acá y **no**
        en `formatFechaAR`: sus llamadores nunca tragaron errores, y uno de los wrappers sirve a la
        ruta **pública** `/verificar`, donde un dato degenerado no debe ser un 500.
      ⚠ **La afirmación anterior de esta nota era FALSA:** decía que los wrappers "solo reciben
      columnas `DATE`". `difusion-preview.tsx` les pasa un **`timestamptz`** (`post.updated_at`) — y
      con la unificación eso ya no importa, porque los wrappers fijan zona igual que el motor.
      ⚠ **No escribir un helper de fecha nuevo en otro archivo** ni llamar a `format()` de date-fns o
      `toLocaleDateString()` directamente desde el servidor.
      ⚠ **Y la regla se hizo cumplir:** existía `src/lib/utils/fecha-input.ts` (`reformatDateForInput`),
      un helper de fecha fuera de este archivo que convertía con `getTimezoneOffset()` — o sea, en la
      zona del **NAVEGADOR**, no en `TZ_AR`. Mientras existió, "casa única" era **falso**. Se
      **eliminó** al unificar la zona del turnero; su reemplazo es `formatParaInputAR`, acá adentro.
      Hoy `src/lib/utils/` tiene **tres** archivos: `cn.ts`, `format-date.ts` y `verificar-permiso.ts`.
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
    `useSearchParams().get('hilo')` **durante el render**, y **con ese id alcanza para abrir el
    modal**. **No hay estado ni setter para el modal**, y `(app)/mensajes/page.tsx` **no** pasa el
    param como prop.
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
    - ✅ **El modal abre por ID, no por objeto (tanda de mensajería, 2026-08-22).** `HiloModal`
      recibe **`hiloId` (requerido)** y **`mensajeRaiz` (opcional)**, y resuelve el hilo por su
      cuenta con `obtenerHilo`. La búsqueda en la lista cargada **sobrevive como ATAJO DE PINTADO**
      —siembra la primera burbuja y el encabezado para que el caso común no pierda el contenido
      inmediato—, pero **ya no es la condición de apertura**.
      ⚠ **La limitación que esta nota describía antes era doblemente falsa** y quedó cerrada: decía
      que el hilo se buscaba entre los threads cargados y que `obtenerBandeja()` tenía `.limit(100)`,
      así que un hilo más viejo **no abría**. El tope de 100 lo reemplazó la **paginación** (nota 30)
      y hoy abre **cualquier hilo del tenant**.
    - **Tres estados nuevos, y un texto ÚNICO para los fallos.** El modal modela **cargando**,
      **conversación no disponible** y **error de red**. ⚠ *"No existe"*, *"se borró"* y *"no tenés
      permiso"* se muestran **con el mismo texto**, deliberadamente: `obtenerHilo` ya responde el
      mismo `NO_ENCONTRADO` para los tres (id inválido incluido) para que nadie **enumere ids**
      probándolos desde la URL, y distinguirlos en el cliente tiraría abajo esa propiedad. Solo el
      **error de red** se distingue —no depende del id pedido— y es el único **reintentable**.
      El `?hilo=` con basura **no se valida en el cliente**: se manda tal cual y cae en "no
      disponible" (un segundo validador podría divergir del de la action); el param se limpia al
      **cerrar**, que es el camino que ya existía.
    - **El hilo traído por id NO se agrega a la lista.** La bandeja ordena por actividad reciente:
      insertarlo lo dejaría mezclado entre los nuevos, o al fondo y por lo tanto invisible igual.
      Se abre el modal y nada más. *(Si el usuario **responde** ahí, el hilo sube por el trigger de
      la nota 30 y entra a la lista por la puerta normal: ya no es un hilo viejo.)*
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
22. **El turno de la agenda se crea SOLO al finalizar la consulta, nunca desde un borrador.** Un
    borrador es **provisorio**: su `proximo_turno_sugerido` es una **intención**, no un turno. Hasta
    el Grupo 1 (2026-08-08), **guardar un borrador metía un turno real en la agenda** — ése era el bug
    de raíz. Los dos endpoints que lo crean son `POST /api/consultas` y `PATCH /api/consultas/[id]`.
    - **PATCH:** la condición es la **transición** a finalizada (`requiereFinalizar`, derivada del
      body). **No hace falta comparar contra el estado anterior:** la guarda de inmutabilidad rechaza
      con **403** toda consulta que ya estuviera finalizada, así que en ese punto `existing.estado`
      **solo puede ser `'borrador'`**. Se chequea igual, como defensa en profundidad, para que aflojar
      esa guarda no reabra el agujero.
    - **POST:** ⚠ **el bloque NO se elimina, se CONDICIONA a `estado === 'finalizada'`.** El
      formulario elige POST/PATCH según **si la consulta existe**, no según si se finaliza, así que
      por el POST pasa el flujo *"cargar y finalizar de una"* — borrar el bloque rompería la
      finalización normal del médico.
    - **La validación de solapamiento va bajo la MISMA condición.** Si el turno no se va a crear, un
      solapamiento no puede rechazar con **409** el guardado de un borrador.
    - **Si el turno falla, la consulta se finaliza igual.** Caso típico: un asistente sin
      `gestionar_turnos` (lo rechaza `turnos_insert`). La respuesta lleva **`turnoAgendado: false` +
      `turnoError`** y la UI avisa con un toast de advertencia **además** del de éxito. Los
      `undefined` los descarta `JSON.stringify`, así que **la respuesta de un guardado de borrador es
      idéntica a la de antes** (`{ data }`) y ningún consumidor se entera. Mismo criterio que el
      insert de la notificación en `api/turnero/route.ts`: el acto principal ya ocurrió, el
      secundario no puede tumbarlo.
    - **Un turno por consulta lo garantiza la BASE** (`turnos_consulta_id_unico`, migración 038). La
      guarda por `consulta_id` que hay en el código pasa por `turnos_select`, así que **depende de
      los permisos de lectura de la agenda** (desde la 039, `ver_turnos` OR `gestionar_turnos`): sin
      ninguno de los dos devuelve `null` aunque el turno exista. El índice no depende de permisos.
    - ⚠ **Lo que NO cambió:** el turno se sigue insertando con **`paciente_id` y SIN
      `paciente_nombre_libre`** (el dato canónico es el id; duplicar el nombre lo desactualizaría).
      `turno-form.tsx` asume esa forma al precargar el buscador.
23. **"Franja ocupada" se pregunta en UN solo lugar: `buscarSolapamientos` de
    `src/lib/agenda/solapamiento.ts`. No escribir una query de solapamiento nueva.** Antes el
    criterio vivía **duplicado en 12 queries repartidas por 6 endpoints**, con tres criterios
    distintos de `estado` y tres de `categoria` conviviendo en la misma app.
    - **Qué exporta:** `buscarSolapamientos({ supabase, medicoId, inicio, fin, excluirTurnoId?,
      excluirBloqueoId? })` → `{ hayTurnoSolapado, hayBloqueoSolapado }`, que mira **las dos** tablas
      (`turnos` y `bloqueos_agenda`) en paralelo; los tipos `BuscarSolapamientosArgs` / `Solapamientos`;
      y la constante **`DURACION_TURNO_CONTROL_MS`** (⚠ **no unificar** con `MIN_DURATION_MS` de
      `turno.schema.ts`: aquélla es la duración **mínima válida** de cualquier turno, ésta la
      duración **fija** del turno de control — hoy coinciden en 10 min por casualidad).
    - **Los estados que ocupan son una lista de INCLUSIÓN**, derivada de un
      `Record<TurnoEstado, boolean>` exhaustivo: ocupan `pendiente`, `confirmado`, `presente` y
      `pendiente_confirmar`; **no** ocupan `cancelado`, `ausente` y `reprogramado`. ⚠ El `Record` es
      a propósito: si se suma un valor al ENUM, **deja de compilar** hasta que alguien decida si
      ocupa. Antes se usaba `.not(... in ...)`, o sea que **todo estado nuevo ocupaba por default**.
    - **Nada se pisa con nada:** el chequeo turno-vs-turno **no filtra por `categoria`** — la agenda
      modela la disponibilidad física del médico, así que un `curso` o un turno `personal` ocupan
      igual que un `turno_medico`.
    - **Intervalos semiabiertos:** `fila.fecha_inicio < fin AND fila.fecha_fin > inicio`. Los bordes
      que se tocan **no** solapan (uno que termina 10:00 y otro que empieza 10:00 conviven).
    - **Falla, nunca miente:** cada query chequea su `error` y lo relanza. Antes **8 de las 12**
      lo descartaban, así que un fallo de red dejaba `data` en `undefined` y el endpoint concluía
      **"franja libre"** — un fail-open silencioso. Los llamadores responden 500, que es lo correcto.
    - ⚠ **Corre con el cliente de SESIÓN, así que pasa por RLS** — no es un detalle de
      implementación: es la razón por la que hizo falta la **migración 039**. Con `turnos_select`
      exigiendo solo `ver_turnos`, al asistente con `gestionar_turnos` y sin `ver_turnos` la query le
      devolvía `[]` y el helper daba la franja por **libre**. **Unificar el criterio en un helper NO
      cerró eso** —solo concentró el bug en un lugar en vez de seis—; se cerró en la base.
24. **Tenant y permiso se resuelven con `resolverAcceso` (`src/lib/auth/tenant.ts`). No escribir el
    chequeo a mano en un endpoint nuevo.** Es el canon de todo lo que necesita *"¿de qué médico es
    esta request, y puede hacer esto?"*. Para lo que solo necesita el tenant está `resolverTenant`
    (y `tenantDeProfile`, su variante pura para quien ya leyó el `profile`).
    - **Firma y resultado:** `resolverAcceso(supabase, userId, permiso)` →
      `{ ok: true, tenantMedicoId, role } | { ok: false, motivo: 'sin-perfil' | 'sin-permiso' | 'sin-tenant' }`.
      **UNA sola query**, que proyecta los **12** permisos (proyección FIJA: no se interpola el
      permiso en el `select`).
    - ⚠ **Devuelve un `motivo`, no `null`, y eso es el punto.** Con un `null` que colapsa las tres
      causas, un asistente sin `medico_id` recibía *"Sin permisos para ver estudios"* — un mensaje
      **falso**, porque el permiso lo tenía. El `motivo` deja que cada llamador responda la verdad.
    - **El permiso puede ser UNO o un ARRAY, y el array es OR** (alcanza tener cualquiera). Existe
      para la lectura de la agenda, donde la RLS pide `ver_turnos` OR `gestionar_turnos` desde las
      migraciones 037/039. **No cuesta una query extra**: los 12 permisos ya vienen proyectados.
    - **Criterio FAIL-CLOSED:** `!profile[permiso]`, **nunca `permiso === false`**. Ante un valor
      inesperado deniega en vez de permitir. El **médico no chequea permiso**: acceso total, igual
      que `check_permiso()` en la base.
    - ⚠ **El ORDEN de los chequeos es parte del contrato:** perfil → **permiso** → tenant. Un
      `'sin-tenant'` garantiza que el permiso **ya pasó**, y de eso depende
      **`lib/utils/verificar-permiso.ts`**, que hoy es un **wrapper fino sobre este canon**
      (mantiene su firma y su `redirect`, y trata `'sin-tenant'` como "pasa" porque solo pregunta
      por el permiso). Invertir ese orden lo rompe **en silencio**.
    - ⚠ **NO responde `NextResponse` ni hace `redirect()`** — devuelve un valor y reacciona el
      llamador. Es lo que permite que los mismos helpers sirvan a Route Handlers (403 JSON, 403 texto
      plano), Server Components (`redirect('/sin-acceso')`, `redirect('/dashboard')`) y Server
      Actions (objetos de error de formas distintas). **Unificar esas reacciones sería un cambio de
      producto, no un refactor.**
    - **El chequeo del endpoint debe pedir LO MISMO que la RLS de esa tabla.** Es defensa en
      profundidad: la base ya frena, pero sin el chequeo en la app el usuario recibe un error
      genérico en vez de un 403 con motivo.
25. **Para ANCLAR una hora de pared argentina a un instante va `parseFechaHoraAR`
    (`src/lib/utils/format-date.ts`), NUNCA `new Date('…T14:00')`.** Es la **inversa** de la nota 18:
    aquélla cubre la **salida** (instante → texto en zona AR), ésta la **entrada** (texto de pared en
    zona AR → instante). Las dos viven en el mismo archivo, que es la casa única de fechas.

    ### ⚠⚠ `parseFechaHoraAR` y `formatParaInputAR` son un PAR. No se toca una sola.

    Todo formulario con `<input type="date">`, `<input type="time">` o `<input type="datetime-local">`
    hace un **round-trip** entre dos representaciones distintas de lo mismo:

    ```
    instante (timestamptz)  ──formatParaInputAR──▶  "hora de pared"  ──parseFechaHoraAR──▶  instante
         lo que guarda la base        lo que ve y edita el usuario         lo que se persiste
    ```

    - **Las dos convierten entre HORA DE PARED e INSTANTE ABSOLUTO, en direcciones opuestas.** Una
      lee, la otra escribe.
    - **Las dos DEBEN usar la MISMA zona.** Hoy las dos fijan **`TZ_AR`**. Mientras eso se cumpla, el
      round-trip conserva el instante **sin importar en qué zona esté el dispositivo**.
    - ⚠ **Convertir UNA SOLA de las dos a otra zona CORROMPE DATOS, y en silencio.** Un usuario con el
      dispositivo fuera de Argentina que **abra un registro y lo guarde SIN EDITARLO** vería el valor
      **desplazado varias horas**, sin ningún error, sin toast y sin nada en los logs: el input
      muestra una hora de pared calculada en una zona y la escritura la interpreta en otra. Se ve
      recién cuando alguien nota que un turno se movió solo.
    - **No es hipotético: es exactamente lo que se acaba de arreglar en el turnero.** El par estaba
      **partido entre dos archivos con criterios de zona distintos** — la escritura era un
      `new Date(...).toISOString()` **duplicado a mano** en `turno-form.tsx` y `block-slot-modal.tsx`,
      y la lectura vivía en un `reformatDateForInput` que usaba `getTimezoneOffset()`
      (`lib/utils/fecha-input.ts`, hoy **eliminado**). Los dos usaban la zona del **navegador**, así
      que eran auto-consistentes por casualidad y el bug no se veía; pero convertir solo uno al
      migrarlos habría movido los turnos.
    - **Decisión de producto vigente: el turnero opera en HORA DEL CONSULTORIO, no del dispositivo.**
      Un turno a las 14:00 es a las 14:00 en el consultorio, **lo mire quien lo mire y desde donde
      sea**. Antes el médico de viaje veía sus turnos en la hora de su destino.

    - **Qué recibe y qué devuelve cada una:**
      - `parseFechaHoraAR('YYYY-MM-DDTHH:mm')` → `Date`. También acepta `'YYYY-MM-DD'` a secas, que
        resuelve a la **medianoche AR**. El llamador decide la serialización (`.toISOString()` para
        mandarlo al servidor).
      - `formatParaInputAR(instante)` → `'YYYY-MM-DDTHH:mm'`. Acepta string ISO **con offset** o
        `Date`. ⚠ Tiene una rama para valores **`'YYYY-MM-DD'` sin hora** que **NO convierte zona**:
        les pega `T00:00` y listo. Es a propósito — pasarlos por el formateo los leería como
        medianoche **UTC**, que en AR cae a las **21:00 del día anterior**, y el input abriría en el
        día equivocado. Hoy ningún llamador la alcanza (`calendar-view.tsx` ya resuelve la selección
        de la vista mes antes de pasarla), pero se conserva como red.
    - **Por qué existe (bug real, no precaución):** el usuario elige `2026-08-20` en un
      `<input type="date">` y `14:00` en un `<input type="time">`, y esos strings son hora de
      **pared** argentina, **sin offset**. Un ISO date-time sin offset lo interpreta el motor en la
      zona del **RUNTIME**, que en Vercel es **UTC**: `new Date('2026-08-20T14:00')` guardaría las
      14:00 como **14:00Z**, o sea **11:00 AR**. Es el mismo bug de la nota 18, en el sentido de
      entrada.
    - **Sin `-03:00` hardcodeado:** por dentro es `fromZonedTime` de **`date-fns-tz`** fijando
      `TZ_AR`, que resuelve el offset **real** de la zona para esa fecha. Si Argentina volviera a
      tener horario de verano, sigue siendo correcto sin tocar código. **No escribir el offset a
      mano** en un string.
    - ⚠ **Ante una entrada inválida devuelve `Invalid Date`, NO lanza** — como `new Date`, y a
      diferencia de `formatFechaAR` (que sí lanza). **El llamador debe chequear** con
      `isNaN(d.getTime())` antes de usarlo.
    - **Los DOS consumidores del par, hoy:**
      1. **La hora del próximo control de la HC** (`consultas/consulta-detail.tsx`) — el caso que
         originó el helper. La columna `consultas.proximo_turno_sugerido` era `DATE` y **descartaba
         la hora** (se agendaba todo a las 09:00); la migración **041** la pasó a `timestamptz` y el
         formulario dejó de perderla. Ver `PENDIENTES.md` → Bloque A → *Bugs menores detectados*.
      2. **El turnero** (`turnero/turno-form.tsx` y `turnero/block-slot-modal.tsx`), desde la tanda
         que unificó su zona horaria. Es el que usa **el par completo**, en los 12 sitios que llenan
         sus `<input type="datetime-local">` más los 2 que arman el payload.
      ⚠ **Los dos son Client Components**, y eso importa: la nota 18 acota su regla al servidor
      porque el navegador ya está en la zona del usuario, pero acá **la zona del usuario es
      justamente el problema**. Que el código corra en el cliente **NO** exime de fijar `TZ_AR`.
26. **Un valor centinela compartido entre una Server Action y un componente cliente vive en un
    archivo de TIPOS, no en la action.** Un módulo **`'use server'`** solo puede exportar **funciones
    async**: una `export const` ahí **rompe el build**. Así que cuando el productor (la action) y el
    consumidor (el componente) tienen que reconocer **el mismo valor**, la constante va a
    `src/types/<dominio>.ts` y viaja por el barrel `types/index.ts`.
    - **Precedentes vivos:** `ITEM_TYPE_SOLICITUD` (`types/notificacion.ts`) y **`MARCADO_SIN_FILAS`**
      (`types/mensaje.ts`), que marca el `{ error }` de `marcarMensajeLeido` cuando el UPDATE
      **no afectó ninguna fila**.
    - ⚠ **La alternativa —repetir el string literal en los dos archivos— es la trampa.** Si los dos
      textos divergen, el consumidor **deja de reconocer el centinela** y el caso silencioso se
      convierte en un aviso espurio al usuario: el fallo es **peor** que el problema que el centinela
      resolvía. Es la misma lección que dejó `DIFUSION_LIMITE_DIARIO` (dos constantes del `100` que
      podían separarse en silencio).
    - **Que un archivo de tipos tenga valores de runtime no es una excepción**: `types/roles.ts` ya
      exporta `PERMISOS_DEFAULT`, `PERMISO_LABELS` y `TITULOS_DISPONIBLES`. Lo que **no** va ahí es
      lógica; solo el valor y su JSDoc.
27. **Unicidad de identificadores: el alcance depende de QUIÉN es el sujeto del dato, no de que el
    campo se llame `dni`.** Hay dos columnas `dni` en el esquema y sus constraints son **opuestas a
    propósito**. Antes de "emparejarlas" por simetría —o de agregarle un UNIQUE a la matrícula—, leer
    esto: las tres decisiones están tomadas y las tres tienen un motivo que no se ve desde el nombre
    de la columna.
    - **`pacientes.dni` → `UNIQUE (creado_por, dni)`, POR TENANT** (migración 043; antes era
      `pacientes_dni_key UNIQUE (dni)`, global). `pacientes` es **multi-tenant**: el DNI describe a un
      **tercero registrado por un médico**, y la misma persona puede ser paciente de **dos
      consultorios sin relación entre sí**. La unicidad global era un **bug de modelo**: el primer
      médico que cargaba un DNI se lo reservaba para toda la instalación y al segundo le respondía
      *"Ya existe un paciente registrado con este DNI"* — un mensaje **falso**, porque para él ese
      paciente no existe (la RLS ni se lo muestra).
      ⚠ **`idx_pacientes_dni` NO se dropea:** el índice de la constraint es `(creado_por, dni)` y no
      sirve para buscar por `dni` solo, que no es su prefijo izquierdo.
    - **`profiles.dni` → `UNIQUE (dni)`, GLOBAL** (migración 044). `profiles` **no pertenece a ningún
      tenant**: es la tabla de **usuarios del sistema**, la extensión de `auth.users`, y ahí el DNI
      identifica al **dueño de la cuenta**. Una misma persona no debería tener dos cuentas
      profesionales, así que el alcance global es exactamente lo que se busca. La columna es
      **nullable** y convive con los perfiles que no lo tienen: en un índice único **los NULL no se
      comparan entre sí** (`NULLS DISTINCT`, el default). ⚠ Por eso mismo, **vacío se guarda `NULL` y
      nunca `''`**: las cadenas vacías **sí** colisionan entre sí, y el segundo usuario que dejara el
      campo en blanco recibiría un error de duplicado sin haber escrito nada.
    - **Dicho corto:** en `pacientes` el DNI describe a un **tercero** dentro del ámbito de un médico;
      en `profiles` identifica al **titular de la cuenta** en toda la instalación. Distinto sujeto,
      distinto alcance. **No es una inconsistencia y no hay que unificarlas.**
    - ⚠ **UN UNIQUE SOBRE EL NÚMERO DE MATRÍCULA SERÍA INCORRECTO — no es un one-liner pendiente.**
      Es la trampa que este punto viene a evitar. En Argentina **los números de matrícula se repiten
      entre jurisdicciones**: cada colegio provincial los otorga por su cuenta, así que la MP 1234 de
      una provincia y la MP 1234 de otra son **dos profesionales distintos**, ambos legítimos. Y un
      mismo profesional puede tener **varias** a la vez (nacional + una o más provinciales + la de
      especialidad) — por eso `profiles.matriculas` es un **array JSONB** `[{tipo, numero}]` y no una
      columna escalar. Un UNIQUE sobre el número solo **rechazaría altas válidas**. Si alguna vez se
      quisiera unicidad de matrícula, tendría que ser **compuesta —tipo + número + jurisdicción/entidad
      emisora—**, y hoy **la jurisdicción ni siquiera se guarda**: exigiría cambiar el modelo (lo
      canónico sería normalizar a una tabla `matriculas` con FK a `profiles`). O sea que no es una
      constraint que falte, es un rediseño que **nadie pidió**. Ver `PENDIENTES.md`, donde el ítem
      está cerrado como **DESCARTADO**.
    - **El DNI del profesional es OPCIONAL a nivel producto**, no "opcional por ahora": la ley
      argentina **no lo exige** ni en la historia clínica ni en los certificados — el identificador
      legal del ejercicio es la **matrícula**, que ya se estampa en los PDF vía `emisor_snapshot`
      (regla de negocio 11). Se volvería necesario solo si la app emitiera **receta electrónica
      formal** (hoy bloqueada por ANMAT, regla 7) o **facturara**. Por eso **no se pide en el
      registro** —sería fricción en el alta por un dato que no hace falta— sino en la **edición de
      perfil**, y lo cargan **médicos y asistentes por igual**: es un dato de la persona, no de la
      identidad de ejercicio (contrastar con `matriculas`, `titulo` y `firma_url`, que la UI reserva
      al médico).
    - ⚠ **Un paciente y un profesional PUEDEN compartir DNI, y eso se cumple solo.** `pacientes` y
      `profiles` son tablas separadas con constraints separadas: un asistente —o el propio médico—
      puede ser también paciente del consultorio. **No agregar un UNIQUE cruzado** ni un chequeo de
      *"este DNI ya existe como profesional"* al dar de alta un paciente: sería romper un caso de uso
      válido creyendo que se previene un duplicado.
    - **Manejo del choque en la app:** `actualizarPerfil` (`(app)/perfil/actions.ts`) intercepta el
      **23505** y responde *"Ese DNI ya está registrado en otra cuenta."*. Es obligatorio y no
      cosmético: sin ese intercepto el error cae al `catch`, y `mensajeDeError` devuelve el texto
      **crudo** de Postgres, que el formulario muestra tal cual en un toast. Mismo criterio que
      `POST /api/pacientes` y `PATCH /api/pacientes/[id]`. ⚠ El chequeo va **por forma** (acceso a
      `.code`), nunca con `instanceof` — ver la convención de `catch`.
    - **Escribir el centinela legible, no un código corto.** Nunca debería llegar a la UI, pero si un
      llamador futuro lo mostrara sin reconocerlo, un texto entendible degrada mejor que un
      `'E_NOROWS'`.
28. **"Particular / Sin obra social" es AUSENCIA de dato, no una fila de catálogo — y el fallback
    del literal se aplica en CADA CONSUMIDOR, nunca dentro de `resolverObraSocial`.** Un paciente
    particular es el que tiene `obra_social_id IS NULL` **y** `obra_social_otro` nulo o en blanco.
    La fila homónima que sembraba la 001 se **eliminó** (migración **045**): el catálogo enumera
    coberturas, y "no tener cobertura" no es una cobertura.
    - **El literal vive UNA vez**, en `SIN_OBRA_SOCIAL_LABEL` (`src/lib/pacientes/obra-social.ts`),
      y **nadie lo escribe a mano**. Es un valor de **presentación**, no de datos. Misma lección que
      dejó `DIFUSION_LIMITE_DIARIO` (dos constantes del `100` que podían separarse en silencio).
    - ⚠ **`resolverObraSocial` NO cambió y no hay que cambiarlo:** sigue devolviendo `string | null`.
      Los consumidores escriben `resolverObraSocial(p) ?? SIN_OBRA_SOCIAL_LABEL`. **Colapsar el
      fallback adentro del helper rompería el modal de difusión**
      (`components/difusion/enviar-modal.tsx`), que **detecta al paciente sin obra social por el
      `null`**: con él arma la bandera `haySinObra` y la opción "Sin obra social" de su filtro
      (centinela propio `SIN_OBRA = '__sin__'`). Si el helper dejara de devolver `null`, esa opción
      **desaparecería del filtro** y los particulares se colarían como una obra social más en la
      lista de `obrasUnicas`.
    - **La EXCEPCIÓN deliberada, entonces, son dos archivos:**
      `api/difusion/destinatarios/route.ts` y `components/difusion/enviar-modal.tsx`. Son los únicos
      consumidores que **no** aplican el fallback y tienen su propio texto (`'Sin obra social'`, en
      minúscula) y su propio centinela. **No "unificarlos" con el resto.**
    - **Dónde SÍ se aplica el fallback** (todos con `?? SIN_OBRA_SOCIAL_LABEL`): la ficha del
      paciente, la tabla de `/pacientes` en sus **dos** vistas (desktop y móvil — antes la móvil
      **ocultaba** el badge y el mismo paciente se veía distinto según el ancho de pantalla), el
      dashboard, las tarjetas de resumen de los formularios de pedido y certificado, la **escritura**
      del snapshot `obra_social_nombre` de esos documentos, y los PDF de consulta e historia clínica.
    - ⚠ **En documentos, el fallback va SOLO en la ESCRITURA del snapshot, nunca en la lectura.**
      Los pedidos y certificados **ya emitidos** conservan su `obra_social_nombre` en `NULL` y sus
      plantillas y previews siguen **omitiendo la fila** con la guarda
      `{doc.obra_social_nombre && …}`. Agregarle un fallback a la lectura **reescribiría la
      apariencia de documentos ya firmados**, que es justo lo que el congelado del PDF impide (regla
      de negocio 5). Consecuencia aceptada: conviven documentos viejos sin la línea de obra social y
      nuevos con ella.
    - **El filtro de `/pacientes`** usa el centinela `FILTRO_SIN_OBRA_SOCIAL` (`'sin-obra-social'`,
      texto — no colisiona con los ids `SERIAL` del catálogo) y la page lo traduce a
      `obra_social_id IS NULL` **Y** `obra_social_otro` nulo o en blanco. ⚠ **Las dos condiciones
      hacen falta:** hay pacientes con `obra_social_id` nulo que **sí** tienen obra social, cargada
      como texto libre. Y el "en blanco" se resuelve con el operador `match` de PostgREST contra
      `^\s*$`, porque `resolverObraSocial` trimea: un `'   '` es "sin obra social" para la app, y un
      `IS NULL` a secas lo dejaría afuera.
29. **Mensajería y RLS (migración 046): la base ya exige `acceso_mensajeria` + tenant, y la
    ASIMETRÍA entre LEER y BORRAR es DELIBERADA.** Las cuatro políticas de `mensajes_internos`
    piden hoy `check_permiso(auth.uid(), 'acceso_mensajeria')`, y el tenant se aplica al mensaje
    entero y no solo a la rama grupal (ver **Auth y roles** para el hueco que cerró).
    - ⚠⚠ **EL MÉDICO TITULAR PUEDE BORRAR UN MENSAJE INDIVIDUAL ENTRE DOS DE SUS ASISTENTES, PERO
      NO PUEDE LEERLO. NO ES UN DESCUIDO Y NO HAY QUE "CORREGIRLO".** `mensajes_borrar` incluye
      `medico_id = auth.uid()`; `mensajes_ver` solo deja ver los individuales a **remitente y
      destinatario**.
      **Hasta la 046 sí era accidental:** la `017` enumeró los tres casos del SELECT sin contemplar
      al titular, y la `020` —tres migraciones después, escrita para otra cosa— sí lo enunció como
      **regla de negocio** ("el médico vinculado puede borrar cualquier mensaje de su tenant"). El
      DELETE tuvo su momento de diseño y el SELECT no.
      **A partir de la 046 es DELIBERADA:** se revisó y se eligió la variante conservadora. El
      titular no gana visibilidad sobre las conversaciones privadas entre sus asistentes; puede
      borrarlas —es el dueño del tenant y el responsable de sus datos— pero no leerlas. Cambiarlo
      es una **decisión de producto sobre privacidad**, no una corrección técnica: hay que tomarla
      explícitamente.
    - ⚠ **Consecuencia asumida de esa asimetría — un `DELETE … RETURNING` exige TAMBIÉN la política
      de SELECT.** En Postgres, un `UPDATE`/`DELETE` con `RETURNING` aplica además las políticas de
      lectura sobre las filas devueltas. `eliminarMensaje` cierra con
      `.delete()…​.select('id')` (su **guarda de "0 filas"**, la lección de la 033), así que en el
      único caso en que el titular borra sin poder leer —un individual entre dos asistentes— la
      fila **se borra pero no vuelve**, y la guarda reportaría `'Mensaje no encontrado'` sobre un
      borrado que **sí ocurrió**.
      **Es PREEXISTENTE y hoy inalcanzable:** la UI solo ofrece borrar desde la bandeja o el modal,
      o sea sobre hilos que el usuario **está viendo**; y con **un asistente por consultorio** ni
      siquiera existen mensajes individuales entre asistentes. Se documenta porque la 046 convirtió
      la asimetría en deliberada: el día que haya dos asistentes, este es el borde que aparece.
      ⚠ **No se arregla ablandando `mensajes_ver`** —eso sería justamente el cambio de producto de
      arriba—; si molesta, se arregla del lado de la action.
    - **`mensajes_lecturas` quedó AFUERA de la 046, a propósito.** No tiene columna de tenant (sus
      columnas son `mensaje_id`, `user_id`, `leido_at`) y sus dos políticas ya acotan a
      `user_id = auth.uid()`: un usuario solo ve **sus propias lecturas**, así que **no hay fuga**.
      Aplicarle el criterio exigiría un `EXISTS` contra `mensajes_internos` (patrón `estudios`), y
      se decide aparte. ⚠ Sigue **sin política de UPDATE** (ver nota 19).
    - **`get_medico_id()` ya fija `SET search_path = public`** (mismo endurecimiento que la `025` le
      hizo a `verificar_documento()` y `log_turno_cambio()`). Era la única `SECURITY DEFINER` del
      esquema sin fijarlo, y la **más usada**: cuelgan de ella casi todas las políticas multi-tenant.
      Riesgo de comportamiento nulo — el cuerpo no cambió y ya calificaba `public.profiles`.
30. **La bandeja ordena y pagina por `ultima_actividad_at` (migración 047) — y el trigger que la
    mantiene tiene una dependencia oculta.** La columna es **denormalizada** y solo significativa en
    los mensajes **RAÍZ**: en una respuesta vale su propio `created_at` y **no se lee nunca**.
    - **Por qué una columna y no un `ORDER BY` agregado:** ordenar por
      `GREATEST(raiz.created_at, MAX(hijos.created_at))` es una agregación correlacionada, y
      PostgREST no ordena por un agregado de un recurso embebido. La columna convierte el orden en
      un `ORDER BY` simple e **indexable**. Mismo patrón que la `040` con
      `turnos_audit_log.medico_id`: columna + backfill + `NOT NULL` + índice + trigger.
      ⚠ **No se llama `updated_at` a propósito:** en las otras 13 tablas eso significa "cuándo se
      modificó ESTA fila" y lo mantiene `set_updated_at()`. Acá significa "cuándo pasó algo en el
      HILO" — la raíz no se modificó, se le agregó un hijo. El nombre convencional invitaría a
      colgarle el trigger genérico, que haría lo incorrecto.
    - ⚠⚠ **EL TRIGGER ES `SECURITY DEFINER` Y ESO DEPENDE DE QUE LA TABLA NO TENGA `FORCE ROW LEVEL
      SECURITY`.** `bump_actividad_hilo()` hace un `UPDATE` sobre la RAÍZ, y la única política de
      UPDATE de la tabla (`mensajes_marcar_leido`) lo **bloquearía en dos de los tres casos**: raíz
      grupal (`NOT es_grupal` da FALSE) y raíz individual respondida por su **remitente original**
      (el `destinatario_id` de la raíz es el otro). Solo pasaría el tercero. `SECURITY DEFINER` hace
      que corra como el owner, que **bypassa RLS** — pero **solo si la tabla no la tiene forzada**.
      Verificado: **ninguna** tabla del esquema declara `FORCE ROW LEVEL SECURITY`.
      **Si alguna vez se activara sobre `mensajes_internos` —cosa que un endurecimiento futuro podría
      querer—, el trigger DEJARÍA DE ACTUALIZAR LA RAÍZ EN SILENCIO y el orden de la bandeja se
      congelaría sin que nadie lo note.** Un `UPDATE` cuyas filas no pasan el `USING` **no da error**:
      afecta 0 filas (la lección de la `033`, aplicada a un trigger). **No hay forma de que la base
      avise.** Si se activa, hay que revisar este trigger.
    - ⚠ **`AFTER INSERT` y SOLO INSERT.** No hay recursión —un `UPDATE` no dispara un trigger de
      `INSERT`—, y por eso **agregarle `OR UPDATE` la introduciría**. Tampoco hay **rama de DELETE**,
      y es una **decisión de producto**: borrar la última respuesta **no** recalcula, así que el hilo
      conserva su lugar. El costo de no recalcular es que un hilo quede "más arriba de lo que le
      toca"; el de recalcular sería que **la lista se reordene bajo el cursor del usuario**. Se
      eligió el primero. Si la fila no coincide, el trigger **no hace nada y el INSERT sigue**: no
      debe abortar el envío de un mensaje válido por una anomalía de parentesco.
    - **Dos índices PARCIALES nuevos.** `mensajes_bandeja_idx (medico_id, ultima_actividad_at DESC)
      WHERE parent_id IS NULL` sirve al WHERE y al ORDER BY de una sola pasada (tenant primero, orden
      después — patrón de `mensajes_medico_grupal_idx` e `idx_turnos_medico`), y la paginación por
      keyset lo recorre directo. `mensajes_parent_idx (parent_id, created_at) WHERE parent_id IS NOT
      NULL` cierra una **carencia preexistente**: `parent_id` es la columna por la que filtran **tres**
      consultas calientes —el paso 3 de `obtenerBandeja`, `obtenerHilo` y el borrado de respuestas de
      `eliminarMensaje`— y ninguno de los 3 índices previos la cubría.
    - **El patrón de paginación de la bandeja — reusarlo, no reinventarlo.** Es el **primero real de
      la app en una pantalla** (el molde previo, `GET /api/consultas`, usa **offset** y **no tiene
      consumidores**). Sus cinco piezas:
      1. **Keyset, no offset.** El cursor es el `ultima_actividad_at` del último hilo cargado y la
         query pide `.lt(cursor)`. ⚠ Con una lista **acumulativa** en el cliente, el offset
         **duplicaría** filas: cualquier mensaje nuevo corre la ventana y la página 2 devolvería lo
         que la 1 ya trajo. El cursor es **simple** (solo la fecha) porque la auditoría previa no
         encontró **ni un empate**.
      2. **`limite + 1` en vez de `count: 'exact'`.** La fila extra no se devuelve: solo dice si
         quedan más. Un count obliga a Postgres a contar todo lo que matchea en **cada** página, y
         "cargar más" no muestra "página 3 de 17".
      3. **Tamaño de página en una constante compartida**, `BANDEJA_PAGINA` (módulo neutro
         `constants/mensajes.ts`), más un **techo duro** `BANDEJA_PAGINA_MAX`: la action es invocable
         por cualquier cliente autenticado, y sin `Math.min` un `limite: 100000` traería la tabla
         entera. Mismo criterio que `DIFUSION_LIMITE_DIARIO`.
      4. **Los parámetros se validan DESPUÉS de auth/permiso/tenant** (orden del canon de la nota
         24), y un **cursor inválido degrada a la primera página** en vez de devolver error — mismo
         criterio que `formatFecha`: un parámetro corrupto no debe vaciar la pantalla.
      5. ⚠ **El cliente MERGEA por id, NUNCA reemplaza.** El efecto que sincroniza la prop del
         servidor con la lista acumulada indexa por id y **conserva lo que el servidor no menciona**.
         Reemplazar era un bug real: la prop es un array nuevo en **cada revalidación** —incluida la
         que dispara `marcarMensajeLeido` al **abrir cualquier hilo**—, así que leer un mensaje
         descartaba todas las páginas cargadas de más. ⚠ Lo que el merge **no puede** inferir es un
         **borrado** ("no vino del servidor" es indistinguible de "está en otra página"): por eso el
         borrado saca la fila del estado **explícitamente**, en su propio handler.
