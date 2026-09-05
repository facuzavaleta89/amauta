import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Resultado de `verificarPacienteDelTenant`.
 *
 * ⚠ Es una unión discriminada con un `motivo`, no un booleano: las dos causas de rechazo
 * necesitan respuestas HTTP distintas (404 vs 409) y mensajes distintos. Mismo criterio
 * que `resolverAcceso` (`lib/auth/tenant.ts`) — ver el ⚠ de abajo.
 */
export type PacienteVerificado =
  | { ok: true }
  | { ok: false; motivo: 'no-encontrado' | 'archivado' }

/**
 * ¿Este paciente es del tenant y admite escritura?
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * ⚠⚠ **La validación de TENANT no la hace nadie más.** La RLS de `turnos` solo mira
 * `medico_id` (el del TURNO), y `turnos_paciente_id_fkey` referencia `pacientes(id)` **sin
 * filtrar tenant**: aceptaría el id de un paciente de OTRO consultorio. Sin este chequeo,
 * un endpoint que acepte `paciente_id` del cliente permite asignarle a un turno propio un
 * paciente ajeno — es una fuga de aislamiento, no un detalle de UX.
 *
 * El segundo chequeo es la **regla de negocio 9**: un paciente archivado no admite
 * escritura.
 *
 * ── CÓMO, Y POR QUÉ ASÍ ─────────────────────────────────────────────────────
 * - **Admin client (bypass RLS), no el de sesión.** Quien gestiona la agenda puede no tener
 *   `ver_pacientes`: con el cliente de sesión la RLS le escondería la fila y el chequeo
 *   devolvería un falso *"no existe"* para un paciente que sí es del tenant.
 * - **`.eq('creado_por', tenantMedicoId)` es lo que lo convierte en validación de TENANT**
 *   y no en simple existencia. Sin ese `.eq` el fetch no sirve para nada, porque con el
 *   admin client **todas** las filas son visibles.
 *
 * ⚠ **Devuelve un valor, no una `NextResponse`.** Cada llamador redacta su propio mensaje:
 * el del turnero habla de agendar, el de pedidos de emitir documentos. Unificar los textos
 * sería un cambio de producto, no un refactor. Mismo criterio que `resolverAcceso`.
 *
 * ⚠ **Módulo SOLO-SERVIDOR**: importa el admin client (service role). No importarlo desde
 * un componente `'use client'`.
 *
 * ⚠ Los POST de `pedidos`, `certificados` y `consultas` tienen este mismo chequeo **inline**
 * (son el patrón que este helper generaliza). **No se migraron en esta tanda** —quedaba
 * fuera de alcance— pero son los candidatos naturales si alguien vuelve por acá.
 *
 * @param pacienteId     - El paciente a verificar.
 * @param tenantMedicoId - Tenant ya resuelto por el llamador (`resolverAcceso`).
 */
export async function verificarPacienteDelTenant(
  pacienteId: string,
  tenantMedicoId: string
): Promise<PacienteVerificado> {
  const admin = createAdminClient()

  const { data: paciente, error } = await admin
    .from('pacientes')
    .select('archivado_at')
    .eq('id', pacienteId)
    .eq('creado_por', tenantMedicoId)
    .single<{ archivado_at: string | null }>()

  // Un `error` acá incluye el caso "0 filas" de `.single()`, que es justamente el que
  // interesa: no existe, o no es de este tenant. Los dos colapsan a 'no-encontrado' a
  // propósito — distinguirlos le confirmaría a un llamador que un id ajeno existe.
  if (error || !paciente) {
    return { ok: false, motivo: 'no-encontrado' }
  }

  if (paciente.archivado_at) {
    return { ok: false, motivo: 'archivado' }
  }

  return { ok: true }
}
