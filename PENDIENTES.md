# Pendientes — Pulidos finales v1.x

**Estado:** la aplicación está en **v1.0, deployada y funcional**. Los siguientes
pulidos se organizan en tres bloques (Funcional / Seguridad / Estético). Cada ítem
incluye, cuando aplica, su ubicación en el código.

> Hallazgos surgidos de la exploración documental del repo. No se modificó código de
> la app al relevarlos.

---

## Bloque A — Funcional

Ajustes de comportamiento, flujos incompletos, detalles de usabilidad y trabajo pendiente.

### Funcionalidades incompletas
- **Dashboard — métricas:** definir e implementar qué métricas mostrar (pendiente de
  definición del cliente). Hoy existe `src/components/dashboard/stats-cards.tsx`.
- **Difusión — envío de correos:** conectar a un servicio de envío real. El endpoint
  `src/app/api/difusion/enviar/route.ts` es un **stub** (`GET` → `"Not implemented"`);
  Resend está en dependencias pero no cableado. Falta también el flujo de destinatarios.
- **Recetas:** bloqueadas por certificación ANMAT. `src/app/api/recetas/route.ts` es
  stub y `src/lib/pdf/receta-template.tsx` es un placeholder vacío (esperado; dejar
  documentado que está en pausa).
- **Persistencia de PDFs de pedidos y certificados (fuera de la tanda de Storage):** hoy los
  PDF **no se guardan** en ningún bucket — se **regeneran al descargar** desde el endpoint del
  servidor. Efecto secundario importante: usan los **datos ACTUALES del médico** (firma, sello,
  matrículas, título, logo), no los del **momento de la emisión** — problema de la *"firma
  viva"*. Si el médico cambia su firma/matrícula, los documentos ya emitidos se reimprimen con
  la firma nueva, lo que puede no ser deseable legalmente. Pendiente: definir si el PDF debe
  **congelarse al emitir** (persistirlo en un bucket privado `documentos`) o snapshotear los
  datos del emisor en la fila. Requiere crear el bucket **`documentos`** (no existe todavía).
- **Buckets `documentos` y `difusion`:** la tanda de Storage creó **solo** `estudios`
  (migración 026). `documentos` (para PDFs persistidos de pedidos/certificados) y `difusion`
  (imágenes de posts — `difusion_posts.imagen_path` es andamiaje muerto por ahora) **no
  existen ni se usan**. Cuando se creen, versionar el bucket y sus políticas RLS por tenant
  con el mismo patrón que `estudios` (ver Bloque B → Storage).

### Esquema sin migración fuente (reproducibilidad)
Estos objetos existen en Supabase pero **no tienen `CREATE`/`ALTER` en
`supabase/migrations/`** (se aplicaron directo en el dashboard). Un entorno nuevo
levantado solo desde migraciones quedaría incompleto. Crear las migraciones faltantes:
- Tabla **`consultas`** completa (reconstruida en `schema.sql` desde `types/consulta.ts`).
  Su columna `campos_extra` **sí** tiene fuente (migración `022`); el resto de la tabla no.
- Tabla **`notificaciones`** completa: existe en la base y se usa en el código
  (`notificaciones/page.tsx`, `api/turnero`, `api/cron/recordatorios`). Su estructura ya
  se **verificó contra la base real y se reconstruyó en `schema.sql`** (id, medico_id,
  titulo, mensaje, tipo, leida, payload, created_at + políticas). **Sigue sin migración
  fuente:** falta crear el `CREATE TABLE` versionado en `supabase/migrations/`.
- Columnas de Bloque 4 en **`turnos`**: `categoria`, `origen`, `consulta_id`.
- Columnas en **`profiles`**: `titulo`, `matriculas` (jsonb), `logo_url`.
- **Migración vacía:** `supabase/migrations/20260326204733_fix_rls_recursion.sql`
  tiene **0 bytes**. Completarla con su contenido real o eliminarla del historial.

