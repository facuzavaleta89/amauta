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
Recharts · `@react-pdf/renderer` + jsPDF · Resend · Sonner.

---

## Requisitos previos

- **Node.js** LTS 20 o superior, y **npm**.
- Una cuenta y proyecto de **Supabase** (PostgreSQL + Auth + Storage).
- Opcional: cuenta de **Resend** (email) y credenciales de **WhatsApp Cloud API**
  si se activan esas integraciones.

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
#   Aplicá las migraciones de supabase/migrations/ a tu proyecto Supabase
#   (Supabase CLI o el SQL Editor del dashboard, en orden 001 → 026).
#   Para una vista consolidada del esquema, ver schema.sql (referencia, no reemplaza
#   las migraciones).
#   El bucket de Storage "estudios" (privado) se crea por migración (026), junto con
#   sus políticas RLS por tenant; no hace falta crearlo a mano. Los buckets
#   "documentos" y "difusion" TODAVÍA no existen ni se usan (ver PENDIENTES.md).

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
| `CRON_SECRET` | ✅ | Protege `/api/cron/recordatorios` (genera con `openssl rand -base64 32`) |
| `RESEND_API_KEY` | ⬜ | API key de Resend (email), si se activa el envío |
| `WHATSAPP_API_TOKEN` | ⬜ | Token de WhatsApp Cloud API, si se activa |
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
  migrations/   Migraciones SQL (fuente de verdad del esquema)
schema.sql      Snapshot consolidado del esquema (referencia)
```

> Nota: en esta versión de Next.js el middleware vive en `src/proxy.ts`
> (no crear `middleware.ts`).

---

## Documentación

- [`CLAUDE.md`](./CLAUDE.md) — instrucciones y contexto para asistentes de IA.
- [`DESIGN.md`](./DESIGN.md) — sistema de diseño (paleta, tipografía, componentes).
- [`schema.sql`](./schema.sql) — esquema consolidado de la base de datos.
- [`PENDIENTES.md`](./PENDIENTES.md) — tareas pendientes de pulido (funcional, seguridad, estético).

---

## Despliegue

Optimizada para desplegar en **Vercel**. Configurá las variables de entorno en el
panel del proyecto y agendá el cron de recordatorios (`/api/cron/recordatorios`,
protegido por `CRON_SECRET`).
