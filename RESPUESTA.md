# RESPUESTA — Selector de vista mosaico / lista (Difusión y Notas)

Se agregó un selector para alternar entre **vista mosaico** (grilla de cards, la de antes) y
**vista lista** (filas compactas) en las secciones **Difusión** y **Notas**, con la preferencia
persistida en `localStorage` de forma **independiente por sección**.

## Componentes nuevos

### `src/hooks/use-view-mode.ts` — hook de preferencia
`useViewMode(storageKey, defaultMode = 'grid')` → `[mode, setMode]`. Encapsula la lectura y
escritura de la preferencia en `localStorage`.
- Implementado con **`useSyncExternalStore`**: en el servidor y durante la hidratación devuelve
  el default vía `getServerSnapshot` (`'grid'`), y recién en el cliente lee el valor guardado.
  React garantiza que **no haya hydration mismatch** y nunca se lee `localStorage` durante el
  render. (Se descartó el patrón `useState` + `useEffect` porque, además del riesgo de
  mismatch, disparaba el lint `react-hooks/set-state-in-effect` del proyecto.)
- Sincroniza entre pestañas (evento `storage`) y notifica manualmente al escribir (localStorage
  no emite `storage` en la pestaña que guarda).

### `src/components/shared/view-toggle.tsx` — selector compartido
`<ViewToggle mode onChange className? />`. Dos botones con íconos `LayoutGrid` / `List`
(lucide). Controlado (no persiste por sí mismo; eso lo hace `useViewMode`). Accesible:
`role="group"` + `aria-label`, cada botón con `aria-label` y `aria-pressed`, foco visible con
anillo `ring-ring/50`. Estilado con tokens de DESIGN.md (`border-border`, `bg-card`,
`bg-primary`/`text-primary-foreground` para el activo, `muted`/`muted-foreground` para el resto,
`rounded-lg`/`rounded-md`).

## Claves de `localStorage`
- Difusión: `amauta:view:difusion`
- Notas: `amauta:view:notas`

Distintas a propósito: el usuario puede tener difusión en lista y notas en mosaico de forma
independiente.

## Archivos tocados

### `src/components/difusion/post-list.tsx` *(era un stub vacío — ahora implementado)*
Client Component que recibe los `posts` por props y renderiza el toggle + la grilla (mosaico) o
las filas (lista). Se movieron acá los helpers `EstadoBadge` y `CanalIcon` que antes estaban
inline en la página. La vista mosaico es idéntica a la anterior; la vista lista es un contenedor
`divide-y` con una fila por comunicado (ícono de canal + título + extracto en una línea a la
izquierda; badge de estado + fecha a la derecha), reutilizando el mismo `<Link>` a
`/difusion/[id]`. También maneja el estado vacío (sin resultados). Así se limpió uno de los 14
componentes muertos del proyecto.

### `src/app/(app)/difusion/page.tsx` *(Server Component — sin cambios de datos)*
Sigue haciendo el fetch y los **filtros server-side** (`?q=`, `?estado=`) igual que antes; solo
delega el renderizado de las tarjetas a `<PostList posts={posts ?? []} />`. Se quitaron los
helpers y los imports que ya no usa (Card, format/es, íconos e types que se fueron a `post-list`).

### `src/components/notas/notas-list.tsx` *(ya era Client Component)*
Se agregó `useViewMode('amauta:view:notas')` y el `<ViewToggle>` en la barra de herramientas
(visible solo si hay al menos una nota). Se añadió la rama de **vista lista**: contenedor
`divide-y` con una fila por nota (título + extracto en una línea a la izquierda, fecha a la
derecha), reutilizando el mismo `<button>` que abre el modal `NotaForm`. La lógica de
crear/editar/eliminar y los filtros por `useState` no cambiaron.

## Vista lista — diseño
Fila compacta por ítem con `divide-y divide-border` dentro de un contenedor
`rounded-lg border border-border bg-card`, hover `bg-muted/50`, título con `truncate` y extracto
de **una línea**. Metadatos (fecha, y estado en difusión) alineados a la derecha. Todo con
tokens de DESIGN.md.

## Verificación
- **`next build`**: exit 0, todas las rutas compilan (incluidas `/difusion` y `/notas`). Esto
  valida los límites Server/Client Component de verdad (la página server importa el
  `PostList` cliente; los hooks/toggle cliente solo los consumen componentes cliente).
- **`tsc --noEmit`**: sin errores en `src/`.
- **ESLint** sobre los 5 archivos: sin errores ni warnings (incluido el chequeo de
  `set-state-in-effect`, que motivó usar `useSyncExternalStore`).
- Hydration mismatch: prevenido por diseño de `useSyncExternalStore` (server render y primera
  hidratación usan el default; el valor guardado se aplica después, sin discordancia de HTML).
- Filtros server-side de difusión (`?q=`, `?estado=`): intactos, siguen en el Server Component.
- Modal de crear/editar notas: intacto en ambas vistas (mismo `<button>` con `onClick`).

**No se tocó base de datos ni tipos** (`src/types/` sin cambios; el shape de los posts se tipa
localmente en `post-list.tsx` a partir de los tipos ya existentes en `difusion.schema.ts`).
