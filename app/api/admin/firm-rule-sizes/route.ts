// app/api/admin/firm-rule-sizes/route.ts
// Creates a firm_rule_sizes row for a (version, size, drawdown_type)
// combination that doesn't have a current row yet. Editing an EXISTING
// combination goes through /supersede instead — this route refuses to
// create a second open-ended row for the same key, which would make
// effective-date resolution ambiguous.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCanEditRules } from '@/lib/admin-auth'
import { parseFirmRuleSizeForm } from '@/lib/admin-firm-rule-form'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const auth = await requireCanEditRules(supabase)
  if (auth.error) return auth.error

  const formData = await req.formData()
  const firmId = String(formData.get('firm_id') || '')
  const firmVersionId = String(formData.get('firm_version_id') || '')
  if (!firmId || !firmVersionId) {
    return NextResponse.json({ error: 'Missing firm or version.' }, { status: 400 })
  }

  const parsed = parseFirmRuleSizeForm(formData)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { data: existing } = await supabase
    .from('firm_rule_sizes')
    .select('id')
    .eq('firm_version_id', firmVersionId)
    .eq('account_size', parsed.accountSize)
    .eq('drawdown_type', parsed.drawdownType)
    .is('effective_to', null)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'A current row already exists for this size and drawdown type — edit it instead of creating a new one.' },
      { status: 400 }
    )
  }

  const { error } = await supabase.from('firm_rule_sizes').insert({
    firm_version_id: firmVersionId,
    account_size: parsed.accountSize,
    drawdown_type: parsed.drawdownType,
    drawdown_amount: parsed.drawdownAmount,
    daily_loss_limit: parsed.dailyLossLimit,
    optional_daily_loss_limit: parsed.optionalDailyLossLimit,
    scale_dll_pct: parsed.scaleDllPct,
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
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.redirect(new URL(`/admin/firms/${firmId}/versions/${firmVersionId}`, req.url))
}
