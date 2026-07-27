// ============================================================================
// resend.ts — Cliente de Resend y envío de un email individual.
// ----------------------------------------------------------------------------
// ⚠ SOLO SERVIDOR. Usa RESEND_API_KEY (secreta). Nunca importar desde 'use client'.
//
// ⚠ REMITENTE / SANDBOX: el `from` sale de RESEND_FROM (fallback 'onboarding@resend.dev').
//   En el SANDBOX de Resend (sin dominio verificado) solo se entrega a la casilla dueña
//   de la cuenta; el envío real a los emails de los pacientes requiere VERIFICAR UN
//   DOMINIO en Resend (registros DNS) y setear RESEND_FROM con una dirección de ese dominio.
// ============================================================================

import { Resend } from 'resend'

const apiKey = process.env.RESEND_API_KEY
if (!apiKey) {
  // Falla temprano y clara: sin API key no hay forma de enviar. Preferimos romper al
  // cargar el módulo (primer request que lo importe) antes que fallar en silencio.
  throw new Error(
    '[email/resend] RESEND_API_KEY no está definida. Configurala en .env.local (dev) y en las variables de entorno del deploy.',
  )
}

/** Cliente Resend instanciado (service-side). */
export const resend = new Resend(apiKey)

/** Dirección remitente. Configurable por env; fallback al sandbox de Resend. */
export const EMAIL_FROM = process.env.RESEND_FROM || 'onboarding@resend.dev'

/** Resultado tipado de un envío individual. Nunca lanza: el error se captura por destinatario. */
export interface SendEmailResult {
  ok: boolean
  error?: string
}

/**
 * Envía UN email. Devuelve `{ ok, error? }` en vez de lanzar, para poder registrar el
 * resultado por destinatario (un fallo individual no debe cortar el loop de envío).
 */
export async function sendEmail(params: {
  to: string
  subject: string
  html: string
}): Promise<SendEmailResult> {
  try {
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
    })

    if (error) {
      return { ok: false, error: error.message || error.name || 'Error de Resend' }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido al enviar el email' }
  }
}
