// app/api/admin/users/[userId]/entries/[entryId]/delete/route.ts
// super_admin only — mirrors app/api/entries/[id]/delete/route.ts's own
// pattern (fetch to confirm ownership, then delete) but scoped to the
// target user, not the caller, via the service-role client.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/admin-auth'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string; entryId: string }> }
) {
  const { userId, entryId } = await params
  const supabase = await createClient()
  const auth = await requireSuperAdmin(supabase)
  if (auth.error) return auth.error

  const admin = createAdminClient()
  const { data: existing } = await admin.from('entries').select('account_id, user_id').eq('id', entryId).single()
  if (!existing || existing.user_id !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await admin.from('entries').delete().eq('id', entryId)

  return NextResponse.redirect(new URL(`/admin/users/${userId}/accounts/${existing.account_id}`, req.url))
}
