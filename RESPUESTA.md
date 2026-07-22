# RESPUESTA — Storage (código de la aplicación: estudios)

> Implementada la subida / listado / visualización / borrado de estudios complementarios
> por paciente sobre el bucket privado `estudios` (migración 026, ya ejecutada).
> **`npx tsc --noEmit` y `npx next build` pasan limpios (exit 0).** No ejecuté nada
> contra Supabase.

---

## Archivos creados

- `src/lib/supabase/storage.ts` — helper central de Storage (constantes, path builder,
  signed URLs).
- `src/lib/validations/estudio.schema.ts` — Zod de metadatos + validación de archivo
  reutilizable cliente/servidor.
- `src/app/api/estudios/[id]/route.ts` — `GET` (signed URL 60s) y `DELETE` (solo médico).
- `src/components/pacientes/estudios-list.tsx` — listado con ver/descargar y borrar.

## Archivos modificados

- `src/app/api/estudios/route.ts` — reemplazado el stub por `GET` (listar) + `POST` (subir).
- `src/components/pacientes/estudios-upload.tsx` — reemplazado el stub por el formulario real.
- `src/app/(app)/pacientes/[id]/estudios/page.tsx` — reemplazado el stub por el Server
  Component (guard de permiso + fetch + render).
- `src/app/(app)/pacientes/[id]/page.tsx` — nuevo link "Estudios" (ícono `FolderOpen`) junto
  a "Historia clínica"; import de `FolderOpen`.
- `src/app/api/pacientes/[id]/route.ts` — corregido el path de limpieza de Storage a
  `{medico_id}/{paciente_id}/...` y mejorado el logging.

## Tipos

`Estudio` y `EstudioInsert` ya existían en `src/types/pedido.ts` y alcanzan tal cual. **No
creé tipos nuevos:** la respuesta de la signed URL (`{ url, file_name, error }`) es una forma
de respuesta puntual de un endpoint, y el proyecto no tipa las respuestas de API en un archivo
de dominio (las consume inline). Agregar un tipo global para eso hubiera sido inconsistente
con el resto. Respeté la organización por dominio (no consolidé nada).

---

## Decisiones de diseño

### Cliente de sesión vs admin en cada operación de Storage
Criterio: **usar el cliente de sesión (`server.ts`) siempre que la RLS pueda hacer de defensa
real**, y `admin.ts` (bypass RLS) solo donde es imprescindible.

| Operación | Cliente | Por qué |
|---|---|---|
| Subir objeto (`upload`) | **sesión** | La política `estudios_objects_insert` valida tenant (`foldername[1] = get_medico_id()`) + `ver_historia_clinica`. RLS es defensa real. |
| Insertar fila en `estudios` | **sesión** | `estudios_insert` valida permiso + tenant. |
| Listar estudios (`GET`) | **sesión** | `estudios_select` aísla por tenant + permiso. |
| Signed URL (`GET [id]`) | **sesión** | `createSignedUrl` pasa por `estudios_objects_select`: solo firma objetos del propio tenant y con permiso. |
| Borrar fila + objeto (`DELETE`) | **sesión** | `estudios_delete` / `estudios_objects_delete` exigen rol médico + tenant. Además valido rol en código. |
| Leer `pacientes.archivado_at` y pertenencia al tenant | **admin** | Único uso justificado: quien tiene `ver_historia_clinica` puede **no** tener `ver_pacientes`; un SELECT por RLS sobre `pacientes` daría un **404 falso**. Se acota con `.eq('creado_por', tenantMedicoId)`. Mismo patrón que `POST /api/consultas`. |

### Validación en el servidor (no confiar en el cliente)
- Permiso `ver_historia_clinica` validado en cada endpoint vía `getTenantContext` (patrón de
  `api/consultas`), **además** de la RLS.
- El archivo se valida con su **tamaño y MIME reales** (`file.size` / `file.type` del `File`
  del FormData), no con lo que declara el cliente. El mismo `validateEstudioFile` corre en el
  cliente (feedback rápido) y en el servidor (autoridad).
- Paciente **archivado** → `POST` y `DELETE` devuelven 409 (regla de negocio 9). Lectura y
  descarga siguen permitidas.

### Subida por Route Handler + FormData
Como pediste, la subida va por Route Handler con `FormData` (no Server Action, que tiene el
tope de ~1 MB). Límite real: 10 MB, enforced en tres capas — cliente, servidor y
`file_size_limit` del bucket.

### Rollback y consistencia
- **`POST`**: si el archivo se sube pero el `INSERT` en `estudios` falla, se borra el objeto
  recién subido para no dejar huérfanos (y se loguea si el rollback fallara).
