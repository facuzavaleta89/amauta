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
      // Estilos propios + inline (requerido por muchos frameworks UI)
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Fuentes de Google Fonts si las usás
      "font-src 'self' https://fonts.gstatic.com",
      // Imágenes: propias + Supabase Storage
      "img-src 'self' data: blob: https://*.supabase.co",
      // Previene que la app sea embebida en frames externos
      "frame-ancestors 'none'",
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
