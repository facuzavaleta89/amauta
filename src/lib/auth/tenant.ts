// ============================================================================
// tenant.ts — Casa ÚNICA de la resolución de tenant.
// ----------------------------------------------------------------------------
// El "tenant" es el `medico_id` efectivo de quien hace la request: su propio id si
// es médico, el `medico_id` al que está vinculado si es asistente. Es la clave de
// aislamiento de todo el proyecto (ver CLAUDE.md → Auth y roles), y hasta esta tanda
// vivía duplicada a mano en 20 sitios repartidos por 16 archivos, con cinco
// variaciones de escritura entre ellos.
//
// Módulo NEUTRO (sin 'server-only'): recibe el cliente por parámetro y solo importa
// un TIPO, así que no arrastra dependencias de servidor. Hoy lo usan Route Handlers,
// Server Components y Server Actions.
//
// ── DEVUELVE UN VALOR, NO UNA RESPUESTA ─────────────────────────────────────
// `null` significa "no se pudo resolver el tenant" y el helper NO opina sobre qué
// hacer con eso. Es deliberado: los llamadores reaccionan de cuatro formas
// distintas, todas correctas en su contexto —403 JSON en los Route Handlers,
// `redirect('/onboarding')` o `redirect('/dashboard')` en las páginas, y objetos de
// error de formas variadas en las Server Actions—. Un helper que respondiera
// `NextResponse` o hiciera `redirect()` por su cuenta no podría servir a los tres
// mundos, y unificar los destinos de redirect sería un cambio de producto, no un
// refactor.
//
// ── POR QUÉ SON DOS FUNCIONES ───────────────────────────────────────────────
// `resolverTenant` hace la query y delega en `tenantDeProfile`, así que la lógica
// vive en UN solo lugar. `tenantDeProfile` se exporta porque hay call sites que ya
// leyeron el profile por otro motivo —`pacientes/[id]/estudios/page.tsx` necesita el
// `role` para decidir si muestra el borrado (regla 10), y `mensajes/actions.ts` lee
// `acceso_mensajeria`—: ahí una query interna sería una SEGUNDA lectura de la misma
// fila.
//
// ⚠ Este helper resuelve el tenant y NADA MÁS: no chequea permisos. Los endpoints
// que además autorizan por permiso granular (consultas, estudios, turnero) siguen
// con su helper local — es la Tanda 2, que sumará el helper de permiso en esta misma
// carpeta y tendrá que reconciliarse con `lib/utils/verificar-permiso.ts`.
// ============================================================================

import type { createClient } from '@/lib/supabase/server'
import type { PermisoKey, PermisosAsistente, UserRole } from '@/types/roles'

/**
 * Cliente de **sesión** (el de `@/lib/supabase/server`), no el admin.
 *
 * ⚠ Se tipa con `Awaited<ReturnType<typeof createClient>>` y NO con el
 * `SupabaseClient` de `@supabase/supabase-js`: el factory lo construye con
 * `@supabase/ssr`, y anotarlo con el tipo de otro paquete lo ataría a una
 * dependencia que no es la que lo produce.
 */
type SupabaseSesion = Awaited<ReturnType<typeof createClient>>

/**
 * Resuelve el `medico_id` efectivo a partir de un profile YA LEÍDO. Puro, sin I/O.
 *
 * Usalo solo cuando el llamador necesita el profile para otra cosa; si no, usá
 * `resolverTenant`, que además hace la query.
 *
 * @param profile - Fila de `profiles` con al menos `role` y `medico_id`. El tipo es
 *                  ESTRUCTURAL a propósito: supabase-js no tiene tipos generados de
 *                  `Database` en este proyecto, así que el `data` de las queries
 *                  llega como `any` (ver CLAUDE.md → convenciones).
 * @param userId  - `auth.uid()` del usuario actual.
 * @returns El `medico_id` del tenant, o `null` si no se puede resolver (sin profile,
 *          rol desconocido, o asistente sin médico vinculado).
 */
export function tenantDeProfile(
  profile: { role: string | null; medico_id: string | null } | null,
  userId: string
): string | null {
  if (!profile) return null
  return profile.role === 'medico'
    ? userId
    : profile.role === 'asistente'
      ? profile.medico_id
      : null
}

/**
 * Resuelve el `medico_id` efectivo del tenant consultando `profiles`.
 *
 * Pasa por RLS (usa el cliente de sesión), pero `profiles_select_own` permite leer
 * la fila propia, así que siempre resuelve para un usuario autenticado.
 *
 * @param supabase - Cliente de sesión.
 * @param userId   - `auth.uid()` del usuario actual.
 * @returns El `medico_id` del tenant, o `null`. Ver la nota de arriba sobre por qué
 *          devuelve un valor y no una respuesta.
 */
export async function resolverTenant(
  supabase: SupabaseSesion,
  userId: string
): Promise<string | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, medico_id')
    .eq('id', userId)
    .single()

  return tenantDeProfile(profile, userId)
}

/**
 * Fila de `profiles` que proyecta `resolverAcceso`: rol, tenant y los **12**
 * permisos. Se declara para poder indexar por `PermisoKey` sin castear.
 */
type ProfileAcceso = PermisosAsistente & {
  role: UserRole
  medico_id: string | null
}

