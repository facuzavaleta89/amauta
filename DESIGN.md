# DESIGN.md — Sistema de diseño de Amauta

Documenta el sistema de diseño **tal como está implementado hoy** en el código.
La fuente de verdad es [`src/app/globals.css`](./src/app/globals.css) (tokens y
overrides) más los componentes de [`src/components/ui/`](./src/components/ui/).

> El proyecto usa **Tailwind CSS v4** con tokens semánticos definidos vía `@theme`
> en `globals.css` (no hay `tailwind.config.ts`: está vacío a propósito).
> Los colores se expresan en **OKLCH**, no en HEX. Las marcas **⚠ Inconsistente**
> señalan valores a unificar en el bloque estético de `PENDIENTES.md`.

---

## Paleta de colores

Tema clínico de **verdes suaves** (salvia médico, hue ≈ 155 en OKLCH). Todos los
tokens tienen variante clara (`:root`) y oscura (`.dark`). Abajo, los valores del
**tema claro**.

### Superficie y neutros

| Token | OKLCH | Uso |
|---|---|---|
| `--background` | `oklch(0.985 0.005 155)` | Fondo general (blanco levemente verdoso) |
| `--foreground` | `oklch(0.18 0.025 155)` | Texto principal (casi negro verdoso) |
| `--card` / `--popover` | `oklch(1 0 0)` | Superficies elevadas (blanco puro) |
| `--muted` | `oklch(0.96 0.015 155)` | Fondos suaves |
| `--muted-foreground` | `oklch(0.52 0.04 155)` | Texto secundario |
| `--border` | `oklch(0.86 0.025 155)` | Bordes (notorios a propósito) |
| `--input` | `oklch(0.88 0.020 155)` | Bordes de inputs |

### Primarios y de marca

| Token | OKLCH | Uso |
|---|---|---|
| `--primary` | `oklch(0.52 0.13 155)` | Verde salvia — acciones, foco, marca |
| `--primary-foreground` | `oklch(0.99 0.004 155)` | Texto sobre primario |
| `--secondary` / `--accent` | `oklch(0.94 0.05 155)` | Verde muy pálido |
| `--secondary-foreground` / `--accent-foreground` | `oklch(0.35 0.10 155)` | Verde oscuro sobre pálido |
| `--ring` | `oklch(0.52 0.13 155)` | Anillo de foco (= primary) |

### Estado

| Token | OKLCH | Uso |
|---|---|---|
| `--destructive` | `oklch(0.58 0.22 27.3)` | Errores, anulaciones, eliminar (rojo) |
| `--destructive-foreground` | `oklch(0.99 0.004 155)` | Texto sobre destructivo |

> No existen tokens semánticos dedicados para **success / warning / info**. Los
> estados de éxito (verde), advertencia/expirado (ámbar) e info se resuelven hoy
> con clases crudas de Tailwind (`emerald-*`, `amber-*`, `red-*`) — ver
> ⚠ Inconsistencias. Para toasts, Sonner usa `richColors` (paleta propia).

### Charts (gráficos de evolución — Recharts)

`--chart-1` verde `oklch(0.52 0.13 155)` · `--chart-2` teal `oklch(0.65 0.12 190)` ·
`--chart-3` azul `oklch(0.72 0.10 220)` · `--chart-4` amarillo-verde `oklch(0.78 0.12 80)` ·
`--chart-5` naranja `oklch(0.60 0.18 25)`.

### Sidebar

Set propio de tokens (`--sidebar`, `--sidebar-foreground`, `--sidebar-primary`,
`--sidebar-accent`, `--sidebar-border`, `--sidebar-ring`) en tono off-white verdoso
(`oklch(0.97 0.012 155)`).

---

## Tipografía

- **Familia principal:** **Inter** (Google Fonts vía `next/font`, expuesta como
  `--font-inter`). Cargada en `src/app/layout.tsx`. `--font-sans` y `--font-heading`
  apuntan ambas a Inter con fallback `system-ui, sans-serif`.
- **Encabezados:** `h1–h6` → `font-semibold tracking-tight` (regla base en `globals.css`).
- **Números tabulares:** `font-variant-numeric: tabular-nums` en horarios/labels del calendario.
- **Ajustes de fuente:** `font-feature-settings: "cv11", "ss01"` y antialiasing en `body`.
- **Escala de texto:** se usa la escala utilitaria de Tailwind (`text-xs` … `text-sm`
  … `text-lg`, etc.); no hay una escala tipográfica custom definida en tokens.
- ⚠ **Inconsistente:** `--font-mono` se mapea a `--font-geist-mono`, pero esa fuente
  **no se carga** en ningún layout (solo se carga Inter). El texto "mono" cae al
  fallback del sistema. Definir/cargar la fuente mono o eliminar el token.

---

## Espaciado, radios y grilla

