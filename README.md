# Amauta

App web de gestión médica para un consultorio de **diabetología** unipersonal.
Permite gestionar pacientes, historia clínica, turnos, pedidos de estudios,
certificados, difusión, notas y mensajería interna, con dos roles (médico titular
y asistentes) y un sistema de permisos granulares.

**Estado:** v1.0 deployada y funcional. Los pulidos finales pendientes están en
[`PENDIENTES.md`](./PENDIENTES.md).

---

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Supabase (PostgreSQL + Auth) ·
Tailwind CSS v4 · shadcn/ui (Radix) · React Hook Form + Zod · FullCalendar ·
date-fns + date-fns-tz · Recharts · `@react-pdf/renderer` + jsPDF · Resend · Sonner.

---

## Requisitos previos

- **Node.js** LTS 20 o superior, y **npm**.
- Una cuenta y proyecto de **Supabase** (PostgreSQL + Auth + Storage).
- Cuenta de **Resend** (email) si vas a usar el **envío de difusión**, que ya está
  implementado y depende de `RESEND_API_KEY`. Sin dominio verificado en Resend, los
  envíos van contra el sandbox (solo llegan a la casilla dueña de la cuenta).
- Opcional: credenciales de **WhatsApp Cloud API** — el canal WhatsApp **todavía no
  está implementado**.

---

## Instalación y arranque local

```bash
# 1. Clonar e instalar dependencias
git clone <repo-url>
cd amauta
npm install

# 2. Configurar variables de entorno
cp .env.example .env.local
#   Editá .env.local con los valores de tu proyecto Supabase (ver abajo).

# 3. Preparar la base de datos
#   Corré supabase/migrations/000_baseline.sql sobre tu proyecto Supabase NUEVO Y VACÍO
#   (SQL Editor del dashboard, como postgres). Es un archivo único que recrea el esquema
#   completo: tablas, tipos, funciones, triggers, políticas RLS, índices, los buckets de
#   Storage y el catálogo de obras sociales. Después van las migraciones 049 en adelante,
#   si las hubiera: la 048 (drop de turnos.color) ya está incorporada en el baseline.
#   ⚠ EL BASELINE NUNCA SE EJECUTÓ CONTRA NINGUNA BASE: está comparado objeto por objeto
#   contra producción, pero comparar no es verificar. Mientras siga así, el entorno que
#   levantes con él NO es equivalente a producción. El aviso completo —el riesgo concreto
#   y qué falta para cerrarlo— está arriba de todo en supabase/migrations/_historico/README.md
#   y en el encabezado del propio baseline. Si lo corrés, contalo: sos la primera persona.
#   ⚠ NO uses las migraciones 001 → 047 como secuencia: NO son ejecutables desde una base
#   vacía (seis de ellas referencian dos tablas que recién se crean en la 030). Están
#   archivadas en supabase/migrations/_historico/ como registro de las decisiones del
#   proyecto, no como script de instalación.
#   Los buckets de Storage "estudios" y "documentos" (los dos privados) los crea el
#   baseline junto con sus políticas RLS por tenant; no hace falta crearlos a mano. El
#   bucket "difusion" TODAVÍA no existe ni se usa (ver PENDIENTES.md).
#   Para leer el modelo de datos de corrido, ver schema.sql — pero es DERIVADO: ante
#   cualquier diferencia manda el baseline, y ante una duda real manda la base viva.

# 4. Levantar el servidor de desarrollo
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000). La primera cuenta que registres
puede marcarse como médico (`role='medico'`); los asistentes se registran y luego se
vinculan a un médico desde el flujo de onboarding.

---

## Variables de entorno

Definidas en `.env.local` (ver [`.env.example`](./.env.example)). **Nunca** commitees
`.env.local`.

| Variable | Requerida | Descripción |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | URL pública del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Clave anon/public (segura para el cliente) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Clave service role — **secreta, bypass RLS**, solo server |
| `NEXT_PUBLIC_SITE_URL` | ✅ | URL base de la app para los **QR de verificación** de documentos (`/verificar/[codigo]`). Requerida: los PDF se congelan al emitir, así que el QR se graba de forma permanente y no debe derivarse del header `Host` (falsificable). Prod: `https://amauta-salud.vercel.app`; local: `http://localhost:3000` |
| `CRON_SECRET` | ✅ | Protege `/api/cron/recordatorios` (genera con `openssl rand -base64 32`) |
| `RESEND_API_KEY` | ⚠️ | API key de Resend. **Requerida para que funcione el envío de difusión por email**: sin ella cada destinatario falla con un mensaje claro. El resto de la app funciona (y **buildea**) sin ella |
| `RESEND_FROM` | ⬜ | Dirección remitente de los emails de difusión. Si no está, cae al sandbox `onboarding@resend.dev`, que **solo entrega a la casilla dueña de la cuenta de Resend**. Para enviar de verdad a los pacientes hay que **verificar un dominio** en Resend y poner acá una dirección de ese dominio |
| `WHATSAPP_API_TOKEN` | ⬜ | Token de WhatsApp Cloud API, si se activa (canal **no implementado** todavía) |
| `WHATSAPP_PHONE_NUMBER_ID` | ⬜ | ID del número de WhatsApp, si se activa |

