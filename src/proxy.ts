import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const publicRoutes = ['/login', '/registro', '/callback']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  let response = NextResponse.next({
    request,
  })

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
          response = NextResponse.next({ request })
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

  return response
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.png$|.*\\.jpg$).*)',
  ],
}
