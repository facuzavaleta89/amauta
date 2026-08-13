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
