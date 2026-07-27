# RESPUESTA — Envío de difusión por email (Resend) · Parte 1: BACKEND

> Rama: `feat/difusion-envio-email` (confirmada con `git status`). Solo backend, sin UI.
> No agregué dependencias, no toqué la UI, ni RLS, ni esquema.
> **Verificación:** `npx tsc --noEmit` → **exit 0** · `npm run lint` → **96 problems (todos
> preexistentes; 0 en mis archivos)** · `npx next build` → **✓ Compiled successfully**.
> Fecha: 2026-07-27.

---

## Paso 0 — Verificaciones de solo lectura (lo que encontré)

- **Rama:** `feat/difusion-envio-email` ✓ (solo `RESPUESTA.md` estaba modificado antes de empezar).
- **Escape HTML reusable:** **no existía** en `src/lib/` → creé `escapeHtml` en `src/lib/utils.ts`
  (módulo neutro, ya usado en cliente y servidor).
- **Patrón tenant/auth/rateLimit** (de `src/app/api/difusion/route.ts:6-13,18-22` y `[id]/route.ts`):
  `supabase.auth.getUser()` → `getTenantMedicoId(supabase, userId)` (lee `profiles.role/medico_id`;
  médico = su id, asistente = `medico_id`) → `rateLimit(request, {key, limit, windowMs})`. **Lo repliqué
  igual**, con control **tenant-only** (sin chequeo de rol, como pediste).
- **`difusion_envios` / `difusion_posts`** (schema.sql + `types/difusion.ts`): confirmados. Inserto en
  `difusion_envios` los campos reales: `post_id, paciente_id, email_destino, canal, enviado_ok,
  error_msg, enviado_at, enviado_por`. La RLS `envios_insert`/`envios_select` es tenant-scoped, así que
  el conteo diario con el cliente de sesión ya queda acotado al tenant.
- **SDK Resend (`resend@^6.9.4`):** `new Resend(key)` → `resend.emails.send({from,to,subject,html})`
  devuelve `{ data, error }` (error = `{ message, name } | null`). No requiere plantillas externas.
- **Validación de email:** el proyecto usa zod `.email()` (`paciente.schema.ts:63-65`) → reusé
  `z.string().email()` para validar el formato de cada destinatario.

---

## Archivos creados / modificados

| Archivo | Cambio |
|---|---|
| `src/lib/utils.ts` | **+** `escapeHtml()` (neutro, reusable). |
| `src/lib/email/resend.ts` | **Reescrito** (era `export {}`): cliente Resend + `sendEmail()` + `EMAIL_FROM`. |
| `src/lib/email/difusion-template.ts` | **Nuevo**: `renderDifusionEmailHtml()` (HTML inline, campos escapados). |
| `src/lib/validations/difusion.schema.ts` | **+** `difusionEnvioSchema` (`post_id`, `destinatario_ids`). |
| `src/app/api/difusion/enviar/route.ts` | **Reescrito** (era `GET → "Not implemented"`): `POST` de envío (quité el GET). |

---

## Contenido final — cliente Resend (`src/lib/email/resend.ts`)

```ts
import { Resend } from 'resend'

const apiKey = process.env.RESEND_API_KEY
if (!apiKey) {
  throw new Error(
    '[email/resend] RESEND_API_KEY no está definida. Configurala en .env.local (dev) y en las variables de entorno del deploy.',
  )
}

export const resend = new Resend(apiKey)

/** Dirección remitente. Configurable por env; fallback al sandbox de Resend. */
export const EMAIL_FROM = process.env.RESEND_FROM || 'onboarding@resend.dev'

export interface SendEmailResult { ok: boolean; error?: string }

export async function sendEmail(params: { to: string; subject: string; html: string }): Promise<SendEmailResult> {
  try {
    const { error } = await resend.emails.send({
      from: EMAIL_FROM, to: params.to, subject: params.subject, html: params.html,
    })
    if (error) return { ok: false, error: error.message || error.name || 'Error de Resend' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido al enviar el email' }
  }
}
```
(El encabezado del archivo documenta el **sandbox**: sin dominio verificado, Resend solo entrega a la
casilla dueña de la cuenta; el envío real requiere verificar un dominio y setear `RESEND_FROM`.)

## Contenido final — plantilla (`src/lib/email/difusion-template.ts`)

```ts
import { escapeHtml } from '@/lib/utils'

interface DifusionEmailData { titulo: string; contenido: string; asunto?: string | null }

export function renderDifusionEmailHtml({ titulo, contenido }: DifusionEmailData): string {
  const safeTitulo = escapeHtml(titulo)
  const safeContenido = escapeHtml(contenido).replace(/\r?\n/g, '<br>')

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${safeTitulo}</title></head>
<body style="margin:0;padding:0;background-color:#f4f6f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e2d24;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8e5;">
        <tr><td style="background-color:#3d7a5c;padding:20px 28px;">
          <h1 style="margin:0;font-size:18px;line-height:1.4;color:#ffffff;font-weight:700;">${safeTitulo}</h1>
        </td></tr>
        <tr><td style="padding:28px;font-size:15px;line-height:1.7;color:#334036;">${safeContenido}</td></tr>
        <tr><td style="padding:18px 28px;background-color:#f4f6f5;border-top:1px solid #e2e8e5;font-size:12px;line-height:1.6;color:#6b7c72;text-align:center;">
          Este es un comunicado de tu consultorio.
          <!-- TODO opt-out (Ley 25.326): agregar acá el enlace de baja / preferencias del paciente. -->
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
```
Escapa primero y **después** convierte `\n` → `<br>` (así un `<br>` tecleado por el usuario queda
como texto). El asunto va en el `subject` del envío, no en el body.

## Contenido final — endpoint (`src/app/api/difusion/enviar/route.ts`)

