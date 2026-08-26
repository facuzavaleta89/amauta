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

Tema clínico de **verdes suaves** (salvia médico, hue ≈ 155 en OKLCH). Los tokens se
definen una sola vez, en `:root`: **el tema oscuro fue descartado como decisión de
producto** y no hay bloque alternativo (ver *Tema oscuro* más abajo).

**Todos los valores están dentro del gamut sRGB a propósito.** Un OKLCH con más croma del
que sRGB puede representar lo mapea el navegador, así que el color que renderiza deja de
ser el escrito y cualquier cálculo de contraste sobre el valor nominal miente. Al meterlos
en gamut, el hex que emite Tailwind coincide exactamente con el valor declarado.

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

### Estado — las cuatro familias semánticas

Cada familia tiene **tres** tokens, y la convención de uso es lo más importante de esta
sección:

| Token | Para qué | Ejemplo de clase |
|---|---|---|
| **base** (`--destructive`) | **rellenos, bordes, anillos e íconos** | `bg-destructive`, `border-warning/30`, un `<Icon>` en `text-info` |
| **`-strong`** (`--destructive-strong`) | **todo texto que el usuario lee** | `text-destructive-strong` |
| **`-foreground`** (`--destructive-foreground`) | texto **sobre el relleno sólido** | `bg-destructive text-destructive-foreground` |

| Familia | base | `-strong` | `-foreground` |
|---|---|---|---|
| `destructive` | `oklch(0.58 0.22 27.3)` | `oklch(0.46 0.175 27.3)` | `oklch(0.99 0.004 155)` |
| `warning` | `oklch(0.62 0.134 70)` | `oklch(0.46 0.095 70)` | `oklch(0.20 0.04 70)` ⚠ |
| `info` | `oklch(0.54 0.123 240)` | `oklch(0.46 0.10 240)` | `oklch(0.99 0.004 155)` |
| `success` | `var(--primary)` | `oklch(0.46 0.11 155)` | `var(--primary-foreground)` |

**Por qué el par base / `-strong`.** Reemplaza al par de tonos que traía la paleta cruda de
Tailwind, donde el 600 servía de relleno y el 700/800/900 de texto. Al migrar a tokens los
dos se colapsaron en uno solo, y un color no puede ser vivo como relleno **y** legible como
texto sobre fondo claro a la vez: el cuerpo de los banners cayó de ~7:1 a 3.75:1. El
`-strong` devuelve ese segundo valor, con nombre y con regla de uso.

**Los fondos tenues NO tienen token propio.** Se derivan del base con opacidad:
`bg-warning/10` + `text-warning-strong` + `border-warning/20` es el chip canónico. No
agregar `--warning-bg` ni parientes.

> **`success` es un ALIAS de `--primary`, no un verde propio.** La decisión de producto es
> que **el sistema tiene un solo verde**: un badge de "Enviado" y un botón primario
> comparten color, y se acepta. Está escrito como `var(--primary)` y no como una copia del
> valor **a propósito**: si el salvia se retoca, el success lo sigue solo; una copia podría
> quedar en un verde *casi* igual, que es justamente el segundo verde que esto elimina — y
> esa divergencia no se ve hasta que alguien fotografía los dos juntos. ⚠ Lo que el alias
> no cubre: si `--primary` dejara de ser verde, `success` deja de ser verde con él. Ese día
> hay que **re-decidir**, no dejarlo correr.

> ⚠ **`--warning-foreground` es OSCURO, y es la ÚNICA excepción del sistema** (el resto de
> los `-foreground` son casi blancos). No es un descuido y no hay que "emparejarlo": el
> ámbar es un color claro y el blanco encima da 2.6:1; con el foreground oscuro llega a
> 4.9:1. El criterio es el contraste, no la simetría de la tabla — si algún día se aclara
> un relleno, hay que **re-medir** ese par, no copiar el `-foreground` del vecino.

Para toasts, Sonner usa `richColors` (paleta propia).

### Charts (gráficos de evolución — Recharts)

