/**
 * In-memory sliding window rate limiter.
 *
 * Suitable for single-instance deployments. If the app ever scales to multiple
 * instances, swap the `store` Map for an Upstash Redis client and this module's
 * public API stays the same.
 *
 * Usage (Route Handler):
 *   const { success, remaining, retryAfter } = await rateLimit(request, { key: userId, limit: 30, windowMs: 60_000 })
 *   if (!success) return rateLimitResponse(retryAfter)
 *
 * Usage (Server Action):
 *   const { success, retryAfter } = await rateLimitAction({ key: `login:${email}`, limit: 10, windowMs: 15 * 60_000 })
 *   if (!success) return { error: `Demasiados intentos. Intentá de nuevo en ${Math.ceil(retryAfter! / 60)} min.` }
 */

import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'

interface WindowEntry {
  timestamps: number[]
  lastCleanup: number
}

// Module-level store — persists across requests within the same process
const store = new Map<string, WindowEntry>()

// Cleanup stale entries every 5 minutes to prevent unbounded memory growth
const GLOBAL_CLEANUP_INTERVAL = 5 * 60 * 1000
let lastGlobalCleanup = Date.now()

function evictStaleEntries(windowMs: number) {
  const now = Date.now()
  if (now - lastGlobalCleanup < GLOBAL_CLEANUP_INTERVAL) return
  lastGlobalCleanup = now

  for (const [key, entry] of store) {
    const cutoff = now - windowMs
    if (entry.timestamps.length === 0 || entry.timestamps[entry.timestamps.length - 1] < cutoff) {
      store.delete(key)
    }
  }
}

interface RateLimitOptions {
  /** Unique identifier for this counter (e.g. userId, `ip:email`) */
  key: string
  /** Max requests allowed inside the window */
  limit: number
  /** Window size in milliseconds */
  windowMs: number
}

interface RateLimitResult {
  success: boolean
  /** Remaining requests in the current window */
  remaining: number
  /** Milliseconds until the oldest request expires (only when success=false) */
  retryAfter?: number
}

/**
 * Core sliding window check — framework-agnostic.
 */
export function checkRateLimit({ key, limit, windowMs }: RateLimitOptions): RateLimitResult {
  evictStaleEntries(windowMs)

  const now = Date.now()
  const cutoff = now - windowMs

  let entry = store.get(key)
  if (!entry) {
    entry = { timestamps: [], lastCleanup: now }
    store.set(key, entry)
  }

  // Remove timestamps outside the current window (O(n) but n is tiny here)
  entry.timestamps = entry.timestamps.filter(ts => ts > cutoff)

  if (entry.timestamps.length >= limit) {
    // Oldest timestamp tells us when the window will slide enough to allow a new req
    const oldest = entry.timestamps[0]
    const retryAfter = oldest + windowMs - now
    return { success: false, remaining: 0, retryAfter }
  }

  entry.timestamps.push(now)
  return { success: true, remaining: limit - entry.timestamps.length }
}

/**
 * Read the real client IP from common proxy headers.
 * Next.js / Vercel populates `x-forwarded-for`; local dev uses the socket IP.
 */
export function getIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

/**
 * Read IP inside a Server Action (uses `next/headers` instead of the Request object).
 */
export async function getIpFromHeaders(): Promise<string> {
  const h = await headers()
  return (
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip') ||
    'unknown'
  )
}

/**
 * Build a standardised 429 JSON response for Route Handlers.
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
 * Convenience wrapper for **Route Handlers**.
 *
 * @example
 * const limited = rateLimit(request, { key: userId, limit: 30, windowMs: 60_000 })
 * if (!limited.success) return rateLimitResponse(limited.retryAfter!)
 */
export function rateLimit(
  _request: NextRequest,
  options: RateLimitOptions
): RateLimitResult {
  return checkRateLimit(options)
}

/**
 * Convenience wrapper for **Server Actions**.
 * Returns the result so the action can return an error message directly.
 */
export async function rateLimitAction(options: RateLimitOptions): Promise<RateLimitResult> {
  return checkRateLimit(options)
}
