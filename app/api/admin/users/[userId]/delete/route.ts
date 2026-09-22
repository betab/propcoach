// app/api/admin/users/[userId]/delete/route.ts
// super_admin only — permanently deletes a user via auth.admin.deleteUser().
// Cascades through profiles, accounts, entries, and payouts automatically
// (all FK'd to auth.users or accounts with ON DELETE CASCADE — see
// supabase/migrations/001_initial.sql) — no separate cleanup queries
// needed. Refuses to let a super_admin delete their own account: this is
// the only account with that role until another is promoted on /admin/team,
// and there is no recovery path from inside the app once it's gone.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/admin-auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const supabase = await createClient()
  const auth = await requireSuperAdmin(supabase)
  if (auth.error) return auth.error

  if (auth.user.id === userId) {
    return NextResponse.json({ error: 'You cannot delete your own account from here.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true })
}
