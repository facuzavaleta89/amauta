# CLAUDE.md

## Descripción del proyecto

App web de gestión médica para un diabetólogo. Desarrollada con Next.js 16 + Supabase.
Permite gestionar pacientes, historia clínica, turnos, pedidos médicos, certificados y
difusión. Soporta dos roles: médico titular y asistentes, con sistema de permisos granular.
Orientada a un consultorio unipersonal donde el médico puede tener uno o más asistentes
vinculados.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16.2.1 (App Router) |
| Lenguaje | TypeScript 5 |
| Runtime | Node.js (versión LTS recomendada) |
| UI Components | shadcn/ui (Radix UI) + Tailwind CSS v4 |
| Base de datos | Supabase (PostgreSQL) |
| Auth | Supabase Auth (`@supabase/ssr` v0.9) |
| Formularios | React Hook Form + Zod v4 |
| Calendarios | FullCalendar v6 |
| PDF | @react-pdf/renderer v4 + jsPDF v4 |
| Email | Resend v6 |
| Tablas | TanStack Table v8 |
| Animaciones | tw-animate-css |
| Toasts | Sonner v2 |
| Build | Babel React Compiler habilitado |

---

## Base de datos

- **Proveedor:** Supabase (PostgreSQL)
- **RLS habilitado en todas las tablas de datos de usuario**
- **Tenant key:** `pacientes.creado_por = get_medico_id()` — el médico es el dueño del tenant; los asistentes acceden vía la función helper que resuelve su `medico_id`

### Tablas existentes

| Tabla | Descripción | Tenant key |
|---|---|---|
| `profiles` | Extiende `auth.users`. Campos: `id`, `full_name`, `role` ('medico'/'asistente'), `avatar_url`, `medico_id` (UUID del médico para asistentes), `matricula` (deprecated), `matriculas` (JSONB), `titulo`, `firma_url`, `logo_url` y 12 permisos booleanos: `ver_pacientes`, `editar_pacientes`, `ver_historia_clinica`, `crear_consultas`, `finalizar_consultas`, `ver_turnos`, `gestionar_turnos`, `ver_pedidos`, `crear_pedidos`, `ver_certificados`, `crear_certificados`, `acceso_mensajeria` | — |
| `obras_sociales` | Catálogo de obras sociales (OSDE, PAMI, etc.). Lectura pública para autenticados | — |
| `pacientes` | Pacientes con DNI único, datos de contacto y obra social. `creado_por` = UUID del médico | `creado_por` |
| `historia_clinica` | Una por paciente (1:1). Antecedentes, examen físico, laboratorio, conducta. RLS via `pacientes.creado_por` | via `pacientes` |
| `consultas` | Consultas cronológicas del nuevo modelo de HC (Bloque 1). Campos: motivo, anamnesis, examen físico, parámetros metabólicos, diagnóstico, plan, estado ('borrador'/'finalizada'). `medico_id` = tenant key | `medico_id` |
| `estudios` | Archivos de estudios complementarios adjuntos a pacientes | via `pacientes` |
| `evoluciones` | Evoluciones de historia clínica (modelo legacy) | via `pacientes` |
| `turnos` | Agenda de turnos. Estados: pendiente/confirmado/presente/ausente/cancelado/reprogramado. `medico_id` = tenant key | `medico_id` |
| `bloqueos_agenda` | Bloqueos de horarios en la agenda (vacaciones, almuerzo, etc.) | `medico_id` |
| `turnos_audit_log` | Log automático de cambios en turnos (trigger) | via `turnos` |
| `pedidos` | Pedidos de estudios complementarios con generación de PDF. `firmado_por` = UUID del médico | via `pacientes` |
| `certificados` | Certificados médicos (aptitud, reposo, diagnóstico, etc.) con PDF. Tipo enum definido | via `pacientes` |
| `difusion_posts` | Posts de difusión con estados borrador/publicado. `medico_id` = tenant key | `medico_id` |
| `recetas` | Módulo de recetas (esquema existente, UI pendiente de implementación completa) | — |
| `solicitudes_asistente` | Workflow de vinculación asistente ↔ médico. Estados: pendiente/aprobada/rechazada | — |
| `notas` | Notas personales de cada médico o asistente. RLS personal por `user_id` | — |
| `mensajes_internos` | Mensajería interna (asíncrona) individual o grupal. RLS por `medico_id` (tenant) | `medico_id` |
| `mensajes_lecturas` | Registro de lecturas de mensajes grupales por usuario. RLS por `user_id` | — |


### Funciones SQL relevantes

