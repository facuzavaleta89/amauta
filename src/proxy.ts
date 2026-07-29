import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const publicRoutes = ['/login', '/registro', '/callback', '/verificar']

/**
 * CSP de ENSAYO (Fase 1b) — se emite como `Content-Security-Policy-Report-Only`:
 * el navegador REPORTA las violaciones pero NO bloquea nada.
 *
 * Copia directiva por directiva la CSP de enforcement de `next.config.ts`, salvo
 * `script-src`, que es lo único que se está ensayando: nonce + 'strict-dynamic',
 * SIN 'unsafe-inline' y SIN 'unsafe-eval'. El enforcement real (sacar de verdad
 * 'unsafe-inline' de la CSP de `next.config.ts`) es una fase futura.
 *
 * ⚠ A propósito NO lleva `report-uri` ni `report-to`: las violaciones se leen en
 * la consola del navegador. No hay endpoint de reportes.
 */
function buildReportOnlyCsp(nonce: string): string {
  return [
    "default-src 'self'",
    // Supabase realtime + API
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    // ── Lo ÚNICO que difiere del enforcement ──────────────────────────────────
    // 'strict-dynamic' hace que los navegadores que lo soportan IGNOREN 'self' y
    // confíen solo en lo que cuelga de un script nonceado (así los chunks que
    // carga el runtime de Next quedan permitidos sin listarlos). 'self' se deja
    // como fallback para los navegadores que no soportan 'strict-dynamic'.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // 'unsafe-inline' es IRREDUCTIBLE (atributos style="" de Radix, que los nonces
    // no cubren) → no se ensaya sacarlo, se copia igual que en el enforcement.
    "style-src 'self' 'unsafe-inline'",
    // data: necesario por la fuente `fcicons` embebida de FullCalendar
    "font-src 'self' data:",
    // data: por el QR y la firma/logo en base64
    "img-src 'self' data: blob:",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Ignorada por especificación en modo report-only; se incluye solo para que
    // la política de ensayo sea literalmente paralela a la de enforcement.
    'upgrade-insecure-requests',
  ].join('; ')
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Nonce único por request (patrón oficial de Next, ver docs de CSP).
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const cspReportOnly = buildReportOnlyCsp(nonce)

  // Next inyecta `nonce="..."` en los <script> que genera leyendo la CSP de los
  // REQUEST headers (acepta tanto la de enforcement como la report-only), así que
  // el nonce tiene que viajar en el request, no solo en la respuesta.
  //
  // ⚠ Se rearma en CADA NextResponse.next() en vez de snapshotear los headers una
  // sola vez: el refresh de sesión de Supabase muta `request.cookies` (y con eso
  // el header Cookie) y esa mutación tiene que viajar en el mismo request. Es el
  // equivalente exacto del `NextResponse.next({ request })` previo, más el nonce.
  const nextWithNonce = () => {
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-nonce', nonce)
    requestHeaders.set('Content-Security-Policy-Report-Only', cspReportOnly)
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  let response = nextWithNonce()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = nextWithNonce()
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Verificar sesión (optimistic check desde cookie)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Rutas públicas (login, registro, auth callbacks)
  const isPublicRoute = publicRoutes.some((r) => pathname.startsWith(r))

  // Si no está autenticado y la ruta requiere auth → /login
  if (!user && !isPublicRoute) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Si está autenticado y trata de ir a rutas públicas (login/registro) o a la raíz → /dashboard
  if (user && (isPublicRoute || pathname === '/')) {
    // Evitar loop si la ruta pública es el callback en sí mismo, pero usualmente login/registro alcanza
    if (!pathname.startsWith('/callback')) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  // Cabecera de ensayo en la respuesta que efectivamente renderiza HTML. Los
  // redirects de arriba no la llevan: no tienen documento donde aplicar la CSP.
  response.headers.set('Content-Security-Policy-Report-Only', cspReportOnly)

  return response
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.png$|.*\\.jpg$).*)',
  ],
}
