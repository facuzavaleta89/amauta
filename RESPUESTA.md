# RESPUESTA — Endurecimiento de seguridad (datos sensibles) · Paso 3 COMPLETADO

> Confirmaste que ejecutaste el SQL de la migración 025. Este informe cubre el **Paso 3**:
> código de la app + documentación actualizados a la nueva forma de `verificar_documento`
> y a los hallazgos de la auditoría. **`tsc --noEmit` y `next build` limpios (exit 0).**

---

## Paso 3 — Qué hice

### 1. Página pública de verificación — `src/app/verificar/[codigo]/page.tsx`
- **DNI enmascarado:** `DNI: {doc.paciente_dni}` → `DNI: {doc.paciente_dni_masked}`.
- **Contenido clínico eliminado:** se quitó por completo el bloque "Contenido Clínico"
  (que renderizaba `doc.contenido`). La función ya no devuelve ese campo.
- **Tipado nuevo:** agregué la interfaz `DocumentoVerificado` que refleja la forma real
  del retorno de la RPC (antes `doc` era `any`). Ahora TS captura los campos removidos —
  incluye `paciente_dni_masked: string | null` y **no** tiene `paciente_dni` ni `contenido`.
  El `.rpc(...)` se castea a `DocumentoVerificado | null`.
- No hay otros consumidores: `src/components/shared/qr-verificacion.tsx` solo genera el QR
  de la URL, sin tocar los campos sensibles (verificado por grep).

### 2. `schema.sql`
- **`verificar_documento`** reescrita a la nueva forma: DNI enmascarado
  (`repeat('•', length-3) || right(dni,3)`), sin `contenido`, `SET search_path = public`,
  + `REVOKE EXECUTE FROM PUBLIC` / `GRANT ... TO service_role, postgres`.
- **`log_turno_cambio`**: agregado `SET search_path = public`.
- **Políticas `pedidos_delete` / `certificados_delete`**: removidas del snapshot, con nota
  de que la migración 025 las dropeó (los documentos solo se anulan).
- **`consultas`**: nota nueva de que la 025 dropeó las políticas huérfanas
  (`medico_full_access`, `asistente_access`); quedan solo las cuatro correctas.
- **ENUM `turno_estado`**: corregido a **7 valores** (agregado `'pendiente_confirmar'`) y
  reescrita la nota que decía erróneamente que no existía.
- **Tabla `notificaciones`**: reemplacé la nota "no se reconstruye" por el `CREATE TABLE`
  real (id, medico_id, titulo, mensaje, tipo, leida, payload, created_at) + `ENABLE RLS` +
  las 4 políticas. Aclaro en un comentario que la auditoría confirmó los **nombres** de las
  políticas (+ la duplicada "Medicos ven sus propias notificaciones") pero **no** sus
  predicados: los mostrados (`medico_id = auth.uid()`) son reconstrucción plausible.
- **Encabezado**: rango de migraciones `001→024` → `001→025` + resumen de la 025.

### 3. `PENDIENTES.md`
- **Bloque B — verificación pública**: marcado **✅ RESUELTO (migración 025)** minimización
  de datos (DNI enmascarado + contenido quitado) y hardening (search_path + REVOKE PUBLIC).
- **Bloque B — defensa en profundidad (DELETE de documentos)**: **✅ RESUELTO**.
- **Bloque B — nuevo ítem "RLS huérfanas en `consultas`"**: registrado como **✅ RESUELTO**
  (el hallazgo de la auditoría y su fix).
- **Bloque A — desajuste `TurnoEstado`**: marcado **✅ FALSO DESAJUSTE** (el ENUM sí tiene
  `'pendiente_confirmar'`; código y base alineados).
- **Bloque A — `notificaciones`**: actualizado (estructura ya reconstruida en `schema.sql`;
  sigue faltando la migración fuente versionada).

### 4. `CLAUDE.md`
- Fila `notificaciones` del modelo de datos: ahora dice "estructura verificada y reconstruida
  en `schema.sql`; sigue sin migración fuente".
- Nota técnica 6: `schema.sql` reconstruye **todos** los objetos sin fuente (incluida
  `notificaciones`); lo que falta es la migración versionada.
- **Nota técnica 8 nueva**: resume la migración 025 (verificar_documento sin datos sensibles
  + permisos, drop de RLS huérfanas en consultas, drop de DELETE en documentos, search_path
  en log_turno_cambio).

---

## Archivos tocados en el Paso 3

- `src/app/verificar/[codigo]/page.tsx` (DNI enmascarado, sin contenido clínico, tipado)
- `schema.sql`
- `PENDIENTES.md`
- `CLAUDE.md`
- `RESPUESTA.md` (este archivo)

No toqué el turnero, la mensajería ni la difusión. No modifiqué la migración 025 ni
`MIGRACION-01-seguridad.sql` en esta ronda (ya estaban ejecutados).

---

## Verificación

- `npx tsc --noEmit` → **exit 0**.
- `npx next build` → **exit 0**; `/verificar/[codigo]` queda como ruta dinámica (ƒ),
  server-rendered on demand, como corresponde (usa el admin client en cada request).

---

## Hallazgos nuevos (no arreglados)

- **Predicados de las políticas de `notificaciones` no verificados.** La auditoría me dio
  los nombres de las políticas y la estructura de la tabla, pero no los predicados exactos
  (USING/WITH CHECK). Los reconstruí como `medico_id = auth.uid()` y lo dejé marcado en
  `schema.sql`. **Conviene confirmarlos contra la base** cuando se cree la migración fuente,
  sobre todo el INSERT: los avisos los generan `api/turnero` y `api/cron/recordatorios`, que
  probablemente insertan con el admin client (service_role) en nombre del médico — si el
  predicado de INSERT fuera `medico_id = auth.uid()` estricto, un asistente no podría
  generarlos con su sesión. No lo toco por estar fuera del alcance de este prompt.
- Sin otros hallazgos graves fuera de alcance en esta ronda.

---

## Qué tenés que testear en el navegador

1. **`/verificar/[codigo]` de un certificado válido**: debe mostrar nombre del paciente,
   **DNI enmascarado** (`•••••XXX`), profesional, tipo, fecha y estado. **No** debe aparecer
   el DNI completo ni ningún bloque de contenido clínico.
2. **`/verificar/[codigo]` de un pedido**: ídem — sin "Estudios pedidos" ni diagnóstico.
3. **Documento revocado / expirado**: los banners de estado (rojo / ámbar / verde) siguen
   funcionando.
4. **Código inválido**: sigue mostrando "Verificación Fallida".
5. **Que la página siga cargando tras el REVOKE**: usa service_role, así que debe resolver
   igual. (Si alguien probaba la RPC con la anon key, ahora debe fallar — es lo esperado.)
6. **Permisos del asistente (regresión de la auditoría)**: con un asistente que tenga
   `ver_historia_clinica=false`, entrar a la HC / consultas de un paciente debe quedar
   **bloqueado también a nivel base** (RLS), no solo en la UI. Antes veía todo por la
   política huérfana; ahora no debería.
7. **Anular** un pedido/certificado sigue funcionando (UPDATE a `revocado`); **no** debe
   existir ningún camino de borrado físico.
8. **Turnero** (regresión, no lo toqué): crear/mover turnos con estado `pendiente_confirmar`
   sigue andando — solo cambié documentación, no código del turnero.

---

## Estado

- **Paso 1** (SQL) ✅ · **Paso 2** (ejecución manual en Supabase) ✅ (lo confirmaste) ·
  **Paso 3** (código + documentación) ✅.
- Trabajo de esta tarea de seguridad **completo**, a la espera de tu smoke test manual.
