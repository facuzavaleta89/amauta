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
| `estudios` | Archivos adjuntos (bucket privado) | vía `pacientes` |
| `evoluciones` | Series de laboratorio/antropometría (legacy, gráficos) | vía `pacientes` |
| `turnos` | Agenda. `categoria`, `origen`, `consulta_id` (Bloque 4) | `medico_id` |
| `bloqueos_agenda` | Bloqueos de horario | `medico_id` |
| `turnos_audit_log` | Log de cambios de turnos (trigger) | vía `turnos` |
| `pedidos` | Pedidos de estudios + PDF + QR (`codigo_verificacion`, `estado`) | vía `pacientes` |
| `certificados` | Certificados + PDF + QR + `valido_hasta` | vía `pacientes` |
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

**Pendiente:** ver `PENDIENTES.md` (pulidos finales en tres bloques: Funcional,
Seguridad, Estético) y la sección "Recetas" (bloqueada por certificación ANMAT).

---

## Documentación del proyecto

- **`README.md`** — puesta en marcha para desarrolladores (requisitos, instalación, scripts).
- **`DESIGN.md`** — sistema de diseño (paleta OKLCH, tipografía, componentes, categorías del turnero).
- **`schema.sql`** — snapshot consolidado del esquema (tablas, funciones, triggers, RLS). No reemplaza las migraciones de `supabase/migrations/`.
- **`PENDIENTES.md`** — tareas de pulido (Funcional / Seguridad / Estético) con ubicaciones en el código.
- **`src/types/`** — tipos por dominio + `index.ts` (barrel). Deriva del esquema; **no** hay tipos autogenerados por Supabase.

---

## Notas y deuda técnica

1. **Hooks:** 4 de 5 en `src/hooks/*` siguen stubs (11 bytes: `use-auth`, `use-pacientes`,
   `use-role`, `use-turnos`) — la lógica vive en Server Components/Actions. Excepción:
   `use-view-mode.ts` sí tiene lógica real (preferencia mosaico/lista en localStorage).
2. **Permisos legacy:** `puede_ver_historias` / `puede_editar_agenda` (Bloque 2) fueron
   reemplazados por los 12 granulares; siguen en la tabla por compatibilidad.
3. **`profiles.matricula`** (TEXT) deprecada → usar `matriculas` (JSONB).
4. **`proxy.ts` es el middleware** en esta versión de Next (función `proxy()` + `config.matcher`).
   **No crear `middleware.ts`.** Para rutas públicas, editar `publicRoutes` en `proxy.ts`.
5. **Admin client para permisos:** el médico actualiza permisos del asistente vía
   `admin.ts` (bypass RLS), porque `profiles_update_own` solo permite el perfil propio.
6. **Esquema sin migración fuente:** la tabla `consultas` (su columna `campos_extra` **sí**
   tiene fuente: migración 022), la tabla `notificaciones`, las columnas de Bloque 4 en
   `turnos` (`categoria/origen/consulta_id`) y `profiles.titulo/matriculas/logo_url` se
   aplicaron directo en Supabase. `schema.sql` **los reconstruye a todos** (incluida
   `notificaciones`, ya verificada contra la base), pero les falta la migración fuente
   versionada; ver `PENDIENTES.md` → Bloque A.
7. **Migración vacía:** `20260326204733_fix_rls_recursion.sql` tiene 0 bytes.
8. **Migración 025 (seguridad):** `verificar_documento` ya **no expone** DNI completo ni
   contenido clínico (devuelve DNI enmascarado, fija `search_path`, y solo `service_role`
   puede ejecutarla); se dropearon dos RLS huérfanas en `consultas` que salteaban los
   permisos, el `DELETE` de `pedidos`/`certificados` (solo se anulan) y `log_turno_cambio`
   fija `search_path`.
