// app/api/admin/users/[userId]/accounts/[accountId]/route.ts
// super_admin only — edits every account field, including the ones locked
// from the user's own self-edit in migration 013 (size, firm_id, version,
// drawdown_type, start_date, user_id). Uses the service-role client for
// exactly that reason. Validates the edited firm/size/drawdown-type/version
// combination still resolves as of the (possibly also-edited) start_date
// before saving — same defensive check app/api/accounts/route.ts runs on
// create, so a correction here can't leave the account in the same
// "no rules found" state that check exists to prevent in the first place.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/admin-auth'
import { getFirmConfigForAccount } from '@/lib/firms'
import type { DrawdownType } from '@/lib/firms/types'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string; accountId: string }> }
) {
  const { userId, accountId } = await params
  const supabase = await createClient()
  const auth = await requireSuperAdmin(supabase)
  if (auth.error) return auth.error

  const admin = createAdminClient()
  const { data: existing } = await admin.from('accounts').select('user_id').eq('id', accountId).single()
  if (!existing || existing.user_id !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const formData = await req.formData()
  const firm_id = String(formData.get('firm_id') || '')
  const version = String(formData.get('version') || '')
  const drawdown_type = String(formData.get('drawdown_type') || '') as DrawdownType
  const size = Number(formData.get('size'))
  const start_date = String(formData.get('start_date') || '')
  const status = String(formData.get('status') || '')

  if (!firm_id || !version || !drawdown_type || !size || !start_date) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }
  if (!['active', 'breached', 'passed'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
  }

  const daily_loss_limit_enabled = formData.get('daily_loss_limit_enabled') === 'on'

  try {
    await getFirmConfigForAccount(admin, { firm_id, size, drawdown_type, version, start_date, daily_loss_limit_enabled })
  } catch {
    return NextResponse.json(
      { error: `No rules found for that firm, size, drawdown type, and version combination as of ${start_date}.` },
      { status: 400 }
    )
  }

  const { error } = await admin
    .from('accounts')
    .update({
      nickname: String(formData.get('nickname') || '').trim(),
      account_number: String(formData.get('account_number') || '').trim(),
      firm_id,
      version,
      size,
      drawdown_type,
      start_date,
      status,
      payout_count: Number(formData.get('payout_count')) || 0,
      is_active: formData.get('is_active') === 'on',
      daily_loss_limit_enabled,
      rules: String(formData.get('rules') || '').trim() || null,
    })
    .eq('id', accountId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.redirect(new URL(`/admin/users/${userId}/accounts/${accountId}`, req.url))
}