/**
 * Resultado de `resolverAcceso`: unión discriminada por `ok`.
 *
 * ⚠ **`motivo` y no `null`**, a diferencia de `resolverTenant`. La razón es
 * concreta: los llamadores necesitan distinguir **"no tiene el permiso"** de
 * **"no tiene médico vinculado"** para responder la verdad. Con un `null` que
 * colapsa las tres causas, un asistente sin `medico_id` recibía *"Sin permisos
 * para ver estudios"* — un mensaje falso, porque el permiso lo tenía.
 */
export type Acceso =
  | { ok: true; tenantMedicoId: string; role: UserRole }
  | { ok: false; motivo: 'sin-perfil' | 'sin-permiso' | 'sin-tenant' }

/**
 * Resuelve el tenant **y** chequea un permiso granular, en UNA sola query.
 *
 * Es el canon de los endpoints que hacen las dos cosas. Para los que solo
 * necesitan el tenant, `resolverTenant` sigue siendo el correcto.
 *
 * ── ORDEN DE LOS CHEQUEOS (importa) ─────────────────────────────────────────
 * perfil → **permiso** → tenant. Ese orden es parte del contrato: si el
 * resultado es `'sin-tenant'`, significa que el chequeo de permiso **ya pasó**.
 * De eso depende `verificarPermiso` (`lib/utils/verificar-permiso.ts`), que
 * pregunta solo por el permiso y trata `'sin-tenant'` como "pasa".
 *
 * ── CRITERIO DEL PERMISO: FAIL-CLOSED ───────────────────────────────────────
 * Se usa `!profile[permiso]`, **nunca `permiso === false`**. Ante un valor
 * inesperado (`null`/`undefined`) deniega en vez de permitir. Hoy las 12
 * columnas son `BOOLEAN NOT NULL DEFAULT FALSE`, así que los dos criterios
 * coinciden — pero el `=== false` sería seguro por una constraint de la base y
 * no por el código. El **médico no chequea permiso**: tiene acceso total (misma
 * regla que `check_permiso()` en la base, `schema.sql:768`).
 *
 * ── UN PERMISO O UN ARRAY (OR) ──────────────────────────────────────────────
 * `permiso` acepta una clave sola o un **array**, y con array alcanza tener
 * **CUALQUIERA** de ellos (OR, no AND). Existe para la lectura de la agenda: la
 * RLS `turnos_select` / `bloqueos_select` exige `ver_turnos OR gestionar_turnos`
 * desde las migraciones 037 y 039 —*"la agenda es una unidad de permiso"*—, y el
 * endpoint tiene que pedir lo mismo que la base.
 * ⚠ El OR **no cuesta una query extra**: el `select` de abajo ya proyecta los 12
 * permisos, así que preguntar por dos es gratis.
 * ⚠ **Sigue siendo fail-closed:** el `.some()` corre sobre `!!profile[p]`, así
 * que un array vacío deniega y un permiso `null` no habilita.
 *
 * ── NO RESPONDE, DEVUELVE ───────────────────────────────────────────────────
 * Igual que `resolverTenant`: ni `NextResponse` ni `redirect()`. Los llamadores
 * reaccionan distinto —403 JSON, 403 texto plano, `redirect('/sin-acceso')`,
 * `redirect('/dashboard')`— y esa variedad es correcta en cada contexto.
 *
 * ⚠ La proyección de permisos es **FIJA**: los 12 se listan explícitamente en el
 * `.select()`. No se interpola `permiso` en la query, a propósito — evita armar
 * el select por concatenación y hace que la forma de la query no dependa del
 * argumento.
 *
 * @param supabase - Cliente de sesión.
 * @param userId   - `auth.uid()` del usuario actual.
 * @param permiso  - Permiso granular exigido, o un **array** de permisos de los
 *                   que alcanza tener **uno** (OR). Es un parámetro y no una
 *                   constante porque hay endpoints que lo eligen en runtime (el
 *                   PATCH de consultas pide `finalizar_consultas` o
 *                   `crear_consultas` según el body — regla de negocio 1).
 */
export async function resolverAcceso(
  supabase: SupabaseSesion,
  userId: string,
  permiso: PermisoKey | PermisoKey[]
): Promise<Acceso> {
  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'role, medico_id, ' +
      'ver_pacientes, editar_pacientes, ' +
      'ver_historia_clinica, crear_consultas, finalizar_consultas, ' +
      'ver_turnos, gestionar_turnos, ' +
      'ver_pedidos, crear_pedidos, ' +
      'ver_certificados, crear_certificados, ' +
      'acceso_mensajeria'
    )
    .eq('id', userId)
    .single<ProfileAcceso>()

  if (!profile) return { ok: false, motivo: 'sin-perfil' }

  // El médico tiene acceso total; al asistente se le exige el permiso —o, con un
  // array, CUALQUIERA de los pedidos. `!!` mantiene el criterio fail-closed.
  const permisos = Array.isArray(permiso) ? permiso : [permiso]
  if (profile.role === 'asistente' && !permisos.some((p) => !!profile[p])) {
    return { ok: false, motivo: 'sin-permiso' }
  }

  const tenantMedicoId = tenantDeProfile(profile, userId)
  if (!tenantMedicoId) return { ok: false, motivo: 'sin-tenant' }

  return { ok: true, tenantMedicoId, role: profile.role }
}
