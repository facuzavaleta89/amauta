# RESPUESTA — Rate limiting efectivo: código de la aplicación

> Tanda de rate limiting. La migración 031 (tabla `rate_limits` + función
> `check_rate_limit`) ya está ejecutada. Este prompt conecta la app.
> **No toqué** la CSP/`next.config.ts`, ni el auto-registro como médico, ni turnero/
> mensajería/difusión/lógica clínica, ni la migración 031.
> **Verificación:** `npx tsc --noEmit` → **exit 0**; `npx next build` →
> **✓ Compiled successfully**, sin warnings ni errores.
> Fecha: 2026-07-24 · Rama: `main`.

---

## Archivos tocados

| Archivo | Cambio |
|---|---|
| `src/lib/rate-limit.ts` | **Reescrito**: `Map` en memoria → RPC `check_rate_limit` vía admin client, con **fail-open + timeout**. |
| `src/app/(auth)/actions.ts` | Login **5/min** (era 10/15min) y registro **3/min** (era 5/60min). |
| `src/app/verificar/[codigo]/page.tsx` | Nuevo rate limit **30/min por IP** con respuesta amable y neutra. |
| `src/app/api/cron/recordatorios/route.ts` | **H6** (`CRON_SECRET` timing-safe) + **limpieza** de `rate_limits`. |
| **19 Route Handlers** (`src/app/api/**`) | `rateLimit(...)` ahora es `async` → se agregó `await` (35 call sites). |

Los 19 Route Handlers con `await` agregado (35 llamadas): `pedidos/route.ts`,
`pedidos/[id]/route.ts`, `pedidos/[id]/anular/route.ts`, `certificados/route.ts`,
`certificados/[id]/route.ts`, `certificados/[id]/anular/route.ts`, `pacientes/route.ts`,
`pacientes/[id]/route.ts`, `pacientes/[id]/archivar/route.ts`, `consultas/route.ts`,
`consultas/[id]/route.ts`, `estudios/route.ts`, `estudios/[id]/route.ts`,
`turnero/route.ts`, `turnero/[id]/route.ts`, `turnero/bloqueos/route.ts`,
`turnero/bloqueos/[id]/route.ts`, `difusion/route.ts`, `difusion/[id]/route.ts`.

---

## Cómo quedó la interfaz de `rate-limit.ts`

**Cambio de firma (el único):** `rateLimit()` y `checkRateLimit()` pasaron de **síncronas a
`async`** (`Promise<RateLimitResult>`), porque ahora hacen I/O a la base. Por eso los Route
Handlers necesitaron `await`. Todo lo demás se mantiene idéntico:

- `rateLimitAction(options)` — ya era async; **login/registro no cambiaron su forma de llamar**.
- `rateLimitResponse(retryAfterMs)`, `getIp(request)`, `getIpFromHeaders()` — **sin cambios de firma**.
- `RateLimitOptions { key, limit, windowMs }` y `RateLimitResult { success, remaining, retryAfter? }`
  **iguales**. Clave: mantuve `windowMs` (ms) en la entrada y `retryAfter` (ms) en la salida, aunque
  la RPC trabaja en segundos — la conversión (`windowMs→secs`, `retry_after_secs→ms`) es interna, así
  los llamadores (`rateLimitResponse(rl.retryAfter!)`, `Math.ceil(retryAfter!/60000)`) siguen funcionando.

**Fail-open + timeout:** la llamada va envuelta en `try/catch` con
`.abortSignal(AbortSignal.timeout(2000))`. Si la RPC falla, tarda >2s, o falta el env del admin
client → se **loguea** (`console.error('[rate-limit] fail-open …')`) y se devuelve
`{ success: true }`. Nunca se bloquea un flujo legítimo por infraestructura.

**Prefijos de key:** cada uso lleva su prefijo (`login:`, `registro:`, `verificar:`, y los
`<accion>:${user.id}` de las API), así distintos usos no comparten contador.

`remaining` ya no es exacto (la RPC solo devuelve `allowed` + `retry_after_secs`); devuelvo un
best-effort (`limit` si permite, `0` si bloquea). **Ningún llamador usa `remaining`** (verificado),
así que no afecta a nadie.

---

## `getIp` cuando no hay header de IP (H7)

Extracción: `x-forwarded-for` (primer valor, trim) → `x-real-ip` (trim) → `'unknown'`.

**Decisión para el caso "sin ningún header":** devuelvo **`'unknown'`** (esos requests comparten una
cubeta), documentado en el código. Razonamiento:
- En **Vercel `x-forwarded-for` siempre está** y el cliente **no lo puede falsificar** (Vercel lo
  reescribe en el edge). Así que `'unknown'` **solo ocurre fuera de Vercel** (dev local, runtime raro),
  que **no es un entorno expuesto a ataques**.
- Descarté **fail-open cuando la IP es unknown** (saltear el límite): un atacante podría, en teoría,
  desactivar el rate limit borrando el header — aunque en Vercel no puede. Compartir una cubeta es
  **más conservador** que desactivar el límite.
- Descarté que el bucket compartido perjudique al login: su key es `login:${ip}:${email}`, así que el
  **email diferencia** los contadores aun con `ip='unknown'`. El caso compartido real
  (`registro:unknown`, `verificar:unknown`) solo afecta a dev local.