### Desajustes tipo TypeScript ↔ esquema DB
(No corregidos por consigna; anotados para revisión.)
- ~~**`TurnoEstado` incluye `'pendiente_confirmar'`** que no existiría en el ENUM.~~
  **✅ FALSO DESAJUSTE (verificado 2026-07-22):** el ENUM `turno_estado` de la base **sí**
  tiene 7 valores e incluye `'pendiente_confirmar'`. El código (`types/turno.ts`,
  `turno.schema.ts`) está alineado con la base. `schema.sql` corregido para reflejarlo.
- **`Certificado.tipo` tipado no-nullable** (`src/types/pedido.ts:67`) pero la
  migración 017 hizo la columna **nullable y sin default**. El tipo debería ser
  `CertificadoTipo | null`.
- **`mensajes_lecturas` sin interface propia:** solo aparece como join inline en
  `MensajeInterno.lecturas` (`src/types/mensaje.ts:24`). Falta un `MensajeLectura`
  (agregarlo dentro de `mensaje.ts`, respetando la agrupación por dominio).
- **`historia_clinica.proximo_control`** es `TIMESTAMPTZ` (migración 016) pero
  `HistoriaClinica.proximo_control` lo comenta como "ISO date" (`src/types/pedido.ts:235`).
- **Uniones debilitadas a `string`:** `TurnoAuditLog.accion` (`src/types/turno.ts:89`)
  y los joins `remitente/destinatario.role` (`src/types/mensaje.ts:21-22`) usan `string`
  en vez de las uniones literales (`UserRole`, acciones del audit). Ajustar a literales.

### Limpieza de código muerto
- **12 componentes stub** `export default function Placeholder(){return null}`, sin
  imports en ningún lado: `turnero/turno-card`, `pacientes/{patient-tabs, evolucion-charts}`,
  `dashboard/weekly-calendar`, `shared/{role-guard, loading-spinner, file-preview,
  confirm-dialog, error-boundary}`, `difusion/{post-editor, send-modal}`,
  `lib/pdf/receta-template`. Eliminarlos o implementarlos.
  (`difusion/post-list.tsx` y `pacientes/estudios-upload.tsx` **ya se implementaron** — este
  último en la tanda de Storage; también son reales `estudios-list.tsx` y
  `pacientes/[id]/estudios/page.tsx`, que ya no son stubs. `shared/file-preview` **sigue**
  siendo stub: el modal de previsualización de estudios se resolvió inline en `estudios-list`.)
- **Barrel redundante:** `src/types/supabase.ts` re-exporta un subconjunto de dominios;
  ahora existe `src/types/index.ts` como barrel completo. Consolidar imports hacia
  `@/types` y evaluar deprecar `supabase.ts`.

### Lint preexistente (deuda técnica menor)
- **Errores/warnings de lint preexistentes** (no introducidos por los cambios recientes,
  detectados al pasar por esos archivos): `@typescript-eslint/no-explicit-any` en
  `src/components/pacientes/consultas/consulta-detail.tsx`, y warnings de alt-text /
  `no-explicit-any` en `src/lib/pdf/consulta-template.tsx`. Limpiar cuando se pase por ahí;
  no bloquean el build.

### Datos / catálogo
- **"Particular / Sin obra social"** existe como **registro real** en la seed de
  `obras_sociales` (migración 001), a la vez que el formulario ofrece una opción
  "Particular" hardcodeada. Verificar que no haya duplicación/ambigüedad al seleccionar.

---

## Bloque B — Seguridad

La app maneja **datos sensibles de salud** de pacientes y debe adecuarse a la normativa
argentina de protección de datos (**Ley 25.326**, que clasifica los datos de salud como
"datos sensibles" con protección reforzada, y la normativa de la **Agencia de Acceso a la
Información Pública**). Hallazgos:

