# RESPUESTA — Unificar notificaciones de mensajes en la campanita

Completo. La campanita del header es ahora el centro único de avisos: **solicitudes +
mensajes no leídos**, para médico y para asistentes con `acceso_mensajeria`.

---

## PARTE 0 — Realtime: **hubo SQL** (idempotente), ya lo ejecutaste

No se pudo verificar de forma read-only si `mensajes_internos` estaba en la publicación
`supabase_realtime` (sin credenciales de Postgres; el Realtime se configura por dashboard y no
hay `ALTER PUBLICATION` en las migraciones; la sonda Realtime da `SUBSCRIBED` esté o no la tabla,
así que no distingue). Por eso escribí un SQL **idempotente** (guard sobre `pg_publication_tables`),
seguro en ambos casos:
- `supabase/migrations/023_realtime_mensajes_internos.sql`
- `MIGRACION-P4.sql` (raíz)

**Confirmaste que lo ejecutaste**, así que `mensajes_internos` queda habilitada para Realtime.

---

## Componente renombrado

`notificaciones-medico.tsx` → **`notificaciones-bell.tsx`** (export `NotificacionesMedico` →
**`NotificacionesBell`**). Se eliminó el archivo viejo y se actualizó el import en `header.tsx`.
El nombre ya no es preciso como "del médico" porque ahora la usan también los asistentes.

---

## Qué se hizo (Parte 1)

1. **Campanita generalizada** (`notificaciones-bell.tsx`): recibe `solicitudesIniciales` +
   `mensajesIniciales` y muestra el badge con la **suma** de ambos. El dropdown tiene dos bloques:
   **Solicitudes** (solo médico, con aprobar/rechazar como antes) y **Mensajes** (cada ítem
   linkea a `/mensajes?hilo=<raíz>`). El bloque de solicitudes y su suscripción solo se arman
   para el médico.
2. **Realtime de mensajes**: además de la suscripción de solicitudes (médico), una segunda
   binding `postgres_changes`/`INSERT` sobre `mensajes_internos` filtrada por
   `medico_id=eq.<tenant>`; en el handler se decide si el mensaje es para mí:
   - individual: `destinatario_id === userId` y no es mío;
   - grupal: `es_grupal` y `remitente_id !== userId`.
   Al llegar, se busca el nombre del remitente (RLS permite leer perfiles del mismo tenant) y se
   agrega al estado (con guard anti-duplicados), igual que las solicitudes. **Todo dentro de un
   `try/catch`**: si la suscripción falla, la campanita queda con la carga inicial y el layout no
   se rompe.
3. **Visible también para asistentes** con `acceso_mensajeria` (antes era exclusiva del médico).
   Se **eliminó del `header.tsx` el ícono de mensajes separado**; ese badge ahora vive en la
   campanita. Condición de render: `userRole === 'medico' || tieneAccesoMensajeria`.
4. **Carga inicial**: nueva `obtenerMensajesNoLeidos()` en
   `(app)/notificaciones/actions.ts` (mismo estilo defensivo que `contarMensajesNoLeidos`,
   devuelve `[]` ante error). Trae los no leídos (individuales + grupales) con el nombre del
   remitente y el `thread_id` (raíz) para linkear. El `layout.tsx` la llama y pasa
   `mensajesIniciales` por el shell hasta la campanita. El conteo del sidebar
   (`contarMensajesNoLeidos` → `MensajesProvider`) queda igual.
5. **Marcar como leído**: sin cambios en la lógica — `HiloModal` ya llama `marcarMensajeLeido()`
   al abrir el hilo. Al abrir un mensaje **desde la campanita**, además se lo saca del estado
   local para que el badge baje al instante (la fuente de verdad sigue siendo
   `mensajes_internos.leido` / `mensajes_lecturas`; la campanita solo la refleja).

**Deep-link `/mensajes?hilo=<id>`**: `mensajes/page.tsx` lee el `searchParams` y `bandeja.tsx`
abre ese hilo al entrar (vía inicializador de `useState`, sin `set-state-in-effect`).

No se tocó la tabla `notificaciones` (sigue con su uso `turno_creado`/`recordatorio_enviado`).

---

## Archivos tocados

**Nuevos:** `src/components/layout/notificaciones-bell.tsx`,
`supabase/migrations/023_realtime_mensajes_internos.sql`, `MIGRACION-P4.sql`.
**Eliminado:** `src/components/layout/notificaciones-medico.tsx`.
**Modificados:** `src/app/(app)/notificaciones/actions.ts` (nueva `obtenerMensajesNoLeidos`),
`src/types/mensaje.ts` (tipo `MensajeNoLeido`), `src/components/layout/header.tsx`,
`src/components/layout/layout-shell.tsx`, `src/app/(app)/layout.tsx`,
`src/app/(app)/mensajes/page.tsx`, `src/components/mensajes/bandeja.tsx`.

---

## Verificación

**Automática (hecha):**
- `tsc --noEmit` limpio y `next build` exit 0.
- ESLint: mis archivos nuevos, limpios. `bandeja.tsx` conserva 2 warnings **pre-existentes**
  (`startTransition` y `router` sin usar) que no introduje.
- Smoke test con el server levantado: `/dashboard` y `/mensajes?hilo=x` sin sesión redirigen
  (307) a login sin 500 — el layout (que ahora llama `obtenerMensajesNoLeidos`) no crashea.
- Realtime: la migración idempotente garantiza que `mensajes_internos` está en la publicación.

**Pendiente de prueba manual (requiere la app logueada, no lo pude ejercitar desde acá):**
- El médico ve la campanita con badge = solicitudes + mensajes no leídos.
- El asistente con `acceso_mensajeria` ve la campanita (antes no la tenía) con sus mensajes.
- Un mensaje nuevo (individual y grupal) aparece en la campanita en vivo, sin recargar.
- Abrir el mensaje (desde la campanita o la bandeja) lo marca leído y baja el badge.
- Sin doble aviso: el mismo mensaje no aparece duplicado en dos sistemas.

> Nota sobre el badge tras leer desde la **bandeja** (no desde la campanita): como el
> `(app)/layout.tsx` es un Server Component que no se re-ejecuta en cada navegación cliente, el
> badge de la campanita se actualiza en vivo para mensajes **nuevos** (Realtime) y al abrir
> **desde la campanita** (quita local); si se lee desde la bandeja, el badge se pone al día en la
> próxima carga/navegación completa. Es el mismo comportamiento que tenía el ícono separado
> anterior; no se introdujo un doble estado de "leído".
