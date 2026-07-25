/**
 * Rate limiter respaldado por Postgres (Supabase).
 *
 * El conteo vive en la tabla `public.rate_limits` y se incrementa de forma ATÓMICA
 * vía la función `check_rate_limit(p_key, p_limit, p_window_secs)` (migración 031).
 * Esto reemplaza al viejo `Map` en memoria, que en Vercel serverless no compartía los
 * contadores entre instancias (no había protección real de fuerza bruta).
 *
 * Se llama con el ADMIN CLIENT (service role) porque:
 *   · la función solo la puede ejecutar `service_role` (GRANT de la 031), y
 *   · el login/registro ocurren SIN sesión, así que no hay un cliente de usuario que usar.
 *
 * FAIL-OPEN: si la RPC falla o tarda más que RPC_TIMEOUT_MS, se PERMITE el request y se
 * loguea. Si la tabla de rate limiting no responde, la base de auth tampoco, así que el
 * login ya estaría caído; fail-closed convertiría un problema puntual en una caída total.
 *
 * Migrar a Redis en el futuro sería reescribir SOLO este módulo, sin tocar a los ~25
 * llamadores (la interfaz pública se mantiene).
 *
 * Usage (Route Handler):
 *   const rl = await rateLimit(request, { key: `pedidos_post:${userId}`, limit: 30, windowMs: 60_000 })
 *   if (!rl.success) return rateLimitResponse(rl.retryAfter!)
 *
 * Usage (Server Action):
 *   const { success, retryAfter } = await rateLimitAction({ key: `login:${ip}:${email}`, limit: 5, windowMs: 60_000 })
 *   if (!success) return { error: `Demasiados intentos. Reintentá en ${Math.ceil(retryAfter! / 60000)} min.` }
 */

import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

/** Tiempo máximo que esperamos a la RPC antes de fail-open (ver arriba). */
const RPC_TIMEOUT_MS = 2000

interface RateLimitOptions {
  /** Identificador único del contador. SIEMPRE con prefijo por tipo (ej. `login:`, `verificar:`). */
  key: string
  /** Máximo de requests permitidos dentro de la ventana */
  limit: number
  /** Tamaño de la ventana en milisegundos */
  windowMs: number
}

interface RateLimitResult {
  success: boolean
  /** Requests restantes en la ventana actual (best-effort: la RPC no expone el conteo exacto) */
  remaining: number
  /** Milisegundos hasta que la ventana permita un nuevo request (solo cuando success=false) */
  retryAfter?: number
}

/** Forma de una fila devuelta por la RPC check_rate_limit. */
interface CheckRateLimitRow {
  allowed: boolean
  retry_after_secs: number
}

/**
 * Chequeo central contra Postgres. Devuelve `success=true` (permitido) tanto cuando la
 * base autoriza como cuando algo falla (FAIL-OPEN). El `retryAfter` va en MILISEGUNDOS
 * (la interfaz pública no cambió; la RPC trabaja en segundos y acá se convierte).
 */
export async function checkRateLimit({ key, limit, windowMs }: RateLimitOptions): Promise<RateLimitResult> {
  const windowSecs = Math.max(1, Math.ceil(windowMs / 1000))

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .rpc('check_rate_limit', { p_key: key, p_limit: limit, p_window_secs: windowSecs })
      .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS))

    if (error) throw error

    const row = (Array.isArray(data) ? data[0] : data) as CheckRateLimitRow | undefined
    if (!row) throw new Error('check_rate_limit devolvió una respuesta vacía')

    if (row.allowed) {
      return { success: true, remaining: Math.max(0, limit) }
    }
    return { success: false, remaining: 0, retryAfter: (row.retry_after_secs ?? 0) * 1000 }
  } catch (err) {
    // FAIL-OPEN: nunca tiramos abajo un flujo legítimo por un problema de infraestructura.
    console.error('[rate-limit] fail-open — la RPC check_rate_limit falló para la key', key, ':', err)
    return { success: true, remaining: limit }
  }
}

/**
 * IP del cliente desde los headers que Vercel/Next populan.
 * Vercel setea SIEMPRE `x-forwarded-for` (el cliente no lo puede falsificar: Vercel lo
 * sobreescribe en el edge). `x-real-ip` es el fallback.
 * Si no hay ninguno (solo ocurre fuera de Vercel, p. ej. dev local o un runtime raro),
 * devuelve `'unknown'`: esos requests comparten una cubeta. Es aceptable porque (a) no es
 * un entorno expuesto a ataques, y (b) el login igual diferencia por email en la key.
 */
export function getIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    'unknown'
  )
}

/**
 * Igual que `getIp` pero dentro de un Server Action / Server Component (usa `next/headers`).
 */
export async function getIpFromHeaders(): Promise<string> {
  const h = await headers()
  return (
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip')?.trim() ||
    'unknown'
  )
}

/**
 * Respuesta 429 estándar para Route Handlers.
 */
export function rateLimitResponse(retryAfterMs: number): NextResponse {
  const retryAfterSecs = Math.ceil(retryAfterMs / 1000)
  return NextResponse.json(
    { error: `Demasiadas solicitudes. Intentá de nuevo en ${retryAfterSecs} segundos.` },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSecs),
        'X-RateLimit-Limit': '0',
      },
    }
  )
}

/**
 * Wrapper para **Route Handlers**. Async (hace I/O a la base).
 *
 * @example
 * const rl = await rateLimit(request, { key: `pedidos_post:${userId}`, limit: 30, windowMs: 60_000 })
 * if (!rl.success) return rateLimitResponse(rl.retryAfter!)
 */
export async function rateLimit(
  _request: NextRequest,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  return checkRateLimit(options)
}

/**
 * Wrapper para **Server Actions**. Devuelve el resultado para que la action arme su mensaje.
 */
export async function rateLimitAction(options: RateLimitOptions): Promise<RateLimitResult> {
  return checkRateLimit(options)
}