### Verificación pública de documentos (`/verificar/[codigo]`) — minimización de datos
- **✅ RESUELTO (migración 025, 2026-07-22) — minimización de datos.** La función
  `verificar_documento` ya **no expone** el DNI completo ni el contenido clínico. Ahora
  devuelve `paciente_dni_masked` (solo los últimos 3 dígitos) y **omite** el contenido.
  La página `src/app/verificar/[codigo]/page.tsx` consume la nueva forma y se quitó el
  bloque "Contenido Clínico". El nombre del paciente se mantiene (sin él la verificación
  no cumple su función).
- **✅ RESUELTO (migración 025) — hardening de la función.** `verificar_documento` ahora
  fija `SET search_path = public`, y se **revocó `EXECUTE` de PUBLIC** dejándolo solo para
  `service_role` (el rol del admin client) y `postgres`.
- **Enumeración de códigos:** `codigo_verificacion` = 12 chars hex de `md5(random())`.
  No hay rate-limiting en `/verificar`. Evaluar límite de intentos para dificultar el
  scraping/enumeración de documentos.

### Aislamiento por tenant a nivel base de datos
- **✅ RESUELTO para `estudios` (migración 026, 2026-07-22) — políticas de Storage por tenant.**
  El bucket `estudios` se creó **por migración** (privado, 10 MB, MIME pdf/jpeg/png/webp) con
  4 políticas RLS sobre `storage.objects` que **no** usan `auth.role() = 'authenticated'` a
  secas: aíslan por tenant comparando el primer segmento del path
  (`storage.foldername(name)[1]` = `medico_id`) contra `get_medico_id()`, atadas a
  `ver_historia_clinica` (el `DELETE` además exige rol médico). Además se **endurecieron las 4
  políticas de la tabla `estudios`** (antes cualquier asistente del tenant accedía; ahora
  exigen `check_permiso('ver_historia_clinica')`). Reconstruido en `schema.sql` → sección
  STORAGE. **Pendiente todavía:** los buckets `documentos` y `difusion` **no existen** (no se
  crearon en esta tanda); cuando se agreguen, versionar sus políticas con el mismo patrón.
- **RLS de tablas:** el modelo con `get_medico_id()` + `check_permiso()` está bien
  aplicado en las tablas de datos (ver `schema.sql`). Verificar dos huecos:
  - **Difusión** no tiene permiso granular: cualquier asistente vinculado ve/crea posts
    (`nav-items.ts` y RLS de `difusion_posts` no filtran por permiso). Confirmar que sea
    intencional.
  - Confirmar que `mensajes_internos` grupales no filtren datos entre asistentes de
    tenants distintos (RLS usa `medico_id = get_medico_id()`, correcto; validar en prueba).

### Autenticación, sesiones y registro
- **Auto-registro como médico:** `handle_new_user` acepta `role` desde
  `raw_user_meta_data` con whitelist `('medico','asistente')`. Cualquiera que se registre
  puede crearse como **médico** (nuevo tenant). Evaluar si el alta de médicos debe ser
  controlada/invitada. Ubicación: `supabase/migrations/014_security_fixes.sql`.
- **Rate limiter in-memory:** `src/lib/rate-limit.ts` guarda contadores en un `Map` de
  proceso. En Vercel/serverless multi-instancia **no protege** de verdad contra
  brute-force de login. Migrar a un store compartido (Upstash Redis) — el propio módulo
  ya lo anticipa en su comentario.
- **Sesiones/tokens:** sesión en cookies vía `@supabase/ssr`; `proxy.ts` valida con
  `getUser()` en cada request. Revisar expiración/refresh y flags de cookie
  (`HttpOnly`/`Secure`/`SameSite`) en el entorno productivo.