- `get_medico_id()` — Resuelve el tenant key según el rol del usuario actual (SECURITY DEFINER)
- `get_user_role(user_id)` — Retorna el rol de un usuario evitando recursión RLS
- `get_user_medico_id(user_id)` — Retorna el `medico_id` de un usuario
- `check_asistente_ver_hc(user_id)` — Verifica el permiso `puede_ver_historias` (SECURITY DEFINER)
- `check_asistente_editar_agenda(user_id)` — Verifica el permiso `puede_editar_agenda` (SECURITY DEFINER)
- `set_updated_at()` — Trigger genérico para `updated_at`
- `handle_new_user()` — Trigger en `auth.users` para crear el perfil automáticamente
- `log_turno_cambio()` — Trigger que registra cambios en turnos en el audit log

---

## Estructura de carpetas

```
/src
  /app
    /(auth)         → Login, registro, forgot password (Server Actions en actions.ts)
    /(app)          → Layout principal con sidebar + header (requiere autenticación)
      /dashboard    → Panel principal
      /pacientes    → CRUD de pacientes
      /turnero      → Agenda con FullCalendar
      /pedidos      → Pedidos médicos con PDF
      /certificados → Certificados médicos con PDF
      /difusion     → Posts de difusión / comunicación
      /recetas      → Módulo de recetas (parcial)
      /perfil       → Perfil del médico/asistente
      /mensajes       → Bandeja de mensajes internos con vista de hilos
      /notificaciones
      layout.tsx    → Guard de autenticación + carga de profile + LayoutShell
    /api            → API Routes (cron, webhook WhatsApp, etc.)
    /onboarding     → Flujo de vinculación para asistentes nuevos
    layout.tsx      → Layout raíz (HTML, metadata global)
    page.tsx        → Página raíz (redirect a /dashboard o /login)
  /components
    /layout         → layout-shell, sidebar, header, breadcrumb, notificaciones-medico
    /perfil         → perfil-form, signature-pad
    /pacientes      → Componentes de la sección pacientes
    /turnero        → Componentes del turnero
    /pedidos        → Formularios y vistas de pedidos
    /certificados   → Formularios y vistas de certificados
    /shared         → Componentes reutilizables entre secciones (qr-verificacion, etc.)
    /difusion       → Componentes de difusión
    /recetas        → Componentes de recetas
    /dashboard      → Widgets del dashboard
    /shared         → Componentes reutilizables (PageHeader, etc.)
    /ui             → shadcn/ui components (button, card, input, tabs, etc.)
    /mensajes          → Componentes de mensajería: bandeja inbox y modal de hilo
    /notificaciones
  /constants
    nav-items.ts    → Items de navegación por rol
    obra-sociales.ts
  /hooks
    use-auth.ts, use-pacientes.ts, use-role.ts, use-turnos.ts (stubs — contenido mínimo)
  /lib
    /supabase
      client.ts     → createBrowserClient (para Client Components)
      server.ts     → createServerClient async (para Server Components/Actions)
      admin.ts      → createAdminClient con SERVICE_ROLE_KEY (bypass RLS)
    /email          → Templates de email (Resend)
    /pdf            → Generadores de PDF
    /utils          → cn(), formatters, etc.
    /validations    → Schemas Zod
    /whatsapp       → Integración WhatsApp
    rate-limit.ts   → Rate limiting para endpoints
    utils.ts        → Utilidades generales
  /types
    consulta.ts     → Tipos del módulo de consultas
    difusion.ts     → Tipos de difusión
    paciente.ts     → Tipos de paciente
    pedido.ts       → Tipos de pedidos
    roles.ts        → Profile, Matricula, SolicitudAsistente, helpers esMedico(), etc.
    supabase.ts     → Tipos generados de Supabase DB
    turno.ts        → Tipos de turno
  proxy.ts          → Configuración de proxy (WA / email)
```

---

## Sistema de autenticación y roles

### Flujo de autenticación

1. `@supabase/ssr` maneja las cookies de sesión vía `src/proxy.ts` (equivalente al middleware de Next.js — **no usar `middleware.ts`**, está deprecado en esta versión)
2. `proxy.ts` define `publicRoutes` (array de prefijos públicos): `/login`, `/registro`, `/callback`, `/verificar`. Toda ruta no listada requiere autenticación.
3. En `src/app/(app)/layout.tsx` (Server Component): se llama `supabase.auth.getUser()`, si no hay usuario → redirect `/login`
3. Se carga el `profile` desde `profiles` con `role`, `medico_id`, `titulo`
4. Si es asistente sin `medico_id` → redirect `/onboarding` (vinculación obligatoria)
5. Se pasa todo al `LayoutShell` (Client Component) que maneja el sidebar y header

