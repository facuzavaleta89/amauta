import { createClient } from '@supabase/supabase-js'

/**
 * Admin client with SERVICE_ROLE key.
 * ⚠️  ONLY use in server-side code (API Routes, Server Actions).
 * NEVER import this in 'use client' components.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