---

## Scripts

```bash
npm run dev     # Servidor de desarrollo
npm run build   # Build de producción
npm run start   # Servidor de producción (requiere build previo)
npm run lint    # ESLint
```

---

## Estructura del proyecto (resumen)

```
src/
  app/          Rutas (App Router): (auth), (app), api, onboarding, verificar
  components/   UI (shadcn/ui) y componentes por sección
  constants/    Navegación por rol, catálogos
  contexts/     Contextos de cliente (permisos, mensajes no leídos)
  lib/          Clientes Supabase, PDF, email, validaciones Zod, rate-limit
  types/        Tipos por dominio + index.ts (barrel)
  proxy.ts      Middleware de Next.js (sesión + guard de rutas)
supabase/
  migrations/
    000_baseline.sql   Esquema completo en un archivo — AUTORIDAD. Punto de partida.
    _historico/        Las 49 migraciones 001→047, archivadas (no ejecutables en secuencia)
      _copias-ejecutables/   Las copias MIGRACION-*.sql que vivían en la raíz
schema.sql      Snapshot del esquema — DERIVADO, se mantiene a mano (referencia de lectura)
```

> Nota: en esta versión de Next.js el middleware vive en `src/proxy.ts`
> (no crear `middleware.ts`).

---

## Documentación

- [`CLAUDE.md`](./CLAUDE.md) — instrucciones y contexto para asistentes de IA.
- [`DESIGN.md`](./DESIGN.md) — sistema de diseño (paleta, tipografía, componentes).
- [`supabase/migrations/000_baseline.sql`](./supabase/migrations/000_baseline.sql) — esquema completo en un archivo. **La autoridad.** ⚠ Nunca se ejecutó: ver el aviso de su encabezado.
- [`supabase/migrations/_historico/README.md`](./supabase/migrations/_historico/README.md) — por qué las migraciones 001→047 no son ejecutables como secuencia, y qué falta para dar el baseline por verificado.
- [`schema.sql`](./schema.sql) — esquema de la base para leer de corrido. **Derivado:** ante una diferencia manda el baseline; ante una duda real, la base viva.
- [`PENDIENTES.md`](./PENDIENTES.md) — tareas pendientes de pulido (funcional, seguridad, estético).

---

## Despliegue

Optimizada para desplegar en **Vercel**. Configurá las variables de entorno en el
panel del proyecto y agendá el cron de recordatorios (`/api/cron/recordatorios`,
protegido por `CRON_SECRET`). Ese cron, además de los recordatorios de turnos, hace la
**limpieza de la tabla `rate_limits`** (borra las ventanas de rate limiting ya cerradas),
así que conviene que corra periódicamente (p. ej. cada hora).
