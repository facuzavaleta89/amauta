# RESPUESTA — Trabajo de repo: desajustes de tipos + limpieza de código muerto

> Solo `src/`. No toqué `supabase/migrations/`, ni `schema.sql`/`CLAUDE.md`/`PENDIENTES.md`/
> `DESIGN.md`, ni ejecuté nada contra Supabase. No cambié lógica de negocio.
> **Verificación:** `npx tsc --noEmit` → **exit 0**; `npx next build` →
> **✓ Compiled successfully**, sin warnings ni errores.
> Fecha: 2026-07-23 · Rama: `main`.

---

## Parte 1 — Desajustes TypeScript ↔ esquema

### 1.1 `Certificado.tipo` → nullable ✅
`src/types/pedido.ts` — `tipo: CertificadoTipo` → **`tipo: CertificadoTipo | null`** (con comentario
"nullable sin default desde la migración 017").

**Consumidores revisados:** todos los usos guardan el null:
- `certificado-template.tsx:333` `certificado.tipo ? (TIPO_LABELS[…] ?? '') : ''`, y `:334/:417`
  `=== 'otro'` / `=== 'reposo'` — seguros con null.
- `certificados/[id]/pdf/route.ts:32` y `certificado-pdf.tsx:70` interpolan `tipo` en el nombre del
  archivo (`certificado_${tipo}_…`); con null se coerciona a `"null"` en el string. Es cosmético en
  el filename, **no** es un error de tipo ni cambia lógica; no lo toqué (la restricción prohíbe
  cambios de lógica). El schema Zod ya emitía `tipo: null` (`certificadoSchema` lo transforma), así
  que esto ya podía pasar de antes.

**Cascada (1 archivo):** `src/lib/pdf/certificado-template.tsx:294` — su interface local tipaba
`tipo: string`. Al volver `Certificado.tipo` nullable, pasar la fila a la plantilla rompía
(`documentos.ts:162`, overload). **Fix mínimo de tipo:** `tipo: string` → `tipo: string | null`. El
cuerpo de la plantilla ya maneja el null (líneas 333-335, 417), así que es cambio de tipo puro, sin
lógica. Está permitido por la consigna ("corregí los errores en cascada, explicá cada uno").

### 1.2 `TurnoAuditLog.accion` sin `| string` ✅
`src/types/turno.ts:89` — `'creado' | 'modificado' | 'cancelado' | 'reprogramado' | string` →
**sin `| string`**. Verificado contra `log_turno_cambio` en `005_turnos.sql:148-174`: el trigger
solo emite `'creado'` (INSERT) y `'cancelado' | 'reprogramado' | 'modificado'` (UPDATE, `CASE`). Los
4 literales cubren todo lo que la base produce → quitar `| string` no pierde ningún valor.

### 1.3 `role: string` → `UserRole` en joins de mensajes ✅
`src/types/mensaje.ts:21-22` — `remitente?/destinatario?: { full_name: string; role: string }` →
**`role: UserRole`**. Agregué `import type { UserRole } from './roles'`.

### 1.4 Interface `MensajeLectura` ✅
Creada en `src/types/mensaje.ts` (mismo archivo, no la moví) y usada en `MensajeInterno.lecturas`.

**Decisión — refleja la PROYECCIÓN del join, no la tabla completa:**
```ts
export interface MensajeLectura { user_id: string; leido_at: string }
```
**Justificación:** el join embebido es `lecturas:mensajes_lecturas(user_id, leido_at)`
(`mensajes/actions.ts:43,90,98`) — **no** trae `mensaje_id` (la otra mitad de la PK compuesta).
Además, el update optimista de `bandeja.tsx:66` construye registros con **solo** `{ user_id,
leido_at }`. Si la interface incluyera `mensaje_id` (tabla completa), ese `bandeja.tsx:66` y los
`.some((l) => l.user_id === …)` de `hilo-modal.tsx:131` / `mensaje-card.tsx:25` / `bandeja.tsx:50,63`
seguirían compilando por leer, pero la **construcción** en `:66` fallaría por faltar `mensaje_id`. La
interface tiene que describir lo que realmente circula en memoria, que es la proyección. Si algún día
se necesita el registro completo de la tabla, se puede agregar un tipo aparte (p. ej.
`MensajeLecturaRow` con `mensaje_id`) sin tocar este.

### 1.5 Comentario de `proximo_control` ✅
`src/types/pedido.ts:255` — `// ISO date` → **`// ISO timestamptz (columna TIMESTAMPTZ desde la
migración 016)`**.

**Consumo del campo (revisado, NO cambiado):** `historia_clinica.proximo_control` se usa en el form
y PDF de HC. No encontré código que lo formatee asumiendo fecha-sin-hora de forma que rompa; se pasa
como string. **Anotado, sin cambios** (la consigna pide no tocarlo). Si en el futuro se muestra al
usuario, conviene formatearlo con hora (es timestamptz), pero hoy no hay un bug visible.

### 1.6 Barrel redundante `src/types/supabase.ts` ✅ eliminado
**Evidencia:** `grep -rn "types/supabase" src` → **0 resultados**; ninguna forma de import
(`@/types/supabase`, `./supabase`) lo referencia. `index.ts` **no** lo re-exporta (solo lo mencionaba
en un comentario). → **Sin consumidores → borrado.**

