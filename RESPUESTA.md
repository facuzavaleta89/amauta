# RESPUESTA — Documentación de la tanda de rate limiting

> Solo documentación. **No toqué `src/` ni `supabase/migrations/`.** No ejecuté nada contra
> Supabase. Verifiqué cada afirmación contra el código, la migración 031 y `rate-limit.ts`.
> Fecha: 2026-07-24 · Rama: `main`.

---

## Qué actualicé en cada documento

### `schema.sql`
- **Encabezado:** rango `001→030` → **`001→031`** + resumen de la 031.
- **Sección nueva "RATE LIMITING"** al final (antes de FIN DEL SNAPSHOT): la tabla `rate_limits`
  (fixed-window, PK `(key, window_start)`, índice sobre `window_start`), el `ENABLE RLS` **sin
  políticas** (con la nota de que es deliberado, mismo criterio que el bucket `documentos`), la
  función `check_rate_limit(text, int, int)` completa (SECURITY DEFINER, `search_path`, UPSERT
  atómico), y los `REVOKE/GRANT` (solo `service_role`/`postgres`). Transcrita de la migración 031
  real, no reconstruida de memoria.

### `CLAUDE.md`
- **Nota técnica 15 (nueva):** migración 031 + rate limiting persistente. Qué resolvió (el `Map`
  en memoria inútil en serverless dejaba el login sin protección), el **fail-open** con timeout de
  2s y por qué, la interfaz async, y los **límites por endpoint** (login 5/min IP+email, registro
  3/min IP, `/verificar` 30/min IP; API por `user.id`). También menciona la limpieza en el cron y
  el fix del `CRON_SECRET`.

### `PENDIENTES.md`
- **Rate limiter in-memory → ✅ RESUELTO** (migración 031 + `rate-limit.ts`), con los límites y el
  fail-open.
- **H6 (CRON_SECRET timing-safe) → ✅ RESUELTO**; **H7 (getIp) → ✅ RESUELTO**, con la decisión
  documentada sobre el caso "sin header de IP".
- **Enumeración de códigos en `/verificar` → ✅ RESUELTO** (30/min por IP) — actualicé **las dos**
  menciones (la de la sección "Verificación pública" y el hallazgo del diagnóstico).
- **Auto-registro como médico:** reescrito como **riesgo conocido y aceptado**, con severidad
  **ALTO** y la solución prevista (panel de admin con aprobación de altas).
- **CSP:** actualizada de "endurecer CSP" a **diagnosticada con plan concreto, pendiente de su
  propia tanda** — incluye el hallazgo de que **`style-src 'unsafe-inline'` es inevitable** con
  Radix/Recharts/FullCalendar (los nonces no aplican a atributos `style`), que `script-src` sí es
  removible con nonce en `proxy.ts`, y el costo (render dinámico). Se hará después del bloque
  estético.
- **Logs:** marcado como ✅ verificado (no se loguean secreto ni datos de pacientes crudos).
- **Sesiones/cookies:** el A VERIFICAR de los flags de cookie en producción quedó anotado.

### `README.md`
- Rango de migraciones `001 → 030` → **`001 → 031`**.
- Sección de despliegue: aclaré que el cron `/api/cron/recordatorios` **también limpia
  `rate_limits`**, así que conviene que corra periódicamente (~cada hora). La tabla de variables de
  entorno no cambió (la 031 no agrega env vars).

### `DESIGN.md`
- **Sin cambios.** La única adición visual de la tanda es la tarjeta "Demasiadas solicitudes" en
  `/verificar/[codigo]`, que **reutiliza el mismo patrón** de las tarjetas de estado que ya existen
  en esa página (slate, `rounded-2xl`, ícono en círculo). No introduce un patrón nuevo; y esa
  página ya está señalada en DESIGN.md como usuaria de clases crudas de color (inconsistencia
  estética ya registrada). No hay nada que documentar.

---

## Confirmación de los hallazgos del diagnóstico (Eje 5)

Repasé que **todos** los hallazgos de seguridad del diagnóstico quedaron anotados con su severidad:

| Hallazgo | Estado en la doc |
|---|---|
| H1 — rate limiter en memoria (CRÍTICO) | ✅ RESUELTO (PENDIENTES + CLAUDE nota 15) |
| H2 — `/verificar` sin rate limit (MEDIO) | ✅ RESUELTO (PENDIENTES ×2) |
| H3 — CSP `script-src 'unsafe-inline'` (MEDIO) | Diagnosticada, plan concreto, tanda propia (PENDIENTES) |
| H5 — auto-registro como médico (ALTO) | Riesgo conocido/aceptado + solución prevista (PENDIENTES) |
| H6 — CRON_SECRET no timing-safe (BAJO) | ✅ RESUELTO |
| H7 — getIp → 'unknown' (BAJO) | ✅ RESUELTO, con la decisión documentada |
| Admin client (justificado en todos lados) | Sin acción (era la conclusión del diagnóstico) |
| Logs sin secretos/datos crudos | ✅ verificado (PENDIENTES) |
| Cookies `HttpOnly/Secure/SameSite` | A VERIFICAR en prod (PENDIENTES) |

---

## Inconsistencias entre documentación y código real

1. **`schema.sql` documentaba `verificar_documento` como el único admin-RPC público, sin rate
   limit — ya no aplica.** No era una afirmación literal en el archivo, pero la mención de
   `/verificar` en la nota de logs de `PENDIENTES.md` seguía sugiriendo un endpoint sin protección;
   quedó alineada con el rate limit ya agregado. Sin acción pendiente.
2. **Ninguna afirmación obsoleta quedó en pie** sobre el "Map en memoria", "no protege contra
   brute-force", "no hay rate-limiting en /verificar" ni el rango `001→030`: barrí los cinco
   documentos con grep y están todas actualizadas (solo quedan menciones **históricas**, del tipo
   "el rate limiter *vivía* en un Map… ahora usa Postgres", que son correctas).
3. **No detecté ninguna divergencia nueva** entre lo que documenté y el código: los límites
   (5/3/30), las keys (`login:`/`registro:`/`verificar:`), la firma de la función
   (`check_rate_limit(text,int,int)`), los grants (`service_role`/`postgres`) y la limpieza en el
   cron los verifiqué leyendo `(auth)/actions.ts`, `verificar/[codigo]/page.tsx`,
   `api/cron/recordatorios/route.ts` y `031_rate_limits.sql` antes de escribir.

---

## Lo que NO toqué
`src/`, `supabase/migrations/`, y nada contra Supabase. `DESIGN.md` quedó sin cambios (justificado
arriba).
