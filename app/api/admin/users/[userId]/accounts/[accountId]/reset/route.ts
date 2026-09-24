// app/api/admin/users/[userId]/accounts/[accountId]/reset/route.ts
// super_admin only — PR C of the Reporting Dashboard milestone. Wipes an
// account's entries and payouts back to a clean slate but keeps the
// account shell (firm/size/drawdown config, nickname, account number,
// daily_target_multiplier, daily_loss_limit_enabled, rules — all
// preserved, since those are the account's identity/config, not its
// trading history/outcome). Every reset is logged to admin_action_log
// (027_admin_action_log.sql) — this is the first real writer for that
// table.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/admin-auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string; accountId: string }> }) {
  const { userId, accountId } = await params
  const supabase = await createClient()
  const auth = await requireSuperAdmin(supabase)
  if (auth.error) return auth.error

  const admin = createAdminClient()

  const { data: account } = await admin
    .from('accounts').select('id, user_id, status, payout_count').eq('id', accountId).single()
  if (!account || account.user_id !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const [{ data: deletedEntries, error: entriesError }, { data: deletedPayouts, error: payoutsError }] = await Promise.all([
    admin.from('entries').delete().eq('account_id', accountId).select('id'),
    admin.from('payouts').delete().eq('account_id', accountId).select('id'),
  ])
  if (entriesError) return NextResponse.json({ error: entriesError.message }, { status: 500 })
  if (payoutsError) return NextResponse.json({ error: payoutsError.message }, { status: 500 })

  const { error: updateError } = await admin
    .from('accounts')
    .update({ status: 'active', payout_count: 0, is_active: true })
    .eq('id', accountId)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  const { error: logError } = await admin.from('admin_action_log').insert({
    actor_id: auth.user.id,
    target_user_id: userId,
    target_account_id: accountId,
    action: 'account_reset',
    details: {
      entries_deleted: deletedEntries?.length ?? 0,
      payouts_deleted: deletedPayouts?.length ?? 0,
      prior_status: account.status,
      prior_payout_count: account.payout_count,
    },
  })
  // A logging failure shouldn't mask a successful reset — the reset already
  // happened and can't be un-done by failing this response — but it's worth
  // surfacing so a missed audit row doesn't go unnoticed.
  if (logError) {
    return NextResponse.json({
      success: true,
      warning: `Reset succeeded but the audit log entry failed to write: ${logError.message}`,
      entriesDeleted: deletedEntries?.length ?? 0,
      payoutsDeleted: deletedPayouts?.length ?? 0,
    })
  }

  return NextResponse.json({
    success: true,
    entriesDeleted: deletedEntries?.length ?? 0,
    payoutsDeleted: deletedPayouts?.length ?? 0,
  })
}
