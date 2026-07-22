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

### Esquema sin migración fuente (reproducibilidad)
Estos objetos existen en Supabase pero **no tienen `CREATE`/`ALTER` en
`supabase/migrations/`** (se aplicaron directo en el dashboard). Un entorno nuevo
levantado solo desde migraciones quedaría incompleto. Crear las migraciones faltantes:
- Tabla **`consultas`** completa (reconstruida en `schema.sql` desde `types/consulta.ts`).
  Su columna `campos_extra` **sí** tiene fuente (migración `022`); el resto de la tabla no.
- Tabla **`notificaciones`** completa: existe en la base y se usa en el código
  (`notificaciones/page.tsx`, `api/turnero`, `api/cron/recordatorios`) pero **no** tiene
  `CREATE` en migraciones ni figura en `schema.sql` (solo una nota ⚠ Verificar). Crear la migración.
- Columnas de Bloque 4 en **`turnos`**: `categoria`, `origen`, `consulta_id`.
- Columnas en **`profiles`**: `titulo`, `matriculas` (jsonb), `logo_url`.
- **Migración vacía:** `supabase/migrations/20260326204733_fix_rls_recursion.sql`
  tiene **0 bytes**. Completarla con su contenido real o eliminarla del historial.

### Desajustes tipo TypeScript ↔ esquema DB
(No corregidos por consigna; anotados para revisión.)
- **`TurnoEstado` incluye `'pendiente_confirmar'`** que **no existe en el ENUM
  `turno_estado`** de la DB (solo 6 valores). Aparece en `src/types/turno.ts:6` y en
  `src/lib/validations/turno.schema.ts:30,109`. Riesgo: insertar ese estado podría
  fallar contra el ENUM. Decidir si se agrega el valor al ENUM o se elimina del código.
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
- **13 componentes stub** `export default function Placeholder(){return null}`, sin
  imports en ningún lado: `turnero/turno-card`, `pacientes/{patient-tabs, evolucion-charts,
  estudios-upload}`, `dashboard/weekly-calendar`, `shared/{role-guard, loading-spinner,
  file-preview, confirm-dialog, error-boundary}`, `difusion/{post-editor, send-modal}`,
  `lib/pdf/receta-template`. Eliminarlos o implementarlos.
  (`difusion/post-list.tsx` **ya se implementó** — era el 14.º stub.)
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
- La página usa **admin client (bypass RLS)** y la función `verificar_documento`
  (`SECURITY DEFINER`) para exponer, **sin autenticación**, a cualquiera con el código:
  **DNI completo del paciente**, nombre completo y **contenido clínico completo** del
  documento. Evaluar minimización: enmascarar el DNI (p. ej. mostrar solo últimos
  dígitos), y revisar si el contenido clínico debe mostrarse íntegro públicamente.
  Ubicación: `src/app/verificar/[codigo]/page.tsx`, `supabase/migrations/018_qr_verificacion.sql`.
- **Hardening de la función:** `verificar_documento` es `SECURITY DEFINER` pero **no fija
  `SET search_path`** (a diferencia del resto de funciones DEFINER del proyecto).
  Agregar `SET search_path = public` para evitar secuestro de `search_path`.
- **Enumeración de códigos:** `codigo_verificacion` = 12 chars hex de `md5(random())`.
  No hay rate-limiting en `/verificar`. Evaluar límite de intentos para dificultar el
  scraping/enumeración de documentos.

### Aislamiento por tenant a nivel base de datos
- **Storage (buckets `estudios` / `documentos` / `difusion`):** las políticas de Storage
  **no están versionadas** en migraciones (la migración 003 las deja como nota manual del
  dashboard) y la nota sugiere permitir `SELECT` con `auth.role() = 'authenticated'`. Si
  quedó así, **cualquier usuario autenticado de otro tenant** podría descargar archivos
  conociendo el `storage_path`. Auditar y restringir las políticas de Storage por tenant.
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
- **Revocar las políticas RLS `pedidos_delete` y `certificados_delete`.** El borrado físico
  de pedidos y certificados ya se quitó **a nivel de aplicación** (se eliminaron los handlers
  `DELETE` de `api/pedidos/[id]` y `api/certificados/[id]`, y los botones de la UI: ahora solo
  se **anulan**). Pero las políticas **`pedidos_delete` / `certificados_delete` siguen
  existiendo** en la base (migraciones `006` / `007`). Revocarlas (`DROP POLICY`) como defensa
  en profundidad, para que Postgres niegue el `DELETE` aunque alguien llegue por otra vía
  (p. ej. el service role o un cliente que reintroduzca la llamada). Requiere una migración nueva.

### Minimización en la verificación pública (ya listada arriba)
- Ver "Verificación pública de documentos — minimización de datos" al inicio de este bloque:
  enmascarar DNI y revisar exposición del contenido clínico íntegro sin autenticación. Sigue
  vigente y es un pulido de seguridad prioritario (dato sensible de salud, Ley 25.326).

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
- **Componentes stub sin usar** (los 13 del Bloque A) ensucian `components/ui` y demás
  carpetas; eliminarlos también mejora la prolijidad visual del árbol de UI.
- **Dark mode a medias:** hay un set completo de tokens `.dark` en `globals.css` pero la
  app no expone un toggle de tema. Decidir: implementar el toggle o retirar los tokens.
- **Contraste / accesibilidad:** verificar contraste de los tintes de categoría del
  turnero (10–12% de opacidad) y de `muted-foreground` sobre `muted`, sobre todo en la
  página pública de verificación.