- **`DELETE`**: se borra **primero la fila** (fuente de verdad de la app) y luego el objeto.
  Si el borrado del objeto falla, el estudio ya desapareció para el usuario (sistema
  consistente) y queda un objeto huérfano **registrado en el log** para limpieza posterior.
  Elegí este orden sobre el inverso porque el fallo alternativo (fila que apunta a un objeto
  ya borrado) daría un "ver" roto al usuario.

### Ruta de objetos
`{medico_id}/{paciente_id}/{uuid}.{ext}`. La extensión sale del nombre original (minúsculas,
`jpeg`→`jpg`) y, si no es reconocible, se deriva del MIME. El `uuid` evita colisiones; el
nombre original se preserva en la columna `file_name`.

---

## Hallazgos (verificados, no requirieron arreglo extra)

- **El conteo de actuaciones del borrado de pacientes YA incluía `estudios`**
  (`src/app/api/pacientes/[id]/route.ts:200-208`, array `tablasHijas`). Un paciente con
  estudios ya no era borrable; no hubo que corregir el conteo, solo el path de limpieza.
- **No toqué** turnero, mensajería, difusión ni recetas. **No creé** los buckets `documentos`
  ni `difusion`. **No** hay persistencia de PDFs (otra tanda). **No** guardé nada como base64.
- `difusion_posts.imagen_path` sigue siendo andamiaje muerto (fuera de alcance).

Sin hallazgos nuevos graves.

---

## Tests manuales en el navegador

### Flujo feliz (como médico)
1. Entrar a un paciente → botón **"Estudios"** (junto a "Historia clínica") → abre la página.
2. Subir un **PDF** (< 10 MB): completar nombre/tipo/fecha, subir → toast "Estudio subido",
   aparece en la lista con ícono de documento, tamaño legible y fecha.
3. Subir una **imagen** (JPG/PNG/WebP) → aparece con ícono de imagen.
4. Click en **descargar** (ícono ↓) → abre el archivo en pestaña nueva (signed URL 60s).
5. Como médico, **borrar** un estudio → confirmación → desaparece de la lista; el archivo deja
   de ser accesible.

### Validaciones de archivo
6. Intentar subir un archivo **> 10 MB** → error en el cliente ("supera el límite de 10 MB");
   no se envía.
7. Intentar subir un tipo **no permitido** (ej. `.docx`, `.zip`) → el `accept` lo filtra y, si
   se fuerza, el cliente y el servidor lo rechazan ("Solo PDF, JPG, PNG o WebP").
8. Subir sin nombre → error "El nombre del estudio es requerido".

### Permisos (clave)
9. **Asistente CON `ver_historia_clinica`**: puede entrar a Estudios, ver, descargar y subir.
   **No** ve el botón de borrar (es exclusivo del médico); si llamara al `DELETE` igual, el
   servidor responde 403.
10. **Asistente SIN `ver_historia_clinica`**: al entrar a `/pacientes/[id]/estudios` debe ser
    redirigido a **`/sin-acceso`**. Los endpoints `GET`/`POST`/`DELETE` responden 403.
11. **Aislamiento entre tenants**: con el usuario del médico A, un `GET /api/estudios/[id]` de
    un estudio del médico B debe dar 404 (RLS), y su signed URL no debe poder generarse.

### Paciente archivado (regla de negocio 9)
12. En un paciente **archivado**: la página de Estudios muestra el aviso "no se pueden subir"
    y el formulario deshabilitado; **la lista se ve y se puede descargar**.
13. Forzar `POST /api/estudios` con paciente archivado → 409. Forzar `DELETE` → 409.
14. El link "Estudios" en la ficha **sigue funcionando** aunque el paciente esté archivado.

### Borrado de paciente + limpieza de Storage
15. Un paciente **con estudios NO se puede borrar** definitivamente (409 "tiene actuaciones";
    archivalo). *(Para probar el borrado con limpieza haría falta un paciente sin ninguna otra
    actuación pero con un objeto suelto en Storage; en uso normal no ocurre porque el estudio
    crea fila. La limpieza por prefijo `{medico_id}/{paciente_id}` quedó corregida por si
    hubiera huérfanos.)*

### Regresión
16. Descargar PDFs de pedidos/certificados/consulta/HC sigue funcionando (no toqué esos flujos).

---

## Estado

- Código de estudios **implementado y compilando** (`tsc` y `build` limpios).
- Pendiente: tu ronda de **tests manuales** en el navegador (sobre todo permisos y archivado),
  que no puedo ejecutar yo. Avisame si querés que ajuste algo tras probarlo.
