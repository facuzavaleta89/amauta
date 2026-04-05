import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const admin = createAdminClient()

  // get user from profiles
  const { data: profiles, error: pError } = await admin
    .from('profiles')
    .select('id, role, full_name, medico_id')
    .order('created_at', { ascending: false })
    .limit(5)

  // get users from auth
  const { data: users, error: uError } = await admin.auth.admin.listUsers()

  return NextResponse.json({
    profiles,
    pError,
    users: users?.users?.slice(0, 5).map(u => ({
      id: u.id,
      email: u.email,
      meta: u.user_metadata,
      created_at: u.created_at
    })),
    uError,
  })
}