### Transporte, cabeceras y cifrado
- **En tránsito:** ya hay HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options`,
  `Referrer-Policy` y CSP en `next.config.ts`. **Endurecer CSP:** en producción sigue
  permitiendo `script-src 'unsafe-inline'`; evaluar nonces/hashes para eliminarlo.
- **En reposo:** Supabase cifra el storage/DB en reposo por defecto — documentarlo como
  control existente. Datos sensibles guardados como **base64 en columnas** (`firma_url`,
  `logo_url`, y binarios de estudios) — revisar tamaño y exposición.
- **Logs:** confirmar que `SUPABASE_SERVICE_ROLE_KEY` y datos de pacientes nunca se
  loguean (el admin client se usa en `/verificar` y en actualización de permisos).

### Residencia de datos — transferencia internacional (Ley 25.326)
- **Migrar la región de Supabase antes de producción.** El proyecto está hoy en un
  servidor de **EE.UU. (North Virginia)**. La Ley 25.326 regula la **transferencia
  internacional** de datos personales: antes de cargar el **primer paciente real** hay que
  **migrar el proyecto a una región de protección adecuada (UE)** o resolver el
  **consentimiento expreso** del paciente para la transferencia. Aplica **antes de
  producción**; en desarrollo con datos de prueba no aplica. La migración de región requiere
  **plan Pro de Supabase**. Es un bloqueante de go-live, no un pulido opcional.

### Defensa en profundidad — borrado de documentos a nivel base
- **✅ RESUELTO (migración 025, 2026-07-22).** Se dropearon las políticas RLS
  `pedidos_delete` y `certificados_delete`. Sin política de `DELETE`, Postgres niega el
  borrado aunque alguien llegue por otra vía (service role o un cliente que reintroduzca la
  llamada). El borrado físico ya estaba quitado a nivel de aplicación; esto lo cierra a nivel
  base. `schema.sql` actualizado.

### RLS huérfanas en `consultas` (hallazgo de la auditoría)
- **✅ RESUELTO (migración 025, 2026-07-22).** La auditoría de la base real encontró dos
  políticas huérfanas (`medico_full_access`, `asistente_access`) que existían solo en la base
  (no en migraciones) y daban a **cualquier asistente vinculado** acceso `ALL` a las consultas
  del tenant, salteando `check_permiso()` (rompía la regla de negocio 1 a nivel base). Se
  dropearon ambas; quedan solo las correctas (`consultas_select/insert/update/delete`).

---

## Bloque C — Estético

Unificación visual y pulido de interfaz. Detalle y ubicaciones en `DESIGN.md`
(sección "⚠ Inconsistencias a unificar").

- **Colores fuera del sistema de tokens:** `/verificar/[codigo]` (y otras vistas) usan
  clases crudas `slate-*`, `emerald-*`, `red-*`, `amber-*` en lugar de los tokens
  semánticos OKLCH. **Agregar tokens `success` / `warning` / `info`** y migrar esos usos.
- **Radios hardcodeados** (`rounded-xl`, `rounded-2xl`) conviviendo con la escala de
  tokens (`--radius-*`) en `/onboarding` y `/verificar`. Unificar a la escala.
- **Fuente mono fantasma:** `--font-mono` → `--font-geist-mono` está referenciada en
  `globals.css` pero **no se carga** en ningún layout. Cargar la fuente o quitar el token.
- **`turnos.color` (HEX `#3B82F6`)** quedó en desuso frente a las clases `.categoria-*`
  del turnero; limpiar el default o reutilizarlo coherentemente.
- **Componentes stub sin usar** (los 12 del Bloque A) ensucian `components/ui` y demás
  carpetas; eliminarlos también mejora la prolijidad visual del árbol de UI.
- **Dark mode a medias:** hay un set completo de tokens `.dark` en `globals.css` pero la
  app no expone un toggle de tema. Decidir: implementar el toggle o retirar los tokens.
- **Contraste / accesibilidad:** verificar contraste de los tintes de categoría del
  turnero (10–12% de opacidad) y de `muted-foreground` sobre `muted`, sobre todo en la
  página pública de verificación.
