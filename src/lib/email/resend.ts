// ============================================================================
// resend.ts — Cliente de Resend y envío de un email individual.
// ----------------------------------------------------------------------------
// ⚠ SOLO SERVIDOR. Usa RESEND_API_KEY (secreta). Nunca importar desde 'use client'.
//
// ⚠ REMITENTE / SANDBOX: el `from` sale de RESEND_FROM (fallback 'onboarding@resend.dev').
//   En el SANDBOX de Resend (sin dominio verificado) solo se entrega a la casilla dueña
//   de la cuenta; el envío real a los emails de los pacientes requiere VERIFICAR UN
//   DOMINIO en Resend (registros DNS) y setear RESEND_FROM con una dirección de ese dominio.
//
// ⚠ INSTANCIACIÓN PEREZOSA (a propósito): el cliente se crea en el PRIMER ENVÍO, no al
//   importar el módulo. Antes se instanciaba (y se lanzaba si faltaba la key) en el nivel
//   superior, y eso ROMPÍA EL BUILD: `next build` importa este módulo al recolectar los
//   datos de /api/difusion/enviar, así que sin RESEND_API_KEY el build entero fallaba
//   ("Failed to collect page data for /api/difusion/enviar") por una feature secundaria.
//   Ahora la falta de la key solo rompe el envío, en el momento de enviar.
// ============================================================================

import { Resend } from 'resend'

/** Mensaje único de key faltante: lo comparten el throw interno y el resultado de sendEmail. */
const MISSING_KEY_ERROR =
  '[email/resend] RESEND_API_KEY no está definida. Configurala en .env.local (dev) y en las variables de entorno del deploy.'

/** Cliente memoizado. Se crea una sola vez, en el primer envío. */
let client: Resend | null = null

/**
 * Devuelve el cliente de Resend, creándolo la primera vez. Lanza (con mensaje claro) si
 * falta RESEND_API_KEY. El error queda contenido en el flujo de envío: `sendEmail` lo
 * captura y lo devuelve como `{ ok: false, error }`, nunca escapa al importar el módulo.
 */
function getResendClient(): Resend {
  if (client) return client

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error(MISSING_KEY_ERROR)
  }

  client = new Resend(apiKey)
  return client
}

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
 * La key faltante entra por la misma puerta: se reporta como `{ ok: false, error }` con
 * el mensaje explicativo, no como una excepción hacia arriba.
 */
export async function sendEmail(params: {
  to: string
  subject: string
  html: string
}): Promise<SendEmailResult> {
  try {
    const resend = getResendClient()

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