Flujo del `POST` (runtime **Node**, `export const runtime = 'nodejs'`; se quitó el `GET` stub):
1. Auth + `getTenantMedicoId` (tenant-only, sin rol) + `rateLimit('difusion_enviar:<userId>', 10/min)`.
2. Valida el body con `difusionEnvioSchema` (`post_id` uuid, `destinatario_ids` array uuid 1–500).
3. Carga el post por `post_id` **acotado al tenant** (`.eq('medico_id', tenantMedicoId)`). Si no existe → **404**.
   Si `estado === 'enviado'` → **409** (evita doble envío). Si no tiene `asunto_email` → **400**.
4. Carga destinatarios **sin confiar en los ids del cliente**:
   `.eq('creado_por', tenant).is('archivado_at', null).not('email','is',null).in('id', destinatario_ids)`,
   y descarta los de **formato de email inválido** (zod `.email()`). Si no queda ninguno → **400**.
5. **Límite diario:** cuenta filas de `difusion_envios` con `enviado_at >= inicio del día` (tenant-scoped
   por RLS). Si `yaHoy + destinatarios > 100` → **429** con los números (`enviados_hoy`, `intentaba`, `limite`),
   **sin enviar nada**.
6. Envío **secuencial** con pausa `600ms` (~<2/s). Por cada destinatario: `sendEmail(...)` + `insert` en
   `difusion_envios` (`enviado_ok`, `error_msg`, `enviado_at`, `canal:'email'`, …). **Un fallo individual
   no corta el loop.**
7. Si `exitosos > 0` → `update` del post a `estado='enviado'` (acotado al tenant).
8. Devuelve `{ intentados, exitosos, fallidos, errores: [{paciente_id, email, error}] }`.

---

## Resultado de lint y type-check

| Check | Resultado |
|---|---|
| `npx tsc --noEmit` | **EXIT 0** — limpio. |
| `npm run lint` | **96 problems (66 errors, 30 warnings)** — **exactamente la deuda preexistente** del proyecto (documentada en `PENDIENTES.md` → "Lint preexistente"). **Ninguno** de mis 5 archivos aparece en la lista (verificado con grep). No introduje ni un problema nuevo. |
| `npx next build` | **✓ Compiled successfully**; `/api/difusion/enviar` como ruta dinámica (`ƒ`). Confirma que el `throw` top-level de `resend.ts` no rompe el build (la key está en `.env.local`). |

---

## Cómo probar el envío manualmente (para verificar antes de la UI)

**Pre-requisito del sandbox (IMPORTANTE):** con la API key de Resend **sin dominio verificado**, Resend
solo entrega **a la casilla dueña de la cuenta de Resend**. Para que el mail te llegue, el paciente
destinatario debe tener **ese mismo email** (el de tu cuenta Resend). El envío real a otros emails
requiere verificar un dominio y setear `RESEND_FROM`.

### Preparar datos (una vez)
1. Logueate en la app y creá (o usá) un **paciente activo** cuyo `email` sea **la casilla de tu cuenta
   Resend**. Anotá su `id` (uuid).
2. Creá un **comunicado** de difusión (`/difusion/nuevo`) con **canal email** y **asunto** (obligatorio),
   dejalo en cualquier estado que **no** sea "Enviado". Anotá su `id` (uuid) — está en la URL `/difusion/<id>`.

### Llamar al endpoint
Desde el navegador logueado (la cookie de sesión viaja sola), en la consola del DevTools:
```js
await fetch('/api/difusion/enviar', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    post_id: '<UUID_DEL_POST>',
    destinatario_ids: ['<UUID_DEL_PACIENTE>']
  })
}).then(r => r.json())
```

### Qué esperar
- **Éxito:** llega el email a tu casilla; la respuesta es
  `{ intentados: 1, exitosos: 1, fallidos: 0, errores: [] }`. El post pasa a **estado "Enviado"** (la
  lista `/difusion` lo muestra así). En la tabla `difusion_envios` aparece 1 fila con `enviado_ok = true`.
- **Reintento del mismo post:** **409** `"Este comunicado ya fue enviado."` (no reenvía).
- **Paciente con email inexistente/malformado, o de otro tenant, o archivado:** se descarta; si no queda
  ninguno válido → **400** `"Ninguno de los destinatarios seleccionados tiene un email válido."`
- **Fallo de entrega en un destinatario** (p. ej. en sandbox, mandar a un email que **no** es tu casilla):
  la respuesta trae `fallidos: 1` y `errores: [{ paciente_id, email, error }]` con el motivo de Resend, y
  queda una fila en `difusion_envios` con `enviado_ok = false` + `error_msg`. Si ninguno salió bien, el post
  **no** pasa a "Enviado".
- **Superar 100/día:** **429** con `{ enviados_hoy, intentaba, limite: 100 }` y **sin enviar nada**.

### Verificación en la base (opcional, SQL Editor)
```sql
SELECT enviado_ok, error_msg, email_destino, enviado_at
FROM public.difusion_envios ORDER BY enviado_at DESC LIMIT 10;

SELECT count(*) FROM public.difusion_envios
WHERE enviado_at >= date_trunc('day', now());   -- lo que cuenta el límite diario
```

---

## Nota sobre el alcance (para la Parte 2 / UI)
- El endpoint **re-valida** la lista de destinatarios contra la base; la UI solo tiene que **mostrar** la
  lista de pacientes activos con email y mandar sus ids seleccionados.
- El **opt-out (Ley 25.326)** quedó marcado como `// TODO` en la plantilla; pendiente para una tanda futura.
- **Decisión previa respetada:** el envío es **tenant-only** (sin chequeo de rol médico); si en el futuro
  se quisiera restringir a médico, iría en este endpoint (hoy no está).