`--chart-1` verde `oklch(0.52 0.128 155)` · `--chart-2` teal `oklch(0.65 0.112 190)` ·
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
- **Monoespaciada:** `--font-mono` es una **pila del sistema** (`ui-monospace`,
  `SFMono-Regular`, `Menlo`, `Consolas`, …). No se carga ninguna fuente por red: para los
  ~19 usos que tiene (DNI, N° de afiliado, matrícula, códigos de verificación) no vale el
  request. Antes apuntaba a una variable inexistente, así que la declaración se descartaba
  en silencio y `font-mono` renderizaba en Inter.

---

## Espaciado, radios y grilla

- **Radio base:** `--radius: 0.5rem`, con escala derivada:
  `--radius-sm` (0.6×), `--radius-md` (0.8×), `--radius-lg` (1×), `--radius-xl` (1.4×),
  `--radius-2xl` (1.8×), `--radius-3xl` (2.2×), `--radius-4xl` (2.6×).
- **Convención por componente:** botones e inputs → `rounded-lg`; badges → `rounded-4xl`
  (forma de píldora); cards → radio de card de shadcn.
- **Espaciado:** escala utilitaria estándar de Tailwind (`gap-*`, `p-*`, `space-*`).
  No hay sistema de grilla propio; se usa `grid`/`flex` de Tailwind por vista.
- ⚠ **`rounded-xl` y `rounded-2xl` SÍ son de la escala del proyecto**, no valores
  hardcodeados: `@theme inline` redefine `--radius-xl` y `--radius-2xl` sobre `--radius`.
  Lo que sí quedaba fuera era `rounded` a secas (el default de Tailwind, 0.25rem), y ya
  se llevó a la escala. `rounded-full` es una utilidad fija legítima.

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

**Acción destructiva dentro de una fila de acciones (patrón nuevo):** cuando una acción
destructiva convive con la acción **primaria** de un formulario, va como botón `ghost` en
tono destructivo (`text-destructive hover:text-destructive hover:bg-destructive/10`) y
**empujada a la derecha con `ml-auto`**, para estar disponible sin competir visualmente con
la primaria. Ejemplo vivo: **"Descartar"** junto a "Finalizar consulta" en
`pacientes/consultas/consulta-detail.tsx`. La confirmación reusa el molde destructivo ya
establecido por `pacientes/paciente-acciones.tsx` (título `text-destructive` con
`AlertTriangle`, `AlertDialogAction` en `bg-destructive hover:bg-destructive/90`, y la frase
"Esta acción no se puede deshacer") — ver `consultas/descartar-dialog.tsx`. Se distingue del
caso de `paciente-acciones.tsx`, donde las destructivas viven **solas** en la cabecera de la
ficha y por eso pueden usar `icon`/`ghost` sin desambiguar.

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
el de **anulado** en tono destructivo (`bg-destructive/10` + `text-destructive-strong` +
`Ban`, preexistente) y el de **"sin datos del emisor"** en tono de **advertencia ámbar**
(`bg-warning/10` + `text-warning-strong`, ícono `AlertCircle`) — se muestra solo cuando el
documento no tiene `emisor_snapshot` (un bug: nunca cae a `profiles`). Además, la acción
**Descargar PDF** de un documento **revocado** se envuelve en un `alert-dialog` de confirmación
(el resto de las descargas es directo); el PDF servido es el original, sin marca de anulación.
⚠ **La hoja del documento tiene fondo blanco fijo (`bg-white`) y su interior sí usa tokens.**
Es deliberado: representa papel impreso y debe coincidir con el PDF que se descarga. Como el
proyecto no tiene tema oscuro, no hay contradicción — pero si alguna vez se implementara, ese
interior quedaría ilegible sobre el papel blanco y habría que resolverlo primero.

