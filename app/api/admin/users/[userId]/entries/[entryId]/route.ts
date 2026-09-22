// app/api/admin/users/[userId]/entries/[entryId]/route.ts
// super_admin only — corrects a logged entry (closing_balance, pnl,
// contracts, notes) directly. Deliberately does NOT recompute pnl from
// closing_balance server-side: doing that correctly needs the balance
// immediately prior to this entry in the account's own chronological
// sequence (see app/(app)/account/[id]/log/page.tsx's currentBalance
// calc), which is fragile to duplicate here — an admin fixing bad data
// may need to set either field independently, so both are taken as given.
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

  const formData = await req.formData()
  const closing_balance = Number(formData.get('closing_balance'))
  const pnl = Number(formData.get('pnl'))
  if (isNaN(closing_balance) || isNaN(pnl)) {
    return NextResponse.json({ error: 'Closing balance and P&L must be numbers.' }, { status: 400 })
  }

  const { error } = await admin
    .from('entries')
    .update({
      closing_balance,
      pnl,
      contracts: Number(formData.get('contracts')) || 0,
      notes: String(formData.get('notes') || '').trim(),
    })
    .eq('id', entryId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.redirect(new URL(`/admin/users/${userId}/accounts/${existing.account_id}`, req.url))
}
