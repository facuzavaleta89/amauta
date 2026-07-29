import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV === 'development'

const securityHeaders = [
  // Previene que el browser interprete archivos con un MIME type distinto al declarado
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Evita que la app sea embebida en un iframe (clickjacking)
  { key: 'X-Frame-Options', value: 'DENY' },
  // Fuerza HTTPS por 1 año e incluye subdominios
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  // Controla qué información se envía en el header Referer
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Restringe acceso a APIs sensibles del browser (remueve interest-cohort deprecado por browsing-topics)
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  },
  // Content Security Policy — dinámico para desarrollo y producción
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Supabase realtime + API
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      // En desarrollo Turbopack/HMR necesitan unsafe-eval; en producción se remueve por completo
      isDev
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self' 'unsafe-inline'",
      // Estilos propios + inline. 'unsafe-inline' es IRREDUCTIBLE: Radix escribe
      // atributos style="" para posicionar popovers/selects/diálogos y los nonces
      // NO aplican a atributos style (solo a elementos <style>/<script>).
      "style-src 'self' 'unsafe-inline'",
      // Inter la auto-hostea next/font en build time (/_next/static/media/*.woff2):
      // no se pega al CDN de Google, así que no hace falta el CDN de Google Fonts.
      // ⚠ data: ES NECESARIO — NO QUITAR: FullCalendar inyecta su CSS por JS con la
      // fuente de íconos `fcicons` EMBEBIDA como data:application/x-font-ttf. Sin
      // data: el turnero pierde los íconos (violación real vista en producción).
      "font-src 'self' data:",
      // Imágenes propias + data: (QR generado con qrcode, firma/logo en base64) +
      // blob:. Storage NO va acá: los archivos se sirven por proxy same-origin
      // (/api/estudios/[id]), el navegador nunca pega a Supabase por imágenes.
      "img-src 'self' data: blob:",
      // Previene que la app sea embebida en frames externos
      "frame-ancestors 'none'",
      // No hay <object>/<embed> en la app; sin esto heredarían 'self' de default-src
      "object-src 'none'",
      // base-uri y form-action NO heredan de default-src: sin declararlas quedan
      // abiertas. Cierran inyección de <base> y posteo de formularios a terceros.
      "base-uri 'self'",
      "form-action 'self'",
      // Solo en producción: en dev se entra por IP de LAN sobre HTTP
      // (ver allowedDevOrigins) y esto forzaría https, rompiendo ese acceso.
      ...(isDev ? [] : ['upgrade-insecure-requests']),
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  reactCompiler: true,
  allowedDevOrigins: ['192.168.1.114', 'localhost'],
  async headers() {
    return [
      {
        // Aplica a todas las rutas
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
