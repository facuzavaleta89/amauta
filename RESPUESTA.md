# P5 — Archivar pacientes + solo-anular documentos (IMPLEMENTADO)

> **Estado: completo.** `npx tsc --noEmit` y `npx next build` limpios (exit 0).
> Marco legal: Ley 26.529 (la documentación clínica se conserva). Los pacientes se
> **archivan** (borrado físico solo como excepción sin actuaciones); los documentos
> se **anulan**, nunca se borran.
> El diagnóstico original quedó abajo, después de este resumen.

## P5-fix — Dos bugs corregidos tras probar (no toca base de datos)

Ambos por el mismo concepto: la unidad de actuación clínica es la **CONSULTA**, no la
fila de `historia_clinica` (que se crea vacía junto con el paciente). `tsc` + `build` ✅.

**Bug 1 — Paciente nuevo sin actuaciones no se podía borrar (409 falso).**
- Causa confirmada: `src/app/api/pacientes/route.ts:130` inserta una `historia_clinica`
  vacía al crear el paciente, y el conteo de la Parte 4 incluía `historia_clinica` →
  siempre ≥1 fila → 409.
- Fix: en `src/app/api/pacientes/[id]/route.ts` **saqué `historia_clinica` del conteo**
  de tablas que bloquean el borrado. Ahora bloquean solo actuaciones reales: `consultas`,
  `estudios`, `evoluciones`, `turnos`, `pedidos`, `certificados`, `recetas` (siguen con
  **admin client / bypass RLS**). La HC vacía la limpia el FK CASCADE en el DELETE físico.

**Bug 2 — A un paciente archivado se le podían crear consultas.**
- Decisión: archivado = HC de **solo lectura** (ver historia y consultas pasadas), pero
  **sin crear consultas nuevas**.
