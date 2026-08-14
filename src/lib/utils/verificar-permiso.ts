import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolverAcceso } from '@/lib/auth/tenant'
import type { PermisoKey } from '@/types/roles'

/**
 * Verifica server-side si el usuario actual tiene el permiso dado.
 * - Médicos: siempre tienen acceso.
 * - Asistentes: se verifica el campo booleano en profiles.
 * - No autenticado: redirige a /login.
 *
 * Si no tiene permiso, redirige a /sin-acceso.
 *
 * Uso en page.tsx:
 *   await verificarPermiso('ver_pacientes')
 *
 * ── IMPLEMENTADA SOBRE `resolverAcceso` ─────────────────────────────────────
 * La firma y el comportamiento no cambiaron; lo que cambió es que el chequeo ya
 * no está duplicado acá, sino que sale del canon de `lib/auth/tenant.ts`. Eso
 * unificó de paso el criterio: antes esta función exigía `permiso === true` y el
 * canon usa `!permiso`. Son equivalentes para las columnas reales
 * (`BOOLEAN NOT NULL DEFAULT FALSE`), así que no hay cambio de comportamiento.
 *
 * ⚠ **`sin-tenant` NO es un fallo acá, y no es un descuido.** Esta función
 * pregunta *"¿tiene el permiso?"*, no *"¿tiene médico vinculado?"* — nunca leyó
 * `medico_id`. Un asistente con el permiso pero sin médico vinculado **pasaba**
 * antes y **tiene que seguir pasando** (es la página la que decide qué hacer con
 * la falta de tenant; varias redirigen a `/dashboard`, no a `/sin-acceso`).
 * Que esto se pueda expresar limpio depende del **orden de chequeos del canon**:
 * `resolverAcceso` valida perfil → permiso → tenant, así que un `'sin-tenant'`
 * garantiza que el permiso YA pasó. Si algún día se invirtiera ese orden, esta
 * función se rompe en silencio.
 */
export async function verificarPermiso(permiso: PermisoKey): Promise<void> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const acceso = await resolverAcceso(supabase, user.id, permiso)

  // 'sin-tenant' se ignora a propósito: ver la nota del JSDoc.
  if (!acceso.ok && acceso.motivo === 'sin-perfil') {
    redirect('/login')
  }
  if (!acceso.ok && acceso.motivo === 'sin-permiso') {
    redirect('/sin-acceso')
  }
}