- **Radio base:** `--radius: 0.5rem`, con escala derivada:
  `--radius-sm` (0.6×), `--radius-md` (0.8×), `--radius-lg` (1×), `--radius-xl` (1.4×),
  `--radius-2xl` (1.8×), `--radius-3xl` (2.2×), `--radius-4xl` (2.6×).
- **Convención por componente:** botones e inputs → `rounded-lg`; badges → `rounded-4xl`
  (forma de píldora); cards → radio de card de shadcn.
- **Espaciado:** escala utilitaria estándar de Tailwind (`gap-*`, `p-*`, `space-*`).
  No hay sistema de grilla propio; se usa `grid`/`flex` de Tailwind por vista.
- ⚠ **Inconsistente:** conviven radios de token (`rounded-lg`) con radios hardcodeados
  (`rounded-xl`, `rounded-2xl`) en vistas como `/onboarding` y `/verificar`. Unificar
  hacia la escala de tokens.

---

## Componentes de UI reutilizables

En `src/components/ui/` (shadcn/ui sobre Radix). Una línea por componente:

| Componente | Qué hace |
|---|---|
| `button` | Botón con variantes `default/outline/secondary/ghost/destructive/link` y tamaños `xs/sm/default/lg/icon*` |
| `badge` | Etiqueta tipo píldora (`rounded-4xl`) con las mismas variantes de color |
| `card` | Contenedor elevado (header/content/footer) |
| `input` / `textarea` | Campos de formulario (alto `h-8`, `rounded-lg`, foco con ring) |
| `label` | Etiqueta de formulario (Radix Label) |
| `form` | Wrappers de React Hook Form (Field, Item, Message…) |
| `select` | Select accesible (Radix Select) |
| `dialog` / `alert-dialog` | Modales y diálogos de confirmación |
| `dropdown-menu` | Menús contextuales |
| `tabs` | Pestañas |
| `table` | Tabla base (se combina con TanStack Table) |
| `avatar` | Avatar de usuario con fallback |
| `switch` | Toggle (usado en permisos de asistentes) |
| `separator` | Divisor |
| `skeleton` | Placeholder de carga |

**Variantes de color compartidas (button y badge):** `default` (primary),
`secondary`, `outline`, `ghost`, `destructive`, `link`. `destructive` usa fondo
tenue (`bg-destructive/10`) con texto destructivo, salvo botones sólidos donde se
fuerza texto blanco (`.bg-destructive { color:#fff }`).

**Componentes compartidos de dominio:** `shared/qr-verificacion.tsx` (Server
Component que genera el QR con `qrcode` y deriva la URL base con `headers()`),
`shared/page-header`, `shared/view-toggle.tsx` (selector **mosaico / lista**, Client
Component controlado; se combina con el hook `use-view-mode` que persiste la
preferencia en `localStorage` — usado en difusión y notas), etc.

**Estudios — patrones visuales (tanda de Storage):** el listado de estudios
(`pacientes/estudios-list.tsx`) usa **íconos por tipo de archivo** de `lucide-react`
(`ImageIcon` para imágenes, `FileText` para PDF/otros) sobre un chip redondeado
`bg-primary/10 text-primary`, y dos acciones `ghost`/`icon` por fila (**Ver** con `Eye`,
**Descargar** con `Download`) más **Eliminar** (`Trash2` destructivo, solo médico). La
acción **Ver** abre un **modal de previsualización** sobre el `dialog` de shadcn
(`max-w-3xl`): imágenes con `<img>` (`max-h-[70vh] object-contain`), PDFs embebidos en
`<iframe>` (`h-[70vh]`) con salidas de respaldo ("Abrir en pestaña nueva" / "Descargar")
para el caso móvil, donde el `<iframe>` de PDF es poco fiable. Es la primera previsualización
embebida de archivos del proyecto (el stub `shared/file-preview` sigue sin usarse).

**Documentos (pedidos/certificados) — patrones visuales (tanda de persistencia de PDFs):**
en el preview del documento (`pedido-pdf.tsx` / `certificado-pdf.tsx`) se usan **banners de
estado a lo ancho** en el borde superior de la card, todos con el mismo layout (`px-8 py-3`,
centrado, `flex items-center justify-center gap-2` + ícono `lucide` a la izquierda):
el de **anulado** en tono destructivo (`bg-red-50 dark:bg-red-950/20` + `Ban`, preexistente) y
el nuevo de **"sin datos del emisor"** en tono de **advertencia ámbar** (`bg-amber-50
dark:bg-amber-950/20`, texto `amber-800/200`, ícono `AlertCircle`) — se muestra solo cuando el
documento no tiene `emisor_snapshot` (un bug: nunca cae a `profiles`). Además, la acción
**Descargar PDF** de un documento **revocado** se envuelve en un `alert-dialog` de confirmación
(el resto de las descargas es directo); el PDF servido es el original, sin marca de anulación.
⚠ Estos ámbar/rojo son clases crudas de Tailwind, no tokens semánticos — mismo pendiente de
`success/warning/info` señalado en Inconsistencias.

