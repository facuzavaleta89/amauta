# RESPUESTA — Actualización de documentación (tanda de Storage)

> Solo documentación. **No toqué `src/` ni `supabase/migrations/`** ni ejecuté nada contra
> Supabase. Todo lo documentado se verificó leyendo la migración 026 y el código real.

---

## `schema.sql`

- **Encabezado:** rango de migraciones actualizado a **001→026**; agregado el resumen de la
  026 (bucket privado `estudios` + 4 políticas sobre `storage.objects` + endurecimiento de las
  4 políticas de la tabla `estudios`) a la lista de "migraciones recientes reflejadas".
- **Políticas de la tabla `estudios` (RLS):** reescritas las 4 con sus predicados reales de la
  026 — `select/insert/update` ahora exigen `check_permiso(auth.uid(), 'ver_historia_clinica')`
  además del tenant; `delete` queda en `get_user_role() = 'medico'`. **Corrección de fondo:** el
  snapshot anterior tenía el `delete` con `creado_por = auth.uid()`; la migración 026 usa
  `get_medico_id()` (consistente con el resto). Ahora coincide con la fuente.
- **Nueva sección STORAGE** (antes de "FIN DEL SNAPSHOT"): documenta el `INSERT` del bucket
  `estudios` (privado, `file_size_limit` 10485760, MIME pdf/jpeg/png/webp) y las **4 políticas
  sobre `storage.objects`** con sus expresiones reales (`storage.foldername(name)[1] =
  get_medico_id()::text` + permiso; `delete` solo médico). Aclara que `documentos`/`difusion`
  no existen.

## `CLAUDE.md`

- **Modelo de datos:** fila de `estudios` actualizada — funcionalidad **implementada**
  (subir/ver/descargar/borrar), bucket privado `estudios` (026), ruta
  `{medico_id}/{paciente_id}/{uuid}.{ext}`.
- **Reglas de negocio:** nueva **regla 10** (estudios): permisos (`ver_historia_clinica` para
  ver/descargar/subir; borrar solo médico), descarga por **proxy** sin exponer la URL de
  Storage, subida por Route Handler + FormData, estudios como actuación, comportamiento con
  paciente archivado.
- **Estado de desarrollo:** agregado el bloque "Tanda de Storage (026)" con lo implementado y
  los archivos nuevos; el "Pendiente" ahora nombra la persistencia de PDFs y los buckets
  `documentos`/`difusion` faltantes.
- **Notas y deuda técnica:** nueva **nota 9** describiendo la migración 026 (aislamiento por
  primer segmento del path, endurecimiento de `estudios`, único bucket creado).

## `PENDIENTES.md`

- **Bloque B → Storage:** marcado **✅ RESUELTO para `estudios` (026)**: políticas versionadas
  y por tenant (ya no el riesgo de `auth.role()='authenticated'`), + endurecimiento de la tabla.
  Se deja explícito que `documentos`/`difusion` siguen pendientes.
- **Bloque A → stubs:** recuento corregido de **13 → 12**; quitado `pacientes/estudios-upload`
  de la lista y aclarado que `estudios-list.tsx` y `pacientes/[id]/estudios/page.tsx` tampoco
  son stubs. (También corregido el "los 13" del Bloque C → "los 12".)
- **Bloque A → nuevos pendientes:** agregada la **persistencia de PDFs** de pedidos/certificados
  con el problema de la **"firma viva"** (hoy se regeneran al descargar y usan los datos
  ACTUALES del médico, no los del momento de la emisión), y la ausencia de los buckets
  `documentos` y `difusion`.

## `README.md`

- Rango de migraciones **001 → 021** → **001 → 026**.
- Paso de Storage: el bucket **`estudios` se crea por migración (026)** con sus políticas; ya
  **no** hay que crearlo a mano. Aclarado que **`documentos` y `difusion` todavía no existen
  ni se usan**.

## `DESIGN.md`

- Recuento de stubs **13 → 12** (en la nota de componentes y en la lista de inconsistencias);
  ejemplos de stubs actualizados; aclarado que `estudios-upload.tsx` ya se implementó.
- Nuevo párrafo **"Estudios — patrones visuales"**: íconos por tipo de archivo
  (`ImageIcon`/`FileText` sobre chip `bg-primary/10`), acciones Ver/Descargar/Eliminar, y el
  **modal de previsualización** (`dialog` de shadcn, `<img>` para imágenes / `<iframe>` para
  PDF con salidas de respaldo en móvil). Se nota que el stub `shared/file-preview` sigue sin uso.

---

## Inconsistencias encontradas entre documentación y código

1. **`schema.sql` tenía la política `estudios_delete` con `creado_por = auth.uid()`**, pero la
   migración 026 (fuente) usa `get_medico_id()`. Corregido en el snapshot. (Para el médico
   ambos coinciden — su `id` es el tenant — así que no había bug funcional, pero el snapshot no
   reflejaba la fuente.)
2. **La nota de stubs decía "13" y seguía listando `pacientes/estudios-upload`**, que ya está
   implementado. El conteo real hoy es **12** (verificado con `grep -rl "function Placeholder"
   src/` → 12 archivos). Ojo: `shared/file-preview` **sigue** siendo stub — la previsualización
   de estudios se resolvió inline en `estudios-list.tsx`, no reutilizando ese componente.
3. **README y PENDIENTES asumían que los buckets se crean a mano** y trataban
   `estudios`/`documentos`/`difusion` como un bloque homogéneo. Tras la 026 hay una asimetría
   real: `estudios` existe (por migración), los otros dos **no**. Documentado explícitamente en
   los cinco archivos para que no se vuelva a asumir que `documentos`/`difusion` existen.
4. **`schema.sql` no tenía ninguna sección de Storage** pese a que la tabla `estudios` ya
   mencionaba el "bucket privado". Ahora el bucket y sus políticas figuran en el snapshot.