### Determinación del rol

- `profiles.role`: `'medico'` | `'asistente'`
- **Médico:** `role = 'medico'`, `medico_id = NULL` (es dueño del tenant, su propio `id` es el tenant key)
- **Asistente:** `role = 'asistente'`, `medico_id = UUID del médico` al que está vinculado

### Acceso al usuario actual en el código

- **Server Components / Server Actions:** `await createClient()` → `supabase.auth.getUser()`
- **Client Components:** se recibe el `profile` como prop desde el Server Component padre
- **RLS automático:** `auth.uid()` está disponible en todas las políticas RLS de Supabase

### Permisos para asistentes (implementado en Bloque 3)

Los permisos se almacenan como **12 columnas booleanas en `profiles`** (todas por defecto en `FALSE`):
- Pacientes: `ver_pacientes`, `editar_pacientes`
- Historia clínica: `ver_historia_clinica`, `crear_consultas`, `finalizar_consultas`
- Agenda y turnos: `ver_turnos`, `gestionar_turnos`
- Pedidos médicos: `ver_pedidos`, `crear_pedidos`
- Certificados: `ver_certificados`, `crear_certificados`
- Mensajería: `acceso_mensajeria`

> ⚠️ **Importante:** la columna se llama `editar_pacientes` (NO `gestionar_pacientes`). Siempre consultar la migración `015_permisos_granulares.sql` para los nombres exactos.

El RLS en Supabase y las API Routes validan estos permisos directamente consultando la fila de perfil del usuario asistente. **Los médicos siempre tienen acceso total** — el RLS usa `check_permiso()` que retorna `TRUE` para `role='medico'`.

---

## Estado de desarrollo

### Completado

#### Bloque 1 — Historia clínica (modelo de consultas)
- Tabla `consultas` con campos completos (motivo, anamnesis, examen físico, parámetros metabólicos específicos para diabetología, diagnóstico, plan, medicación, observaciones, próximo turno sugerido)
- Estados: `borrador` (editable) y `finalizada` (inmutable)
- RLS en `consultas`: asistentes solo acceden si `puede_ver_historias = true`
- UI: línea de tiempo cronológica, formulario de nueva consulta, botón "Finalizar consulta"
- PDF individual y completo de historia clínica

#### Bloque 2 — Perfil del médico
- Tipos de matrícula: MP (provincial), MN (nacional), ME (especialidad) — columna `matriculas` JSONB
- Campo `titulo` / tratamiento: Dr., Dra., Lic., Sr., Sra., personalizado
- Carga de `logo_url` (sello/logo institucional, base64)
- Firma digitalizada: `firma_url` (pad de firma o imagen cargada, base64)
- Panel de asistentes en `/perfil` con toggles de permisos (solo 2 permisos por ahora)

#### Bloque 3 — Permisos granulares para asistentes ✅
- 12 columnas booleanas en `profiles` (migración 015)
- Función `check_permiso(user_id, permiso)` en SQL (SECURITY DEFINER)
- RLS actualizado en todas las tablas
- UI de toggles en `/perfil` para cada permiso
- **Los médicos siempre tienen acceso total** (los permisos solo aplican a asistentes)

#### Bloque 4 — Ajustes del turnero ✅
- Vista de 24/7, intervalos de 10 min
- Categorías de turno: turno_medico, curso, personal, administrativo, recordatorio
- Integración con HC (turno automático desde próximo control sugerido)
- Validación de solapamiento diferenciada por categoría

#### Secciones base existentes
- Dashboard, turnero (FullCalendar), CRUD de pacientes, pedidos médicos, certificados, difusión
- Sistema de solicitudes de vinculación asistente ↔ médico (onboarding)
- Notificaciones en tiempo real para solicitudes pendientes

#### Bloque 5 — Mejoras en documentos ✅
- Ruta pública `/verificar/[codigo]` accesible sin login (agregada a `publicRoutes` en `proxy.ts`)
- QR de verificación renderizado en las vistas de detalle `/pedidos/[id]` y `/certificados/[id]`, antes del preview del documento
- Badges de estado en listas: **Anulado** (rojo, `estado='revocado'`) en `/pedidos` y `/certificados`; **Expirado** (ámbar, `valido_hasta < hoy`) en `/certificados`
- Componente `QRVerificacion` (`src/components/shared/qr-verificacion.tsx`): Server Component, genera QR con `qrcode` (Data URL), deriva URL base con `headers()` de Next.js