**Cascada:** `src/types/index.ts` tenía un comentario (líneas 11-13) describiendo `supabase.ts`. Al
borrar el archivo, ese comentario quedaba obsoleto/colgante. Lo **quité** (solo el bloque de
comentario; ningún `export` cambió). Es limpieza directa del borrado, no un refactor.

---

## Parte 2 — Código muerto eliminado

### 2.1 Componentes stub — 11 de 12 borrados ✅
Verificado con grep (0 imports en todo `src`, excluyendo el propio archivo) antes de borrar. Borrados:

```
src/components/dashboard/weekly-calendar.tsx
src/components/difusion/post-editor.tsx
src/components/difusion/send-modal.tsx
src/components/pacientes/evolucion-charts.tsx
src/components/pacientes/patient-tabs.tsx
src/components/shared/confirm-dialog.tsx
src/components/shared/error-boundary.tsx
src/components/shared/file-preview.tsx
src/components/shared/loading-spinner.tsx
src/components/shared/role-guard.tsx
src/components/turnero/turno-card.tsx
```

**`src/lib/pdf/receta-template.tsx` — MANTENIDO (decisión).** También tiene 0 imports (verificado:
`api/recetas/route.ts` **no** lo importa). Lo dejé como marcador intencional de la funcionalidad de
recetas, que está bloqueada por ANMAT pero se va a implementar cuando se certifique. Razones:
1. Está **explícitamente earmarkeado** en la documentación del proyecto (`CLAUDE.md`, `PENDIENTES.md`,
   `DESIGN.md`) como el placeholder del template de recetas; borrarlo ahora crearía un desajuste
   código↔docs que **este** prompt tiene prohibido corregir (la doc va en otro prompt).
2. Costo de mantenerlo: un archivo inerte de 55 bytes. Beneficio: marca el "slot" del template para
   quien implemente recetas.
Si en el prompt de documentación se decide lo contrario, borrarlo después es trivial y sin cascada.

### 2.2 Hooks stub — 4 borrados ✅
Verificado 0 imports. Borrados: `src/hooks/{use-auth,use-pacientes,use-role,use-turnos}.ts`.
**`src/hooks/use-view-mode.ts` NO se tocó** (tiene lógica real de localStorage).

---

## Errores en cascada (resumen)

| Cascada | Origen | Resolución |
|---|---|---|
| `documentos.ts:162` overload no matchea (`tipo: string\|null` vs `string`) | 1.1 (Certificado.tipo nullable) | Amplié la prop `tipo` de `CertificadoPDFProps` en `certificado-template.tsx` a `string \| null`. Cambio de tipo, sin lógica (el cuerpo ya maneja null). |
| Comentario obsoleto en `types/index.ts` | 1.6 (borrado de supabase.ts) | Quité el bloque de comentario que describía `supabase.ts`. |

Nota: la primera corrida de `tsc` mostró además errores en `.next/dev/types/validator.ts` (`Cannot
find name 'c'/'app'/…`, `RouteHandlerConfig`): eran de un **`.next` viejo/corrupto**, no de mis
cambios. Borré `.next` y volví a correr: `tsc` **exit 0**. El `next build` regenera esos artefactos
limpios.

---

## Archivos tocados (no borrados)
- `src/types/pedido.ts` — 1.1 + 1.5
- `src/types/turno.ts` — 1.2
- `src/types/mensaje.ts` — 1.3 + 1.4
- `src/types/index.ts` — comentario (cascada de 1.6)
- `src/lib/pdf/certificado-template.tsx` — prop `tipo` nullable (cascada de 1.1)

## Archivos borrados (16)
11 componentes stub + 4 hooks stub + `src/types/supabase.ts`.

---

## Qué probar en el navegador

Son cambios de tipos y borrado de archivos sin uso; el riesgo real es bajo, pero borrar siempre
puede sorprender. Smoke test corto:

1. **Certificados (1.1 + cascada del template):** abrí un certificado existente y **descargá el PDF**;
   emití un **certificado nuevo sin elegir "tipo"** (tipo = null) y descargá su PDF → debe generarse
   sin romperse (verifica que la plantilla tolera `tipo` null). Ojo cosmético: el nombre del archivo
   de un certificado sin tipo puede incluir "null" (`certificado_null_…`) — es preexistente, no lo
   cambié.
2. **Mensajería (1.3 + 1.4):** abrí `/mensajes`, mandá un **mensaje grupal**, marcá leído, y revisá
   la campanita de no-leídos. Debe verse bien (toqué solo tipos de `lecturas`/`role`, no lógica).
3. **Turnero:** creá/modificá/cancelá un turno y mirá el historial/auditoría si está expuesto (1.2 es
   solo el tipo de `accion`, sin cambio funcional).
4. **Navegación general:** que dashboard, pacientes, difusión, notas y perfil carguen. Los 12 archivos
   borrados no tenían imports, así que no debería faltar nada — este paso solo confirma que ningún
   import perdido se coló (el grep post-borrado dio vacío).

No hace falta probar HC/`proximo_control` (1.5 fue solo un comentario).

---

## Recordatorio
La **documentación** (`schema.sql`, `CLAUDE.md`, `PENDIENTES.md`, `DESIGN.md`) queda pendiente para el
**próximo prompt**: entre otras cosas habrá que reflejar que se borraron 11 de los 12 stubs (y que
`receta-template` se mantuvo a propósito), la eliminación de `types/supabase.ts`, y los ajustes de
tipos. No lo toqué acá, como pediste.