> ⚠ Hay **12 archivos stub** (`export default function Placeholder(){return null}`)
> en `components/` y `lib/pdf/` (p. ej. `turnero/turno-card`, `pacientes/evolucion-charts`,
> `shared/{confirm-dialog, file-preview}`, `difusion/{post-editor, send-modal}`)
> que **no se usan**. Son código muerto a eliminar (ver `PENDIENTES.md`).
> (`difusion/post-list.tsx` y `pacientes/estudios-upload.tsx` ya **no** son stubs: se
> implementaron; el segundo en la tanda de Storage.)

---

## Colores de las categorías del turnero

Definidos en `globals.css` como clases `.categoria-*` (barra de acento + tinte de
fondo + color de texto), consistentes entre vistas TimeGrid y DayGrid de FullCalendar:

| Categoría | Color | Acento (OKLCH) |
|---|---|---|
| `turno_medico` | Verde | `oklch(0.52 0.16 155)` |
| `curso` | Azul | `oklch(0.56 0.18 220)` |
| `personal` | Morado | `oklch(0.54 0.20 285)` |
| `administrativo` | Marrón | `oklch(0.55 0.12 55)` |
| `recordatorio` | Amarillo | `oklch(0.72 0.18 80)` |

Además, los **bloqueos de agenda** se pintan en rojo coral con patrón rayado
(`.fc-event-bloqueo`), y los eventos **pendientes de confirmar** usan borde punteado
y opacidad reducida (`.fc-event-pendiente-confirmar`). El modo de selección del
calendario tiñe el highlight según la acción (`.mode-turno` verde / `.mode-bloqueo` rojo).

> ⚠ **Inconsistente:** `turnos.color` tiene default `#3B82F6` (azul HEX) en la base,
> pero el color visual real lo determinan las clases `.categoria-*`. El campo `color`
> HEX queda en desuso frente al sistema de categorías.

---

## Convenciones visuales

- **Bordes:** `1px` con `--border` (elegido más notorio de lo habitual para dar
  contraste clínico). La regla base aplica `border-border` y `outline-ring/50` a todo.
- **Sombras:** uso mínimo; las cards resaltan por contraste de superficie (`--card`
  blanco puro sobre `--background` verdoso) más que por sombra. La página `/verificar`
  usa `shadow-xl` puntual.
- **Radios:** ver sección de radios (base `0.5rem`).
- **Foco:** anillo visible `ring-3` (o `ring-[3px]`) con `--ring`/`--primary`; estados
  inválidos usan `aria-invalid` + ring destructivo.
- **Estados hover/active/disabled:** botones oscurecen el fondo en hover, bajan 1px en
  active (`active:translate-y-px`) y `disabled:opacity-50 pointer-events-none`.
- **Animación:** utilidad `.animate-fade-in` (fade + leve `translateY`), 0.2s ease-out;
  `tw-animate-css` disponible para animaciones de entrada/salida.
- **Dark mode:** hay un set completo de tokens `.dark` ("mínimo, por si se necesita a
  futuro"), pero la app **no expone un toggle** de tema hoy.

---

## Accesibilidad

- **Idioma:** `<html lang="es">`.
- **Foco visible:** anillos de foco (`focus-visible:ring-*`) en botones, inputs y badges.
- **Semántica de estado:** atributos `aria-invalid` / `aria-expanded` en componentes de
  formulario y menús (heredado de shadcn/Radix, que aporta roles y navegación por teclado).
- **Antialiasing** y `font-feature-settings` para legibilidad del texto.
- **Contraste:** paleta pensada para contraste (foreground casi negro sobre fondos claros).
  ⚠ **Verificar** el contraste de los tintes de categoría al 10–12% de opacidad y de los
  textos `muted-foreground` sobre `muted`, especialmente en la página pública.

---

## ⚠ Inconsistencias a unificar (para el bloque estético)

1. **Colores fuera del sistema de tokens:** `/verificar/[codigo]` y otras vistas usan
   clases crudas `slate-*`, `emerald-*`, `red-*`, `amber-*` en lugar de los tokens
   semánticos. Faltan tokens `success` / `warning` / `info`.
2. **Radios hardcodeados** (`rounded-xl`, `rounded-2xl`) conviviendo con la escala de
   tokens en `/onboarding` y `/verificar`.
3. **Fuente mono** (`--font-geist-mono`) referenciada pero no cargada.
4. **`turnos.color` (HEX `#3B82F6`)** en desuso frente a las clases `.categoria-*`.
5. **12 componentes stub** sin usar (código muerto que ensucia la carpeta de UI).
6. **Dark mode a medias:** tokens definidos sin toggle en la UI.