- Guard de UI: la página de HC ahora carga `archivado_at` y lo propaga
  (`historia/page.tsx` → `HistoriaClinicaView` → `ConsultaTimeline`). Si está archivado,
  el botón **"Nueva consulta" queda deshabilitado** con nota/tooltip ("Desarchivalo para
  registrar nuevas consultas"), y `handleNew` no abre el panel. La lectura queda intacta.
- Guard de servidor: `POST /api/consultas` **rechaza con 409** si el paciente está
  archivado (lee `archivado_at` con **admin client**, acotado al tenant, porque quien crea
  consultas puede no tener `ver_pacientes` y un select por RLS daría un 404 falso).
- Archivos: `src/app/api/pacientes/[id]/route.ts`, `src/app/api/consultas/route.ts`,
  `src/app/(app)/pacientes/[id]/historia/page.tsx`,
  `src/components/pacientes/consultas/historia-clinica-view.tsx`,
  `src/components/pacientes/consultas/consulta-timeline.tsx`.

---

## Parte 1 — Base de datos (columna `archivado_at`) ✅ ejecutada por el usuario
- `supabase/migrations/024_pacientes_archivado.sql` — migración versionada.
- `MIGRACION-P5.sql` (raíz) — mismo SQL, para el SQL Editor.
- `schema.sql` — actualizado: columna `archivado_at TIMESTAMPTZ` + índice parcial
  `idx_pacientes_activos ON pacientes(creado_por) WHERE archivado_at IS NULL`.
- No toca RLS (la política `pacientes_update` cubre el UPDATE; el control "solo médico"
  se hace en el endpoint).

## Parte 2 — Archivar / desarchivar (exclusivo del médico)
- **Tipos:** `src/types/paciente.ts` → `archivado_at: string | null` en `Paciente`
  (heredado por `PacienteWithObraSocial`).
- **Endpoint nuevo:** `src/app/api/pacientes/[id]/archivar/route.ts` (POST, body `{ archivar: boolean }`).
  Valida **explícitamente `role === 'medico'`** en el servidor (no solo RLS) → si no,
  403; setea `archivado_at = now()` / `null`. Evita el falso `success:true` que tenía
  el DELETE viejo para asistentes.
- **UI nueva:** `src/components/pacientes/paciente-acciones.tsx` (reemplaza a
  `delete-patient-button.tsx`, **eliminado**). Botón Archivar/Desarchivar + diálogo que
  aclara que **archivar no borra datos**. Se renderiza **solo si `esMedico`**.
- **Ficha** (`src/app/(app)/pacientes/[id]/page.tsx`): ahora carga el `role`, calcula
  `archivado`, muestra **badge "Archivado"** + banner explicativo, **deshabilita**
  Editar / Nuevo Pedido / Nuevo Certificado cuando está archivado, e **ignora `?edit=true`**
  para pacientes archivados. Las acciones destructivas solo se muestran al médico.

## Parte 3 — Filtrar archivados de los listados
- `src/app/(app)/pacientes/page.tsx` → `.is('archivado_at', null)` salvo con `?archivados=true`.
- `src/app/api/pacientes/route.ts` (GET buscador de pickers) → `.is('archivado_at', null)`.
- `src/components/dashboard/recent-patients.tsx` → `.is('archivado_at', null)`.
- `src/components/dashboard/stats-cards.tsx` → conteo con `.is('archivado_at', null)`.
- `src/components/pacientes/patient-filters.tsx` → toggle **"Mostrar/Ocultar archivados"**
  (setea `archivados=true`; incluido en "Limpiar").
- `src/components/pacientes/patient-table.tsx` → badge "Archivado" en filas (móvil + desktop).
- **No** se filtró la ficha individual ni `api/pacientes/[id]/*` (deben verse archivados).

## Parte 4 — Borrado físico de EXCEPCIÓN (`DELETE /api/pacientes/[id]`)
- `src/app/api/pacientes/[id]/route.ts` reescrito:
  - Valida **`role === 'medico'`** explícitamente.
  - Cuenta con **admin client (bypass RLS)** las 8 tablas hijas (`consultas`,
    `historia_clinica`, `estudios`, `evoluciones`, `turnos`, `pedidos`, `certificados`,
    `recetas`) con `head:true`. Si **cualquiera > 0 → 409** "archivalo en lugar de eliminarlo".
    Crítico para las tablas CASCADE, que a nivel FK no bloquean.
  - **Limpieza defensiva de Storage**: borra `estudios/{paciente_id}/…` para no dejar huérfanos.
  - Recién entonces hace el DELETE físico.
- UI: el botón **"Eliminar definitivamente"** vive en `paciente-acciones.tsx` (solo médico),
  con diálogo que explica la condición; el 409 se muestra tal cual como toast.

## Parte 5 — Quitar borrado físico de pedidos y certificados (solo anular)
- **Endpoints:** removidos los handlers `DELETE` de `src/app/api/pedidos/[id]/route.ts` y
  `src/app/api/certificados/[id]/route.ts` (reemplazados por comentario). GET/PATCH/anular intactos.
- **UI:** quitado el botón papelera + diálogo + `isDeleting` + función `eliminar*` + import
  `Trash2` en `src/components/pedidos/pedido-pdf.tsx` y `src/components/certificados/certificado-pdf.tsx`.
  El botón **"Anular"** queda igual.
- **RLS `pedidos_delete` / `certificados_delete`: NO tocadas** (pendiente de refuerzo futuro, como pediste).

### Verificación
- `tsc --noEmit` ✅ · `next build` ✅ (exit 0).
- Nota: los flujos que tocan la base (409 con actuaciones, borrado sin actuaciones,
  archivar sacando de listados) requieren la app corriendo contra Supabase para probarse
  end-to-end; no ejecuté nada en Supabase. La lógica quedó cubierta por typecheck/build y
  revisión. Recomiendo un smoke test manual del médico tras deploy.

### Archivos tocados
- Nuevos: `supabase/migrations/024_pacientes_archivado.sql`, `MIGRACION-P5.sql`,
  `src/app/api/pacientes/[id]/archivar/route.ts`, `src/components/pacientes/paciente-acciones.tsx`.
- Modificados: `schema.sql`, `src/types/paciente.ts`, `src/app/(app)/pacientes/[id]/page.tsx`,
  `src/app/(app)/pacientes/page.tsx`, `src/app/api/pacientes/[id]/route.ts`,
  `src/app/api/pacientes/route.ts`, `src/components/pacientes/patient-filters.tsx`,
  `src/components/pacientes/patient-table.tsx`, `src/components/dashboard/recent-patients.tsx`,
  `src/components/dashboard/stats-cards.tsx`, `src/app/api/pedidos/[id]/route.ts`,
  `src/app/api/certificados/[id]/route.ts`, `src/components/pedidos/pedido-pdf.tsx`,
  `src/components/certificados/certificado-pdf.tsx`.
- Eliminado: `src/components/pacientes/delete-patient-button.tsx`.

---

# Diagnóstico P5 — Borrado de pacientes y documentos (estado ANTERIOR, pre-implementación)

> **Alcance:** solo lectura / diagnóstico. No se modificó código, esquema ni Supabase.
> Todo lo verificado contra las migraciones reales en `supabase/migrations/`, no solo `schema.sql`.
> Fecha: 2026-07-21.

---

## 1. Borrado de pacientes hoy

### 1.1 Flujo completo (UI → base)

| Capa | Ubicación | Qué hace |
|---|---|---|
| Botón UI | `src/components/pacientes/delete-patient-button.tsx` | Botón rojo "Eliminar" con `<Dialog>` de confirmación. En `handleDelete` hace `fetch('/api/pacientes/{id}', { method: 'DELETE' })`. Al terminar: `router.push('/pacientes')` + `refresh`. |
| Render del botón | `src/app/(app)/pacientes/[id]/page.tsx:106` | `<DeletePatientButton ... />` se renderiza **sin ningún guard de rol/permiso** en el header de la ficha del paciente. |
| Endpoint | `src/app/api/pacientes/[id]/route.ts:137` (`DELETE`) | Valida UUID → `getUser()` → rate limit (10/min) → `getTenantMedicoId()` → verifica pertenencia (`creado_por = tenantMedicoId`) → `supabase.from('pacientes').delete().eq('id', id).eq('creado_por', tenantMedicoId)`. |
| Base | RLS `pacientes_delete` + FKs | La operación real es un **DELETE físico** de la fila. |

**Operación Supabase:** DELETE físico, hard delete. No hay borrado lógico de ningún tipo hoy.

### 1.2 ¿Qué rol/permiso puede borrar? ¿El botón se le muestra al asistente?

- **Base (RLS):** solo el **médico** puede borrar. Política vigente (`015_permisos_granulares.sql:159-164`):
  ```sql
  DROP POLICY IF EXISTS "pacientes_delete" ON public.pacientes;
  CREATE POLICY "pacientes_delete" ON public.pacientes
    FOR DELETE USING (
      creado_por = auth.uid()
      AND public.get_user_role(auth.uid()) = 'medico'
    );
  ```
  Traducción: solo permite borrar si la fila fue creada por el propio usuario **y** ese usuario tiene `role = 'medico'`. Un asistente (aunque comparta tenant) nunca satisface `creado_por = auth.uid()` **ni** `role = 'medico'`, así que el DELETE le afecta 0 filas.
  > Ojo: la versión previa en `001_pacientes.sql:147` era equivalente (`role = 'medico'` vía subquery); `015` solo la reescribió usando `get_user_role()`.

- **Endpoint:** el `DELETE` handler **no chequea rol explícitamente**. Solo valida tenant (`creado_por = tenantMedicoId`). La restricción a médico depende **enteramente de la RLS**. Efecto colateral: si un asistente invoca el endpoint directamente, la RLS bloquea (0 filas), pero como `supabase.delete()` no devuelve error cuando RLS filtra, el endpoint respondería `{ success: true }` sin haber borrado nada (falso positivo silencioso).

- **Botón en UI:** se muestra a **cualquiera** que abra la ficha del paciente, incluido el asistente. **No hay guard de rol ni de permiso** en `pacientes/[id]/page.tsx` (a diferencia de pedidos/certificados, que sí gatean el botón por `userRole === 'medico'`). Para el asistente el botón aparece pero la acción falla en RLS.

### 1.3 Foreign keys que apuntan a `pacientes` (verificado contra migraciones)

| Tabla | Columna | ON DELETE | Fuente |
|---|---|---|---|
| `historia_clinica` | `paciente_id` (UNIQUE, NOT NULL) | **CASCADE** | `002_historia_clinica.sql:9` |
| `estudios` | `paciente_id` (NOT NULL) | **CASCADE** | `003_estudios.sql:9` |
| `evoluciones` | `paciente_id` (NOT NULL) | **CASCADE** | `004_evoluciones.sql:10` |
| `turnos` | `paciente_id` (nullable) | **SET NULL** | `005_turnos.sql:23` |
| `consultas` | `paciente_id` (NOT NULL) | **CASCADE** | `schema.sql:176` ⚠ (ver nota) |
| `pedidos` | `paciente_id` (NOT NULL) | **RESTRICT** | `006_pedidos.sql:9` |
| `certificados` | `paciente_id` (NOT NULL) | **RESTRICT** | `007_certificados.sql:17` |
| `recetas` | `paciente_id` (NOT NULL) | **RESTRICT** | `009_recetas.sql:14` |
| `difusion_envios` | `paciente_id` (nullable) | **SET NULL** | `008_difusion.sql:86` |

> ⚠ **`consultas`:** la tabla no tiene migración fuente (se aplicó directo en Supabase, ver `CLAUDE.md` nota 6). El único registro es `schema.sql:176`, que la reconstruye con `ON DELETE CASCADE`. **No se pudo confirmar contra una migración real** — conviene verificar el FK real en la base antes de asumir CASCADE en producción.

Resumen por tipo:
- **CASCADE** (se borran en cascada): `historia_clinica`, `estudios`, `evoluciones`, `consultas`.
- **SET NULL** (se conserva la fila, se despersonaliza): `turnos`, `difusion_envios`.
- **RESTRICT** (bloquean el borrado): `pedidos`, `certificados`, `recetas`.

### 1.4 ¿Qué pasa hoy si se borra un paciente CON documentos?

- **Con pedidos / certificados / recetas (RESTRICT):** el DELETE **falla a nivel de base** con violación de FK. El endpoint captura el error genérico y responde `500 { error: 'Error del servidor' }`. La UI muestra `alert('Error al eliminar el paciente')`. **Es decir: hoy es imposible borrar un paciente que tenga al menos un pedido, certificado o receta.** El paciente queda "atascado" — no hay ni archivar ni forma limpia de sacarlo del listado.
- **Sin documentos RESTRICT pero con HC/consultas/estudios/evoluciones (CASCADE):** el DELETE **funciona** y arrastra en cascada toda la historia clínica, consultas, estudios y evoluciones. Los turnos quedan con `paciente_id = NULL` (turno huérfano en la agenda). Pérdida de datos clínicos irreversible.
- **Si lo intenta un asistente:** la RLS bloquea (0 filas). Con RESTRICT o sin él, no borra. El endpoint devolvería `success: true` engañosamente (ver 1.2), y la UI redirige a `/pacientes` como si hubiera funcionado, aunque el paciente sigue existiendo.

### 1.5 ¿Deja archivos huérfanos en Storage?

**Sí.** El bucket privado **`estudios`** (`003_estudios.sql`, ruta `{paciente_id}/{uuid}.pdf`) guarda los PDFs de estudios adjuntos. El `DELETE` de `pacientes/[id]/route.ts` **solo borra la fila de la tabla** — el CASCADE elimina las filas de `estudios` en Postgres, pero **no toca los objetos en Storage**. Los archivos quedan **huérfanos** en el bucket.

Igual pasaría con los PDFs de pedidos/certificados (bucket `documentos`, campo `pdf_path`), aunque por el RESTRICT esos nunca se alcanzan vía borrado de paciente.

---

## 2. Estado y borrado de pedidos y certificados hoy

### 2.1 Estados

Ambas tablas tienen la **misma máquina de estados**, agregada en `018_qr_verificacion.sql`:

```sql
ALTER TABLE public.pedidos      ADD COLUMN estado TEXT NOT NULL DEFAULT 'emitido'
  CHECK (estado IN ('emitido', 'revocado'));
ALTER TABLE public.certificados ADD COLUMN estado TEXT NOT NULL DEFAULT 'emitido'
  CHECK (estado IN ('emitido', 'revocado'));
```

- **`emitido`** → documento vigente (default al crearse).
- **`revocado`** → anulado manualmente por el médico.
- **No existe un estado "vencido/expirado" persistido.** El "expirado" es **solo de display** y aplica **únicamente a certificados** (los pedidos no tienen `valido_hasta`):
  - Se calcula por fecha: `isExpirado = estado !== 'revocado' && valido_hasta ? hoy > valido_hasta : false`.
  - En el listado: `src/app/(app)/certificados/page.tsx:110` (badge "Expirado").
  - En la página pública: `src/app/verificar/[codigo]/page.tsx:65` (`isExpired`).
  - Nunca cambia la columna `estado`; es puramente derivado de comparar `valido_hasta` con la fecha de hoy.

**Precedencia visual:** `revocado` gana sobre `expirado` (se evalúa primero en verificar y en el listado).

### 2.2 Anulación (revocado)

**Sí, está implementada y funcionando.**

| | Pedidos | Certificados |
|---|---|---|
| Botón UI | `src/components/pedidos/pedido-pdf.tsx:85` `anularPedido()` | `src/components/certificados/certificado-pdf.tsx:92` `anularCertificado()` |
| Gate UI | `userRole === 'medico' && estado === 'emitido'` (`pedido-pdf.tsx:134`) | ídem |
| Endpoint | `src/app/api/pedidos/[id]/anular/route.ts` (POST) | `src/app/api/certificados/[id]/anular/route.ts` (POST) |
| Lógica | Verifica `profile.role === 'medico'` explícitamente → `UPDATE ... SET estado='revocado' WHERE id AND firmado_por = user.id` | ídem |
| Reversible | **No** (no hay endpoint para volver a `emitido`) | No |

- La anulación **sí chequea rol médico en el endpoint** (a diferencia del DELETE de pacientes), además de la RLS.
- **Reflejo en verificación QR (`verificar/[codigo]/page.tsx`):**
  - `estado === 'revocado'` → banner rojo **"DOCUMENTO ANULADO / Este documento ha sido revocado"** (líneas 72-86).
  - `isExpired` (certificados vencidos) → banner ámbar **"DOCUMENTO EXPIRADO"** (líneas 87-101).
  - resto → banner verde **"DOCUMENTO VÁLIDO"**.
  - La función SQL `verificar_documento(codigo)` (`018:24-76`, SECURITY DEFINER, pública) devuelve `estado` y `valido_hasta` para ambos tipos vía `UNION ALL`.
- En la ficha interna, el documento anulado muestra badge "Anulado" y banner "no es válido para su uso" (`pedido-pdf.tsx:115, 206`).

### 2.3 Borrado físico de pedidos/certificados

**Sí existe hoy, y es un problema para el rediseño.** Coexiste con la anulación:

| | Pedidos | Certificados |
|---|---|---|
| Botón UI (ícono papelera) | `pedido-pdf.tsx:71` `eliminarPedido()` → dialog "¿Eliminar pedido?" (línea 164) | `certificado-pdf.tsx:81` → dialog equivalente |
| Gate UI | `userRole === 'medico'` (sin condición de estado — se puede borrar hasta uno ya anulado) | ídem |
| Endpoint | `src/app/api/pedidos/[id]/route.ts:125` (DELETE) | `src/app/api/certificados/[id]/route.ts:141` (DELETE) |
| Lógica endpoint | Valida tenant (`existing.firmado_por === tenantMedicoId`) → `delete().eq('id', id)`. **No chequea rol explícitamente** — depende de la RLS. | ídem |
| RLS | `pedidos_delete` (`006:64`): `role='medico' AND paciente.creado_por = auth.uid()` | `certificados_delete` (`007:76`): idéntica |

- **Rol que puede:** solo el médico (por RLS + gate de UI). El endpoint por sí solo no restringe rol; confía en RLS.
- Es un **hard delete**: destruye la evidencia del documento emitido. Como el paciente ya recibió el PDF impreso con su QR, borrarlo hace que el QR devuelva "Verificación Fallida" (`verificar` línea 42, cuando `verificar_documento` no encuentra fila) — indistinguible de un código falso. Esto es exactamente lo que la anulación viene a resolver, así que el borrado físico **contradice el modelo de verificación** y debería eliminarse.

---

## 3. Para el rediseño (archivar pacientes)

### 3.1 Cómo agregar "archivado" — recomendación

**Recomiendo columna `archivado_at TIMESTAMPTZ NULL`** (no booleano).

- **Por qué timestamptz nullable en vez de booleano:** `NULL` = activo, valor = archivado + queda registrado *cuándo*. Auditable, sin columna extra para la fecha, y semánticamente claro (mismo patrón que un `deleted_at` de soft-delete). Un booleano `archivado` obligaría a agregar aparte un `archivado_at` si en algún momento se quiere la fecha, y no aporta nada a cambio.
- Índice parcial para acelerar el listado por defecto: `CREATE INDEX idx_pacientes_activos ON pacientes(creado_por) WHERE archivado_at IS NULL;`
- **Toca esquema:** nueva migración (`ALTER TABLE pacientes ADD COLUMN archivado_at TIMESTAMPTZ`). Crear migración real numerada (no aplicar directo en Supabase).
- **Toca tipos:** `src/types/paciente.ts` → agregar `archivado_at: string | null` a `Paciente` (y por herencia a `PacienteWithObraSocial`). Mantener tipos fijos, no `string` genérico.
- **Toca RLS:** para archivar/desarchivar alcanza la política `pacientes_update` existente (médico + asistente del tenant). **Decisión de negocio a definir:** si archivar debe ser exclusivo del médico, habrá que gatear en el endpoint/UI (la RLS de UPDATE hoy permite a asistentes con `editar_pacientes`). No requiere nueva política si se acepta que el asistente con permiso pueda archivar.

### 3.2 Queries de listado a ajustar (filtrar archivados por defecto)

Archivos concretos que consultan `pacientes` y deberían excluir `archivado_at IS NOT NULL` por defecto:

| Archivo | Línea | Uso | Ajuste |
|---|---|---|---|
| `src/app/(app)/pacientes/page.tsx` | 33-54 | Listado principal | Agregar `.is('archivado_at', null)` salvo cuando un filtro "ver archivados" esté activo. |
| `src/app/api/pacientes/route.ts` (GET) | 46-55 | Buscador (pickers de pedidos/certificados/turnero) | `.is('archivado_at', null)` — no ofrecer archivados al emitir documentos nuevos. |
| `src/components/dashboard/recent-patients.tsx` | 12 | "Pacientes recientes" | `.is('archivado_at', null)`. |
| `src/components/dashboard/stats-cards.tsx` | 18 | Conteo total de pacientes | `.is('archivado_at', null)` para no inflar el KPI. |

**No** filtrar (deben seguir viendo al paciente archivado): `pacientes/[id]/page.tsx` (ficha individual), `pacientes/[id]/historia/*`, `api/pacientes/[id]/*`, `api/consultas/[id]/pdf` — al abrir un paciente archivado directamente hay que poder verlo (idealmente con badge "Archivado" y acciones de escritura deshabilitadas/limitadas).

Además hará falta **UI nueva**: acción "Archivar/Desarchivar" (reemplaza el actual botón "Eliminar" en `pacientes/[id]/page.tsx:106` + `delete-patient-button.tsx`), y un filtro "Mostrar archivados" en `src/components/pacientes/patient-filters.tsx`.

### 3.3 Borrado físico de EXCEPCIÓN (solo pacientes sin ninguna actuación)

Para permitir hard delete **solo** si el paciente no tiene NI consultas, NI pedidos, NI certificados, NI turnos, NI historia clínica (ni estudios/evoluciones/recetas), la forma confiable:

- **Verificación en el servidor (endpoint), no en el cliente.** Antes del `delete()`, correr conteos `head:true` sobre cada tabla hija y abortar si alguno > 0:
  ```
  consultas, historia_clinica, estudios, evoluciones, turnos, pedidos, certificados, recetas
  ```
  con `.select('id', { count: 'exact', head: true }).eq('paciente_id', id)` para cada una. Si cualquier count > 0 → `409 { error: 'El paciente tiene actuaciones; archivalo en vez de borrarlo' }`.
- **Punto clave:** hoy las tablas hijas tienen RLS por tenant; los conteos deben verse correctamente. Para evitar falsos negativos (una fila que RLS oculta y que igual bloquearía el FK), la verificación más confiable es hacerla con `admin.ts` (service role, bypass RLS) **solo para leer conteos**, garantizando que se cuenta *todo* lo que el FK vería.
- **Red de seguridad a nivel base:** los FK **RESTRICT** de `pedidos`/`certificados`/`recetas` ya impiden el borrado si existen esos documentos (la base lo rechaza aunque el chequeo previo fallara). El riesgo real está en las tablas **CASCADE** (`consultas`, `historia_clinica`, `estudios`, `evoluciones`): la base **no** las bloquea, las borraría en silencio. Por eso el conteo previo en el servidor es imprescindible para esas cuatro — no alcanza con confiar en el FK.
- **Storage:** si se permite el borrado de excepción, y dado que "sin estudios" es condición, no debería haber objetos en `estudios/{paciente_id}/`. Aun así, conviene un `storage.remove()` defensivo del prefijo antes/después del delete para no dejar huérfanos (ver 1.5).
- **Rol:** restringir a médico, y explícitamente en el endpoint (no solo RLS), para no repetir el falso positivo de 1.2.

### 3.4 Quitar por completo el borrado físico de pedidos y certificados

Para dejar **solo anular**:

1. **Endpoints — eliminar los handlers `DELETE`:**
   - `src/app/api/pedidos/[id]/route.ts:125-166` → borrar función `DELETE`.
   - `src/app/api/certificados/[id]/route.ts:141-180` → borrar función `DELETE`.
2. **UI — quitar el botón papelera y su dialog:**
   - `src/components/pedidos/pedido-pdf.tsx`: función `eliminarPedido` (71-83) + bloque `userRole === 'medico'` con `<Trash2>` (164-191) + estado `isDeleting`.
   - `src/components/certificados/certificado-pdf.tsx`: equivalentes (`~81` y bloque análogo).
3. **RLS — revocar la política de DELETE** (opcional pero recomendado, defensa en profundidad): `DROP POLICY "pedidos_delete" ON public.pedidos;` y `DROP POLICY "certificados_delete" ON public.certificados;` en una migración nueva. Sin política de DELETE, la RLS niega todo DELETE por defecto. **Toca esquema.**
4. **Tipos:** sin cambios (los estados `emitido`/`revocado` ya cubren el modelo).

Con esto el único camino de "sacar de circulación" un documento es **anular → `estado='revocado'`**, que preserva la fila y hace que el QR informe correctamente que fue revocado (en vez de "Verificación Fallida").

---

## Resumen ejecutivo

- **Pacientes:** hoy hay **hard delete** (`DELETE /api/pacientes/[id]`), botón visible para todos (asistente incluido, aunque RLS lo bloquea). El endpoint no chequea rol (falso `success:true` para asistente). Borrar arrastra en CASCADE toda la HC/consultas/estudios/evoluciones, deja **archivos huérfanos en Storage**, y **falla** si hay pedidos/certificados/recetas (RESTRICT) → pacientes "inborrables". No existe archivar.
- **Documentos:** estados `emitido`/`revocado`; "expirado" es solo display por `valido_hasta` (certificados). Anular está **implementado y correcto**, con reflejo en el QR público. Pero **también existe hard delete** de pedidos/certificados, que rompe el QR y contradice el modelo de verificación → debe eliminarse.
- **Rediseño:** columna `archivado_at TIMESTAMPTZ NULL` + filtro en 4 queries de listado; borrado de excepción con conteo server-side (crítico para las 4 tablas CASCADE) + limpieza de Storage; quitar los 2 endpoints DELETE + botones + revocar RLS de DELETE en documentos.
