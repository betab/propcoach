// app/api/admin/firm-rule-sizes/[id]/supersede/route.ts
// The ONLY way an existing firm_rule_sizes row's numbers change. Never a
// raw UPDATE of the numeric columns — that would silently change the
// historical math for every account resolved against this row. Instead:
// close out the old row (effective_to = new effective_from) and insert a
// brand new row with the edited values, open-ended from that date. See
// supabase/migrations/003_firm_rules_db.sql for why.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCanEditRules } from '@/lib/admin-auth'
import { parseFirmRuleSizeForm } from '@/lib/admin-firm-rule-form'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const auth = await requireCanEditRules(supabase)
  if (auth.error) return auth.error

  const { data: oldRow } = await supabase.from('firm_rule_sizes').select('*').eq('id', id).single()
  if (!oldRow) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  if (oldRow.effective_to) {
    return NextResponse.json({ error: 'This row is already superseded — edit the current row instead.' }, { status: 400 })
  }

  const formData = await req.formData()
  const firmId = String(formData.get('firm_id') || '')
  const parsed = parseFirmRuleSizeForm(formData)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  if (parsed.effectiveFrom <= oldRow.effective_from) {
    return NextResponse.json(
      { error: `New effective date must be after the current row's effective date (${oldRow.effective_from}).` },
      { status: 400 }
    )
  }
  // account_size/drawdown_type identity is carried over from the old row,
  // not editable here — changing what a row represents is a new-size
  // operation, not an edit.

  const { error: closeError } = await supabase
    .from('firm_rule_sizes')
    .update({ effective_to: parsed.effectiveFrom })
    .eq('id', id)
  if (closeError) return NextResponse.json({ error: closeError.message }, { status: 400 })

  const { error: insertError } = await supabase.from('firm_rule_sizes').insert({
    firm_version_id: oldRow.firm_version_id,
    account_size: oldRow.account_size,
    drawdown_type: oldRow.drawdown_type,
    drawdown_amount: parsed.drawdownAmount,
    daily_loss_limit: parsed.dailyLossLimit,
    optional_daily_loss_limit: parsed.optionalDailyLossLimit,
    safety_net_buffer: parsed.safetyNetBuffer,
    mll_lock_buffer: parsed.mllLockBuffer,
    qualifying_day_min: parsed.qualifyingDayMin,
    min_qualifying_days: parsed.minQualifyingDays,
    max_contracts: parsed.maxContracts,
    consistency_rule_pct: parsed.consistencyRulePct,
    payout_ladder: parsed.payoutLadder,
    min_payout: parsed.minPayout,
    effective_from: parsed.effectiveFrom,
    created_by: auth.user.id,
  })
  if (insertError) {
    // Best-effort compensation: the old row is closed but nothing replaced
    // it — reopen it rather than leaving a silent gap in coverage.
    await supabase.from('firm_rule_sizes').update({ effective_to: null }).eq('id', id)
    return NextResponse.json({ error: insertError.message }, { status: 400 })
  }

  return NextResponse.redirect(new URL(`/admin/firms/${firmId}/versions/${oldRow.firm_version_id}`, req.url))
}
