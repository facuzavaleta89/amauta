# RESPUESTA — Fix del filename `certificado_null_….pdf` (helper compartido)

> Cambios de código aplicados. Objetivo: unificar el nombre de archivo de certificados y
> pedidos en un helper compartido, sin el segmento `tipo`, con fecha y sanitizado, de modo
> que cliente y servidor produzcan **exactamente** el mismo nombre.
> Fecha: 2026-07-24 · Rama: `main`.

---

## Paso 0 — Verificación bloqueante (OK)

`src/lib/utils.ts` es **neutro**: importa solo `clsx`, `tailwind-merge`, `date-fns` y
`date-fns/locale`. **No** tiene `'server-only'` ni imports de servidor (`next/headers`,
`next/server`, `@/lib/supabase/server`, `fs`, …). De hecho ya lo importan Client Components
(`certificado-pdf.tsx` importa `formatFecha`/`formatFechaLarga` desde ahí). → `sanitizePdfFilename`
es importable desde cliente. **Seguí con el resto del prompt.**

---

## Archivos tocados

| Archivo | Cambio |
|---|---|
| `src/lib/pdf/filename.ts` | **Creado** — helper compartido `buildDocumentoFilename`. |
| `src/app/api/certificados/[id]/pdf/route.ts` | Import del helper; `nombreArchivo` ahora sale de él (sin `certificado.tipo`); `sanitizePdfFilename` ya no se importa. |
| `src/components/certificados/certificado-pdf.tsx` | Import del helper; `a.download` usa el helper con **los mismos args que el route** (incluida `fecha_certificado`); se quitó el `.replace(/\s+/g,'_')` manual. |
| `src/app/api/pedidos/[id]/pdf/route.ts` | Import del helper; `nombreArchivo` desde el helper; `sanitizePdfFilename` ya no se importa. |
| `src/components/pedidos/pedido-pdf.tsx` | Import del helper; `a.download` usa el helper con los mismos args que el route; se quitó el `.replace(/\s+/g,'_')` manual. |

**Paso 4 (Content-Disposition):** ambos routes ya armaban el header con la variable
`nombreArchivo` (`attachment; filename="${nombreArchivo}"`). Como esa variable ahora sale del
helper y el cliente llama al helper con los mismos argumentos, el header y el `a.download`
producen el **mismo string**. No hizo falta tocar la línea del header.

---

## Contenido final del helper — `src/lib/pdf/filename.ts`

```ts
// ============================================================================
// filename.ts — Nombre de archivo de los documentos descargables (cliente + servidor).
// ----------------------------------------------------------------------------
// Módulo NEUTRO (sin 'server-only' ni deps de servidor): lo importan tanto los
// Route Handlers como los Client Components, para que el nombre del PDF sea EXACTAMENTE
// el mismo se descargue desde el botón (a.download) o abriendo la URL del endpoint
// (Content-Disposition). Evita la divergencia que existía antes (el cliente omitía la
// fecha y no sanitizaba).
// ============================================================================

import { sanitizePdfFilename } from '@/lib/utils'

/** Documentos con nombre de archivo unificado. NO incluye el "tipo de certificado". */
export type DocumentoDescargable = 'certificado' | 'pedido'

/**
 * Construye el nombre de archivo de un documento descargable: `<tipo>_<paciente>_<fecha>.pdf`.
 *
 * - NO interpola el "tipo de certificado" (era nullable → producía `certificado_null_…`).
 * - Todo el string pasa por `sanitizePdfFilename` (tildes, caracteres inseguros, espacios).
 * - Si `fecha` falta (null/undefined/vacía), se omite ese segmento en vez de escribir
 *   "null"/"undefined".
 */
export function buildDocumentoFilename(
  tipo: DocumentoDescargable,
  pacienteNombre: string,
  fecha?: string | null,
): string {
  const segmentos = [tipo, pacienteNombre, fecha].filter(
    (s): s is string => typeof s === 'string' && s.trim().length > 0,
  )
  return sanitizePdfFilename(`${segmentos.join('_')}.pdf`)
}
```

Decisiones:
- **Sin segmento `tipo` de certificado** (era el origen del `null`).
- **Sanitización única** vía `sanitizePdfFilename` (no cambié su firma): el nombre del paciente
  queda igual en cliente y servidor (tildes fuera, caracteres inseguros → `_`, espacios → `_`).
- **Fecha ausente:** el `.filter(... trim().length > 0)` la omite, así nunca aparece `"null"` ni
  `"undefined"` (ej.: `certificado_Juan_Perez.pdf` en vez de `certificado_Juan_Perez_null.pdf`).
- Tipo local `DocumentoDescargable = 'certificado' | 'pedido'` (no reutilicé `DocumentoTipo` de
  `storage.ts`, que además trae `'receta'`, fuera de alcance acá).

---

## Ejemplo de nombre resultante — antes / después

Paciente `Juan Pérez`, fecha `2026-07-24` (verificado ejecutando la lógica del helper):

### Certificado
- **Antes — cliente (`a.download`):** `certificado_null_Juan_Pérez.pdf`  ← `null` + tilde + **sin fecha**
- **Antes — servidor (`Content-Disposition`):** `certificado_null_Juan_Perez_2026-07-24.pdf`  ← `null` (nombres distintos)
- **Después — cliente y servidor (idéntico):** **`certificado_Juan_Perez_2026-07-24.pdf`**

### Pedido
- **Antes — cliente:** `pedido_Juan_Pérez_2026-07-24.pdf`  ← tilde cruda (sub-sanitizado)
- **Antes — servidor:** `pedido_Juan_Perez_2026-07-24.pdf`
- **Después — cliente y servidor (idéntico):** **`pedido_Juan_Perez_2026-07-24.pdf`**

(El pedido nunca tuvo el `null`; el fix le unifica la sanitización cliente↔servidor.)

---

## Resultado de type-check y lint

### `npx tsc --noEmit` → **EXIT 0** (limpio)

### `npm run lint` → EXIT 1 — **todos los problemas son PREEXISTENTES**, ninguno introducido por este cambio
- **`src/lib/pdf/filename.ts` (nuevo): 0 problemas.**
- **Los dos routes** (`certificados/[id]/pdf`, `pedidos/[id]/pdf`): **0 problemas** (no aparecen en
  el reporte de lint).
- **`certificado-pdf.tsx` y `pedido-pdf.tsx`:** solo warnings/errores **preexistentes** (imports sin
  usar como `formatFecha`/`Badge`/`AlertCircle`, `<img>` vs `next/image`, un `any` en `pedido-pdf.tsx:50`).
  El `git diff` confirma que mis ediciones fueron **exactamente 2 líneas por componente** (agregar
  el import del helper + reemplazar el `a.download`); no tocan ninguna de esas líneas ni sus usos.
  Ej.: el warning `'formatFecha' is defined but never used` ya existía (ese import lo dejé intacto;
  `formatFecha` sin `Larga` no se usaba desde antes).

Los 66 errores / 30 warnings de lint son **deuda preexistente del proyecto** (ya anotada en
`PENDIENTES.md` → "Lint preexistente"; `no-explicit-any`, `alt-text`, `no-img-element`, imports sin
uso, etc.), en archivos que no toqué o en líneas que no toqué. No agregué ninguno.

---

## Restricciones respetadas
- Solo cambié la **construcción del nombre**; no toqué la generación del PDF, ni las queries, ni la
  firma de `sanitizePdfFilename`, ni agregué dependencias.