#### Bloque 6 — Obras sociales, notas y mensajería ✅
- Selector de obra social flexible con opciones especiales "Particular / Sin obra social" y "Otra (no está en la lista)". La opción "Particular" es hardcodeada en el formulario; no existe como registro en `obras_sociales`.
- Campo de texto libre para obra social condicional al estado del selector, con validación en esquema Zod.
- Notas internas de uso personal para cualquier rol, aisladas por RLS. CRUD completo con Server Actions y buscador client-side.
- Sistema de mensajería interna asíncrona bidireccional entre médico y asistentes, con mensajes individuales y grupales (broadcast).
- Bandeja de mensajes (`/mensajes`) separada de notificaciones (`/notificaciones`): cada sección tiene su propia ruta y ítem en el sidebar.
- Vista de hilos de mensajes: modal estilo chat con burbujas (propias a la derecha, recibidas a la izquierda) y caja de respuesta con Ctrl+Enter.
- Indicador de mensajes no leídos en el sidebar (badge dinámico vía `MensajesContext`) y en el header (iconito siempre visible para asistentes con acceso).
- /notificaciones solo accesible para el médico (solicitudes de vinculación + sistema). Asistentes solo ven /mensajes.
- **Seguridad y permisos de mensajería:**
  - El ícono de mensajes en el Header está condicionado por el permiso `acceso_mensajeria` para asistentes.
  - Validación en cliente y servidor en `enviarMensaje` para deshabilitar e impedir envíos a asistentes sin acceso a mensajería.
  - Migraciones RLS: `019` para ver el médico vinculado, `020` para políticas de `DELETE` en mensajes, y `021` para permitir a asistentes ver otros perfiles del mismo médico (evitando nombres "Desconocido" en chats grupales).
- **UX de la bandeja de mensajes e hilos:**
  - Marcación como leído optimista en la lista (0ms de retraso).
  - Eliminación de mensajes individuales (remitente/médico) y conversaciones completas (médicos) mediante diálogos de confirmación personalizados nativos de la app.
  - Eliminación de refrescos redundantes de Next.js (`router.refresh()`), mitigando el error de runtime "An unexpected response was received from the server" en desarrollo.
- **Navegación y Breadcrumbs:**
  - Registro de etiquetas para `/mensajes` y `/notificaciones` en `Breadcrumb`, con capitalización automática fallback para cualquier otra ruta dinámica.

### Pendiente

- Recetas (requiere firma digital y certificación ANMAT — bloqueado)


---

## Convenciones de código

### Naming

- **Archivos de componentes:** kebab-case (`perfil-form.tsx`, `layout-shell.tsx`)
- **Componentes React:** PascalCase (`PerfilForm`, `LayoutShell`)
- **Server Actions:** camelCase en archivos `actions.ts` dentro de la carpeta de la ruta
- **Tipos/interfaces:** PascalCase (`Profile`, `Consulta`, `Asistente`)
- **Funciones helper:** camelCase (`esMedico()`, `getMedicoId()`)

### Patrón de datos

- **Server Components** hacen el fetch de datos y los pasan como props a Client Components
- **Server Actions** (`'use server'`) para todas las mutaciones — retornan `{ error: string | null }`
- **Cliente Supabase:**
  - `createClient()` de `@/lib/supabase/server` → Server Components y Server Actions (usa cookies)
  - `createClient()` de `@/lib/supabase/client` → Client Components (browser)
  - `createAdminClient()` de `@/lib/supabase/admin` → bypass RLS, solo en server, solo cuando es necesario
- **No hay stores globales de cliente** (Zustand, Redux, etc.) — el estado se maneja con `useState` local

### TypeScript

- Strict mode habilitado (`tsconfig.json`)
- Tipos explícitos en todas las funciones públicas
- `any` usado de forma puntual con comentarios donde el tipo es dinámico

### Imports

- Alias `@/` apunta a `src/`
- Imports agrupados: externas → componentes → lib → types

### Formularios

- React Hook Form + Zod para validación client-side
- Validación también en Server Actions (nunca confiar solo en el cliente)

---

## Variables de entorno requeridas

```env
NEXT_PUBLIC_SUPABASE_URL=       # URL pública del proyecto Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # Clave anon/public (segura para exponer)
SUPABASE_SERVICE_ROLE_KEY=      # Clave service role (⚠️ SECRETA — bypass RLS)
CRON_SECRET=                    # Secret para proteger /api/cron/recordatorios
# Opcionales:
# RESEND_API_KEY=
# WHATSAPP_API_TOKEN=
# WHATSAPP_PHONE_NUMBER_ID=
```