> ✅ Los **11 componentes stub** que no se usaban (`turnero/turno-card`,
> `pacientes/{patient-tabs, evolucion-charts}`, `dashboard/weekly-calendar`,
> `shared/{role-guard, loading-spinner, file-preview, confirm-dialog, error-boundary}`,
> `difusion/{post-editor, send-modal}`) se **eliminaron** en la tanda de reproducibilidad,
> junto con 4 hooks stub y el barrel redundante `types/supabase.ts`.
> Queda **1 solo stub**, a propósito: `lib/pdf/receta-template.tsx`, marcador del template
> de recetas (bloqueado por ANMAT, se implementará al certificarse). Ver `PENDIENTES.md`.

---

## Colores de las categorías del turnero

Definidos en `globals.css` como clases `.categoria-*` (barra de acento + tinte de
fondo + color de texto), consistentes entre vistas TimeGrid y DayGrid de FullCalendar:

| Categoría | Color | Acento (OKLCH) |
|---|---|---|
| `turno_medico` | Verde | `oklch(0.52 0.128 155)` |
| `curso` | Azul | `oklch(0.56 0.101 220)` |
| `personal` | Morado | `oklch(0.54 0.20 285)` |
| `administrativo` | Marrón | `oklch(0.55 0.12 55)` |
| `recordatorio` | Ámbar | `oklch(0.72 0.149 80)` |

> Los valores salen de las variables de categoría de `globals.css`, que son la **fuente
> única**: cada una se referencia entre 4 y 6 veces desde las clases de categoría. Si se
> agrega una categoría, va ahí primero.

### ⚠⚠ El ícono de categoría NO es decorativo — no lo saques

**La conformidad de contraste de `recordatorio` depende de que ese ícono siga estando.**
Quien lo elimine por criterio visual convierte una excepción tolerada en un **fallo real**,
y **sin ningún error visible en ninguna parte**.

Medición del **2026-08-25** con instrumento validado: **13 pares medidos, 12 conformes**.
El único que no lo es:

| Par medido | Ratio | Umbral | Estado |
|---|---|---|---|
| Barra de acento y punto de `recordatorio`, contra su propio tinte de fondo | **2.23 – 2.27** | 3:1 | ✗ No conforme |

Falla porque **ese ámbar es el color más claro de las cinco categorías** — no por un error
de la paleta.

**Decisión tomada: el color NO se cambia.** El criterio de contraste de **elementos no
textuales** no exige el mínimo cuando la información del componente **está disponible por
otra vía**, y acá lo está: el evento del calendario lleva además **ícono y texto**, que
contrastan **por encima de 7:1**. La categoría **no se comunica solo por ese acento** — se
comunica por tres cosas a la vez, y dos de ellas están muy por encima del umbral.

De ahí la advertencia: **sacar el ícono deja el acento como único portador de la categoría**,
y ese acento mide 2.23. Ver también `CLAUDE.md` → nota técnica 37.

Además, los **bloqueos de agenda** se pintan en rojo coral con patrón rayado
(`.fc-event-bloqueo`), y los eventos **pendientes de confirmar** usan borde punteado
y opacidad reducida (`.fc-event-pendiente-confirmar`). El modo de selección del
calendario tiñe el highlight según la acción (`.mode-turno` verde / `.mode-bloqueo` rojo).

> ✅ **Resuelto (2026-08-25, migración 048).** La tabla `turnos` tenía además una columna
> `color` con un default azul en HEX, que **nadie leía**: el color visual siempre lo
> determinaron las clases de categoría. Se **eliminó la columna** —y el campo del schema de
> validación, del tipo y del formulario— así que ya no hay dos fuentes de color compitiendo.
> El sistema de categorías es la **única**.

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
---

## Layout de página (área autenticada)

**El encabezado de toda página arranca SIEMPRE en la misma coordenada horizontal: el borde
izquierdo del contenedor de contenido.** Es la regla que ordena el resto, y el motivo es
concreto: que el título no salte de posición al navegar de una sección a otra.

| Tipo de página | Contenedor raíz | Ancho |
|---|---|---|
| Índice / listado (dashboard, pacientes, turnero, pedidos, certificados, difusión, notas, mensajes, notificaciones) | `space-y-6` | todo el disponible |
| Detalle, formulario y perfil | `max-w-4xl space-y-6` | acotado, **alineado a la izquierda** |
| Pantalla completa (turnero, historia clínica) | `h-full flex flex-col` | todo el disponible |

