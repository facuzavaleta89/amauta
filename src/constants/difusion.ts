// ============================================================================
// difusion.ts — Constantes compartidas del módulo de difusión.
// ----------------------------------------------------------------------------
// Módulo NEUTRO (sin imports, sin 'server-only', sin deps de servidor): lo importan
// tanto el Route Handler del envío como el Client Component del modal, para que
// cliente y servidor usen SIEMPRE el mismo valor.
// ============================================================================

/**
 * Tope de envíos de difusión por día y por tenant (free tier de Resend).
 *
 * ⚠ FUENTE ÚNICA. Antes el 100 estaba duplicado en dos constantes independientes
 * (`DAILY_LIMIT` en el endpoint y `LIMITE_DIARIO` en el modal): si se cambiaba una
 * sola, divergían en silencio y el modal habilitaba envíos que el servidor rechazaba
 * (o al revés). Cambiar el plan de Resend = cambiar este número, acá y solo acá.
 *
 * Consumidores: `src/app/api/difusion/enviar/route.ts` (corta con 429 si el envío lo
 * superaría) y `src/components/difusion/enviar-modal.tsx` (avisa y deshabilita el botón).
 */
export const DIFUSION_LIMITE_DIARIO = 100
