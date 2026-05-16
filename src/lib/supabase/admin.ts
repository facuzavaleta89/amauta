import { createClient } from '@supabase/supabase-js'

/**
 * Admin client with SERVICE_ROLE key.
 * ⚠️  ONLY use in server-side code (API Routes, Server Actions).
 * NEVER import this in 'use client' components.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      '[createAdminClient] Faltan variables de entorno críticas: ' +
      'NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY no están definidas.'
    )
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