⚠ **Los contenedores acotados van SIN `mx-auto`.** Centrarlos reintroduce exactamente el
problema que este criterio vino a resolver: el título se corre hacia el centro en las
páginas angostas y salta al volver a un índice. El `w-full` tampoco hace falta: sin
márgenes automáticos, un bloque ya ocupa el ancho disponible y `max-w-4xl` lo recorta.

**El encabezado sale siempre de `shared/page-header`** (`PageHeader`), cuya API es
`{ title, description?, backHref?, children? }`:

- **`h1` en `text-2xl font-bold text-foreground`** y descripción en
  `text-sm text-muted-foreground mt-1`. Es el único tamaño de título de la app.
- **Ninguna sección lleva ícono decorativo junto al título.** Es decisión de producto, no
  una limitación del componente: `title` es `string` a propósito.
- **`backHref` dibuja el único back-link del sistema**, con `ChevronLeft`, `aria-label`
  "Volver" y foco visible. No hay otro ícono de volver.
- **Las acciones van por `children`**, a la derecha. Los badges de estado que antes iban
  pegados al `h1` (por ejemplo "Archivado" o "Anulado") viajan también por ahí.
- **Espaciado vertical canónico: `space-y-6`** (1.5rem) en toda página; las de pantalla
  completa usan `gap-6`, que es lo mismo en forma flex.

---

## Tema oscuro — descartado

**No existe y no se va a implementar.** Es una decisión de producto cerrada, no un
pendiente: se eliminaron el bloque de tokens alternativo, las clases con prefijo de tema en
los componentes y toda la mención que lo describía como algo a medio hacer.

⚠ La declaración `@custom-variant dark (@media not all)` que quedó en `globals.css` **no es
un residuo**: deja la variante inerte por construcción. Ver `CLAUDE.md` → nota técnica 34,
que explica por qué borrarla hace lo contrario de lo que parece.

---

## Accesibilidad

- **Idioma:** `<html lang="es">`.
- **Foco visible:** anillos de foco (`focus-visible:ring-*`) en botones, inputs y badges.
- **Semántica de estado:** atributos `aria-invalid` / `aria-expanded` en componentes de
  formulario y menús (heredado de shadcn/Radix, que aporta roles y navegación por teclado).
- **Antialiasing** y `font-feature-settings` para legibilidad del texto.
- **Contraste — dos umbrales distintos, y conviene no confundirlos:**
  - **Texto: mínimo 4.5:1** (WCAG AA, texto normal). Es lo que sostiene la variante
    `-strong` de cada familia: sobre el tinte al 10% de su propia familia quedan entre
    5.9:1 y 6.7:1, y sobre `--card` entre 6.7:1 y 7.8:1. Todo lo que el usuario lee está
    por encima del mínimo.
  - **Íconos y objetos gráficos: mínimo 3:1** (WCAG 1.4.11). Es lo que sostiene el token
    **base**: sobre el tinte de su familia dan entre 3.3:1 y 4.5:1 — por debajo de 4.5,
    pero **ese no es su umbral**. Por eso un ícono puede quedarse en el token base y un
    texto no.
  - Los pares `-foreground` sobre relleno sólido están entre 4.7:1 y 5.0:1.
  - ✅ **Ya no queda nada por verificar (medición del 2026-08-25).** Se midieron con instrumento
    validado los pares que faltaban —los tintes de categoría del turnero y el texto secundario
    sobre fondo tenue—: **13 pares, 12 conformes**.
    - **La única no conformidad** es la barra de acento y el punto de la categoría
      `recordatorio` contra su propio tinte (**2.23–2.27** contra un umbral de 3:1). **Se
      acepta y no se cambia el color**, porque la categoría también se comunica por ícono y
      texto, ambos por encima de 7:1. ⚠ **Eso hace que el ícono sea funcional, no decorativo**
      — el detalle y la advertencia están arriba, en *Colores de las categorías del turnero*.
    - ⚠ **Texto secundario sobre fondo tenue: 4.83 contra un umbral de 4.5. Conforme, pero con
      poca holgura.** Si se toca la **paleta neutra**, hay que **volver a medir este par**: son
      0.33 de margen, y un ajuste chico de los neutros puede tumbarlo sin que se note.