Mejora concreta sobre el código previo: agregué `.trim()` también a `x-real-ip`.

---

## Cómo probar cada límite manualmente

> Los contadores son **por ventana de 60s** y viven en la tabla `rate_limits` (compartidos entre
> instancias). Para "resetear" un contador durante las pruebas: `DELETE FROM rate_limits WHERE key
> LIKE 'login:%';` (o el prefijo que corresponda) en el SQL Editor.

### Login — 5/min por IP+email
1. En `/login`, intentá entrar **6 veces seguidas** con el **mismo email** (contraseña incorrecta
   sirve). Las primeras 5 devuelven "Email o contraseña incorrectos"; la **6.ª** debe devolver
   *"Demasiados intentos. Esperá 1 minuto…"* (sin revelar si el email existe).
2. Verificá el contador: `SELECT key, count FROM rate_limits WHERE key LIKE 'login:%';` → `count = 6`.
3. Esperá 1 minuto (nueva ventana) y confirmá que vuelve a permitir.

### Registro — 3/min por IP
1. En `/registro`, enviá el formulario **4 veces** (pueden fallar por email repetido). La **4.ª** debe
   cortar con *"Demasiados intentos de registro…"*.
2. `SELECT key, count FROM rate_limits WHERE key LIKE 'registro:%';` → `count = 4`.

### `/verificar/[codigo]` — 30/min por IP
1. Recargá `/verificar/CUALQUIERCODIGO` **31 veces** en menos de un minuto (un bucle de `curl` a la
   URL, o refresh rápido). Las primeras 30 muestran la verificación normal (válido/anulado/inválido);
   la **31.ª** debe mostrar la tarjeta **"Demasiadas solicitudes"** (neutra, no dice si el código
   existe).
   ```bash
   for i in $(seq 1 31); do curl -s -o /dev/null -w "%{http_code}\n" https://<host>/verificar/TESTCODE; done
   ```
2. `SELECT key, count FROM rate_limits WHERE key LIKE 'verificar:%';` → `count = 31`.

### API autenticada (ejemplo)
Los límites de las rutas API no cambiaron (respeté los existentes). P. ej. `POST /api/pedidos` sigue
en 30/min por `user.id`. Ahora **sí funcionan de verdad** en producción (antes el `Map` no se
compartía entre lambdas).

---

## Cómo verificar el FAIL-OPEN sin romper la base

El fail-open se dispara si la RPC falla, tarda >2s, o el admin client no puede inicializarse. Formas
seguras de probarlo **sin tocar la tabla**:

1. **Simular que la RPC no existe** (en un entorno de prueba, no en prod): renombrá temporalmente la
   función en la base (`ALTER FUNCTION public.check_rate_limit(text,int,int) RENAME TO
   check_rate_limit_off;`) y hacé login/verificar. Debe **funcionar normal** (permite), y en los logs
   del server aparece `[rate-limit] fail-open — la RPC check_rate_limit falló…`. Restaurá el nombre
   después. **Ningún flujo se cae.**
2. **Simular env faltante** (dev local): quitá `SUPABASE_SERVICE_ROLE_KEY` de `.env.local` y probá el
   login → `createAdminClient()` lanza, el `catch` lo captura, se loguea el fail-open y el login sigue
   andando. Restaurá la key.
3. **Timeout:** difícil de forzar sin latencia real; el `AbortSignal.timeout(2000)` garantiza que si
   la RPC no responde en 2s, se aborta y cae al fail-open en vez de colgar el request.

En los tres casos el comportamiento esperado es: **el usuario no nota nada** (se permite), y queda el
`console.error` de fail-open para monitoreo. Como lo dijimos en el diagnóstico: si esa tabla no
responde, la auth (mismo clúster) tampoco, así que no se abre un hueco real.

---

## Detalle de H6 (CRON_SECRET timing-safe)

`api/cron/recordatorios/route.ts`: reemplacé `authHeader !== \`Bearer ${secret}\`` por
`safeEqual(authHeader, \`Bearer ${secret}\`)` con `crypto.timingSafeEqual`. `safeEqual` iguala por
longitud primero (si difieren → `false`, sin lanzar; `timingSafeEqual` exige buffers del mismo
largo). El chequeo completo: `if (!secret || !authHeader || !safeEqual(...))` → 401.

## Detalle de la limpieza en el cron (decisión 6/7)

`DELETE FROM rate_limits WHERE window_start < now() - 1 hora`, con el `.lt('window_start', cutoff)`
del cliente service-role. La puse **al inicio del cron** (después del auth), **no** al final, a
propósito: el cron hace `return` temprano cuando no hay turnos (el caso más común), y al final la
limpieza se saltearía en esos crons "vacíos". Está en su **propio try/catch**: si falla, se loguea y
el cron sigue con los recordatorios.

---

## Nota de render
`/verificar/[codigo]` sigue siendo **dinámica** (`ƒ` en el build) — ya lo era por usar el admin RPC
por request; agregar `getIpFromHeaders()` no cambió eso. No hay impacto de static→dynamic en ninguna
página (la CSP/nonce, que sí lo tendría, quedó fuera de esta tanda).

---

## Qué NO toqué (restricciones)
CSP/`next.config.ts`, auto-registro como médico, turnero/mensajería/difusión/lógica clínica, la
migración 031. No ejecuté nada contra Supabase.
