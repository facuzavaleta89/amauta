// ============================================================================
// difusion-template.ts — HTML simple para el email de un comunicado de difusión.
// ----------------------------------------------------------------------------
// Sin dependencias de plantillas (no @react-email): string HTML con estilos inline
// mínimos, legible en la mayoría de clientes de email. TODOS los campos que provienen
// del médico se escapan con escapeHtml para no romper el markup ni permitir inyección.
// ============================================================================

import { escapeHtml } from '@/lib/utils'

interface DifusionEmailData {
  titulo: string
  contenido: string
  asunto?: string | null
}

/**
 * Devuelve el HTML del email. `contenido` es texto plano del médico: se escapa y luego
 * se convierten los saltos de línea reales en <br> (en ese orden, para que un "<br>"
 * tecleado por el usuario quede como texto y no como etiqueta).
 */
export function renderDifusionEmailHtml({ titulo, contenido }: DifusionEmailData): string {
  const safeTitulo = escapeHtml(titulo)
  const safeContenido = escapeHtml(contenido).replace(/\r?\n/g, '<br>')

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitulo}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e2d24;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f5;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8e5;">
          <tr>
            <td style="background-color:#3d7a5c;padding:20px 28px;">
              <h1 style="margin:0;font-size:18px;line-height:1.4;color:#ffffff;font-weight:700;">${safeTitulo}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;font-size:15px;line-height:1.7;color:#334036;">
              ${safeContenido}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px;background-color:#f4f6f5;border-top:1px solid #e2e8e5;font-size:12px;line-height:1.6;color:#6b7c72;text-align:center;">
              Este es un comunicado de tu consultorio.
              <!-- TODO opt-out (Ley 25.326): agregar acá el enlace de baja / preferencias del paciente. -->
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
