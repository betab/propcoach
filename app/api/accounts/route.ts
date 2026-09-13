// app/api/accounts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentFirmConfig } from '@/lib/firms'
import type { DrawdownType } from '@/lib/firms/types'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { firm_id, size, drawdown_type, version, nickname, account_number, start_date } = body

  if (!firm_id || !size || !drawdown_type || !version || !start_date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Confirm this firm/size/drawdown-type/version combination actually has
  // resolvable rules before ever creating the row — without this, a client
  // could POST an arbitrary combination that has no matching firm_rule_sizes
  // row and get an account that 404s the moment its detail page is viewed
  // (the same class of bug fixed in #5's data-driven pickers, closed off
  // here for any caller that bypasses the UI, e.g. a retry or a future
  // non-browser client).
  try {
    await getCurrentFirmConfig(supabase, firm_id, size, drawdown_type as DrawdownType, version)
  } catch {
    return NextResponse.json(
      { error: 'No rules found for that firm, size, drawdown type, and version combination.' },
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
    })
    .select()
    .single()

  // Surfaces the free-plan 1-account-limit trigger's error message unchanged
  // (single source of truth for that rule stays the DB trigger — see
  // supabase/migrations/001_initial.sql and 002_account_status.sql).
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