---

## Comandos útiles

```bash
npm run dev      # Servidor de desarrollo (Next.js)
npm run build    # Build de producción
npm run start    # Servidor de producción
npm run lint     # ESLint
```

---

## Reglas de negocio importantes

1. **Historia clínica inmutable:** Una consulta en estado `finalizada` no puede editarse desde la UI. Solo el médico puede finalizar una consulta (el asistente puede crearla en borrador).
2. **Médico = acceso total:** El médico titular tiene acceso irrestricto a todos sus datos. Los asistentes solo acceden a lo que el médico habilitó explícitamente.
3. **Tipos de matrícula:** MP (provincial), MN (nacional), ME (especialidad). Un médico puede tener más de una. Se almacenan en `profiles.matriculas` (JSONB array de `{tipo, numero}`).
4. **Documentos con encabezado médico:** Pedidos y certificados llevan logo institucional, matrícula(s) y título del médico en el encabezado del PDF.
5. **Tenant aislado:** Toda la data de pacientes, turnos y documentos está aislada por médico. No hay data compartida entre médicos distintos.
6. **Asistente sin vínculo:** Un asistente sin `medico_id` es redirigido al onboarding y no puede usar la app hasta vincularse.
7. **Firma digital:** Solo el médico tiene `firma_url`. Se estampa en PDFs. Los asistentes no pueden tener firma propia.
8. **Recetas:** Solo el médico puede ver recetas. La creación está bloqueada (requiere certificación ANMAT pendiente).
9. **Estados de documentos (pedidos y certificados):** `estado` puede ser `'emitido'` o `'revocado'`. Solo el médico puede anular un documento (acción irreversible). Los certificados también tienen `valido_hasta` (fecha ISO): si `valido_hasta < hoy` el documento está expirado (se muestra en la UI, pero **no** cambia el campo `estado` en DB — es lógica de display). La página pública `/verificar/[codigo]` muestra el estado real del documento escaneando el QR.

---

## Observaciones y deuda técnica

1. **Hooks vacíos:** Los archivos en `src/hooks/` (`use-auth.ts`, `use-pacientes.ts`, `use-role.ts`, `use-turnos.ts`) tienen solo 11 bytes — son stubs vacíos. La lógica real está en Server Components y Server Actions, no en hooks de cliente.

2. **Permisos mezclados (problema del Bloque 3):** `puede_ver_historias` mezcla "ver" y "editar" historia clínica en un solo permiso. El Bloque 3 los separa y agrega permisos para todas las secciones.

3. **`puede_editar_agenda` con nombre confuso:** El campo actual controla tanto turnos como bloqueos de agenda, pero el label en la UI dice "Modificar Agenda". En el Bloque 3 se reemplaza con permisos más específicos.

4. **Columna `matricula` deprecada:** `profiles.matricula` (TEXT simple) fue reemplazada por `profiles.matriculas` (JSONB array). La columna vieja sigue en la tabla. El código usa `matriculas` (array).

5. **Admin client para permisos:** `actualizarPermisoAsistente` usa el admin client (bypass RLS) para actualizar permisos en `profiles`. Esto es necesario porque la política `profiles_update_own` solo permite que cada usuario actualice su propio perfil, y el médico necesita actualizar el perfil del asistente.

6. **`puede_ver_historias` default TRUE en código pero FALSE en DB:** En `perfil/page.tsx` se hace `?? true` como fallback, pero la migración 013 cambió el default a FALSE. Hay que ser consistente: el default real en DB es FALSE.

7. **Migración `20260326204733_fix_rls_recursion.sql`** tiene nombre de timestamp (convención diferente al resto que usa numeración secuencial). Posiblemente fue aplicada con Supabase CLI en un momento distinto.

8. **`proxy.ts` en lugar de `middleware.ts`:** En esta versión de Next.js, el middleware se implementa en `src/proxy.ts` (con la función `proxy()` y `config.matcher`). **No crear `middleware.ts`** — está deprecado. Para agregar rutas públicas, modificar el array `publicRoutes` en `proxy.ts`.

9. **`difusion_posts.medico_id`** fue agregado en la migración 010 como comentario (ya ejecutado). Si la tabla existía antes, puede haber registros sin `medico_id` si la migración de backfill no se completó correctamente.

10. **Permisos de asistentes en RLS vs UI:** Actualmente el RLS usa `puede_ver_historias` para restringir acceso a `historia_clinica` y `consultas`. Con el Bloque 3, se necesitan nuevas funciones helper y políticas para los nuevos permisos granulares.