---

## Excepciones deliberadas (no son deuda)

Tres cosas que parecen inconsistencias y no lo son. Están acá para que nadie las
"arregle" creyendo que quedaron afuera por olvido.

1. **`/verificar/[codigo]` usa paleta cruda de Tailwind** (`slate-*`, `emerald-*`,
   `amber-*`, `red-*`), no los tokens del proyecto. **Es un sistema visual propio y se
   queda así:** es la única pantalla **pública**, cumple otra función —la lee un paciente
   o un tercero desde el celular, sin sesión y sin contexto de la app—, y funciona. Migrarla
   a tokens la ataría a la identidad de la aplicación sin ganar nada.

2. **Los estados del turno NO se distinguen visualmente en el calendario.** Un turno
   `cancelado` se dibuja igual que uno `confirmado`. Es una decisión, no una omisión: el
   estado se lee abriendo el turno. Lo único que colorea un evento es su **categoría**.

3. **Los bloqueos de horario se renderizan como eventos normales**, no como región de fondo
   (`display: 'background'` de FullCalendar). En ese modo se verían mejor —una franja a
   ancho completo, sin competir por columna con los turnos— pero **dejarían de ser
   arrastrables y de responder al click**, y el click en el calendario es la **única puerta**
   para editar o borrar un bloqueo.

---

## ⚠ Inconsistencias a unificar (para el bloque estético)

Lo que sigue quedó **resuelto** en la tanda de pulido visual; se conserva el registro
porque explica de dónde viene el sistema actual.

1. ~~**Colores fuera del sistema de tokens.**~~ ✅ Migrada toda la app a tokens semánticos
   (`success` / `warning` / `info` existen, con su variante `-strong`). `/verificar` queda
   afuera **a propósito** — ver *Excepciones deliberadas*.
2. ~~**Radios hardcodeados** (`rounded-xl`, `rounded-2xl`).~~ ✅ **El ítem apuntaba al blanco
   equivocado:** esas dos clases **sí** son de la escala del proyecto. Lo que estaba fuera
   era `rounded` a secas, ya corregido.
3. ~~**Fuente mono referenciada pero no cargada.**~~ ✅ **Estaba mal descrito:** el problema
   no era que faltara cargar una fuente, sino que `--font-mono` apuntaba a una variable
   inexistente y la declaración se descartaba en silencio. Resuelto con una pila del sistema.
4. ~~**`turnos.color`.**~~ ✅ **Resuelto (2026-08-25, migración 048):** la columna se
   **eliminó**, junto con el campo del schema de validación, del tipo y del formulario. El
   sistema de categorías quedó como única fuente de color — ver *Colores de las categorías del
   turnero*.
5. ~~**Componentes stub sin usar.**~~ ✅ Resuelto: se eliminaron 11; queda solo
   `lib/pdf/receta-template.tsx`, a propósito (recetas está bloqueado por ANMAT).
6. ~~**Dark mode a medias.**~~ ✅ **Descartado como decisión de producto** — ver *Tema oscuro*.
7. ~~**Layout inconsistente entre secciones.**~~ ✅ Resuelto con el criterio de *Layout de
   página*. ⚠ El diagnóstico original **era incorrecto en dos puntos**: daba por
   "consistentes" a pacientes, pedidos, certificados y notas, que en realidad tenían anchos
   distintos entre sí, y **omitía** todas las páginas de detalle, formulario y perfil, más la
   historia clínica. Hoy **21 de las 22 páginas con UI** usan `PageHeader` y todas
   siguen el mismo patrón de contenedor; la excepción es `/sin-acceso`, una pantalla de estado
   vacío centrada que no lleva encabezado de sección.
