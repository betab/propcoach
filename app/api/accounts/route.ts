// app/api/accounts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getFirmConfigForAccount } from '@/lib/firms'
import type { DrawdownType } from '@/lib/firms/types'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { firm_id, size, drawdown_type, version, nickname, account_number, start_date, daily_loss_limit_enabled } = body
  const dllEnabled = daily_loss_limit_enabled === true

  if (!firm_id || !size || !drawdown_type || !version || !start_date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Confirm this firm/size/drawdown-type/version combination actually has
  // resolvable rules AS OF THIS ACCOUNT'S OWN START DATE before ever
  // creating the row — not "as of today". The account detail page always
  // resolves config as of account.start_date (rules are effective-dated,
  // an account's math can legitimately differ from "what's true today"),
  // so validating against today here was a real gap: it let creation
  // succeed for a start_date earlier than when this firm/plan's numbers
  // were entered, only for the account to have nothing to resolve the
  // moment its detail page loaded — a hard crash there before this was
  // fixed (that page didn't handle the failure either; see
  // app/(app)/account/[id]/page.tsx). Calling getFirmConfigForAccount here
  // with the exact same shape of object account detail resolves later
  // guarantees this check can never drift from what actually happens at
  // display time — no second date-resolution path to keep in sync.
  let config
  try {
    config = await getFirmConfigForAccount(supabase, {
      firm_id, size, drawdown_type: drawdown_type as DrawdownType, version, start_date,
      daily_loss_limit_enabled: dllEnabled,
    })
  } catch {
    return NextResponse.json(
      { error: `No rules found for that firm, size, drawdown type, and version combination as of ${start_date}. Try a later start date, or contact support if this firm's rules were genuinely in effect that far back.` },
      { status: 400 }
    )
  }

  // Defense in depth: refuse a DLL opt-in claim for a size that doesn't
  // actually offer one, same reasoning as the resolvability check above —
  // don't trust a client-supplied flag the UI wouldn't have let through.
  if (dllEnabled && config.optionalDailyLossLimit == null) {
    return NextResponse.json(
      { error: 'This firm/size does not offer an optional Daily Loss Limit.' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('accounts')
    .insert({
      user_id:        user.id,
      firm_id,
      nickname:       nickname || `${(size / 1000).toFixed(0)}K ${firm_id.toUpperCase()}`,
      account_number: account_number || '',
      size,
      drawdown_type,
      version,
      start_date,
      daily_loss_limit_enabled: dllEnabled,
    })
    .select()
    .single()

  // Surfaces the free-plan 1-account-limit trigger's error message unchanged
  // (single source of truth for that rule stays the DB trigger — see
  // supabase/migrations/001_initial.sql and 002_account_status.sql).
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
