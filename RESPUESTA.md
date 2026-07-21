# RESPUESTA — HC: PDF al servidor + reordenar medicación + campos dinámicos

Las tres partes completas. Resumen abajo. Verificación automática: `tsc` limpio, `next build`
exit 0, y chequeos puntuales por parte. Falta la prueba manual en el navegador (logueado), que
detallo al final.

---

## ✅ PARTE 3 — PDFs de HC migrados al servidor (hecha primero)

Antes la HC era el único PDF generado en el navegador (`pdf().toBlob()` + import dinámico de
`@react-pdf`), y fallaba escondido tras un toast. Ahora se genera en el servidor con
`renderToBuffer`, igual que pedidos y certificados.

**Route Handlers nuevos** (patrón de `api/pedidos/[id]/pdf/route.ts`):
- `src/app/api/consultas/[id]/pdf/route.ts` — consulta individual.
- `src/app/api/pacientes/[id]/historia/pdf/route.ts` — HC completa (consultas finalizadas).

**Aislamiento por tenant + permiso:** cada handler valida sesión (401), resuelve el tenant y
exige `ver_historia_clinica` (`getTenantContext` → 403 si el asistente no lo tiene), y consulta
los datos **filtrando por el tenant del usuario** con el cliente de sesión (RLS activa).
Cambiar el `id` por el de otro tenant → 404, nunca el PDF. El admin client se usa solo para
leer el perfil del médico firmante, y **después** de autorizar.

**Botones** (`pdf-download-button.tsx`): descargan por `fetch` desde esos endpoints (blob →
`<a download>`), con spinner y toast de error. Ya no importan `@react-pdf`: **esa librería
salió del bundle del cliente**. Además, la **firma del médico ya no viaja al navegador**: se
eliminó el prop `medico` de toda la cadena cliente (`historia-clinica-view.tsx`,
`consulta-detail.tsx`) y el fetch del perfil en `pacientes/[id]/historia/page.tsx`.

**Verificado:** `next build` registra ambas rutas; smoke test con el server levantado → los dos
endpoints dan **HTTP 401 sin sesión** (no filtran el PDF).

---

## ✅ PARTE 1 — "Medicación actual" reordenada

Orden nuevo **motivo → medicación actual → anamnesis** ("Medicación Actual" como subsección
propia con ícono `Pill`). Replicado en los tres lugares: formulario (`ConsultaForm`), vista
(`ConsultaReadOnly`) y PDF (`ConsultaBody`). No cambió el payload ni la validación (solo se
movió JSX). Verificado por orden en los 3 archivos + build.

---

## ✅ PARTE 2 — Campos dinámicos en Examen Físico y Parámetros Metabólicos

Columna JSONB `campos_extra` en `consultas`, array de `{ seccion, nombre, valor }`. Los 6 pasos
del checklist "se guarda Y se muestra", completos:

1. **Migración** (ejecutada por vos): `supabase/migrations/022_consultas_campos_extra.sql`
   (+ `MIGRACION-P2.sql`). Confirmé que la columna existe en la base.
2. **Tipos** (`src/types/consulta.ts`): `CampoExtraSeccion` (unión de literales), `CampoExtra`,
   y `campos_extra` en `Consulta` y `ConsultaInsert`. Se exporta por el barrel `index.ts`
   (ya reexportaba `./consulta`).
3. **Schema Zod** (`src/lib/validations/consulta.schema.ts`): array de objetos con `seccion`
   (enum), `nombre` (1–60 chars, trim), `valor` (≤500), tope de 20, default `[]`.
4. **Formulario** (`ConsultaForm`): botón "+ Agregar campo" al pie de Examen Físico y de
   Parámetros Metabólicos (`useFieldArray`), con `seccion` fijada por sección, input de nombre +
   valor y botón de eliminar. El botón se deshabilita al llegar a 20. Antes de guardar se
   descartan filas completamente vacías.
5. **Vista de solo lectura** (`ConsultaReadOnly`): los extras se renderizan dentro de la grilla
   de su sección con el mismo componente `Field`. **Guards ampliados**: `hasExamenFisico` y
   `hasMetabolico` ahora también consideran los campos extra (si una consulta tuviera solo
   extras en una sección, igual se dibuja).
6. **PDF** (`ConsultaBody` en `consulta-template.tsx`): mismo render en cada grid, con los
   mismos guards ampliados.

(Las rutas `api/consultas/route.ts` y `[id]/route.ts` no se tocaron: hacen
`insert({...consulta})` / `update(updates)` con el objeto ya validado por Zod, así que
`campos_extra` fluye solo.)

**Verificado:** transpilé y corrí el **schema Zod real** contra 7 payloads — default `[]`,
válido (preserva orden), y rechaza correctamente: nombre vacío, sección inválida, valor >500 y
>20 campos; y trimea el nombre. `tsc` limpio y `next build` OK.

También actualicé `schema.sql` con la columna.

---

## Archivos tocados

**Nuevos:** `src/app/api/consultas/[id]/pdf/route.ts`,
`src/app/api/pacientes/[id]/historia/pdf/route.ts`,
`supabase/migrations/022_consultas_campos_extra.sql`, `MIGRACION-P2.sql`.

**Modificados:** `src/components/pacientes/consultas/pdf-download-button.tsx`,
`src/components/pacientes/consultas/consulta-detail.tsx`,
`src/components/pacientes/consultas/historia-clinica-view.tsx`,
`src/app/(app)/pacientes/[id]/historia/page.tsx`,
`src/lib/pdf/consulta-template.tsx`, `src/types/consulta.ts`,
`src/lib/validations/consulta.schema.ts`, `schema.sql`.

> Lint: mi código nuevo pasa limpio. `consulta-detail.tsx` conserva 3 errores `no-explicit-any`
> y 1 warning `mode` **pre-existentes** (no los introduje ni los toqué); `consulta-template.tsx`
> tiene 2 warnings `alt-text` pre-existentes en las imágenes de `@react-pdf`.

---

## Prueba manual pendiente (en el navegador, logueado)

No pude ejercitar el flujo autenticado desde acá (los endpoints y el guardado requieren sesión).
Te pido confirmar:
- **PDFs (Parte 3):** descargar el PDF de una consulta finalizada y el de la HC completa
  (deberían bajar); y que pedir la HC de un paciente de **otro tenant** (cambiando el id en la
  URL) dé 403/404, no el PDF.
- **Campos dinámicos (Parte 2):** en una consulta nueva, agregar un campo extra en Examen Físico
  y otro en Parámetros Metabólicos, guardar y reabrir → aparecen en su sección; descargar el PDF
  → aparecen en la sección correcta. Una consulta sin campos extra se ve/exporta igual que antes.
- **Orden (Parte 1):** medicación actual aparece entre motivo y anamnesis en el formulario, la
  vista y el PDF.
