// lib/admin-firm-rule-form.ts
// Shared field parsing for the two admin routes that write firm_rule_sizes
// rows (create + supersede) — same form shape, same validation, avoids
// duplicating this across both.

export interface ParsedFirmRuleSize {
  accountSize: number
  drawdownType: string
  drawdownAmount: number
  dailyLossLimit: number | null
  optionalDailyLossLimit: number | null
  scaleDllPct: number | null
  safetyNetBuffer: number
  mllLockBuffer: number
  qualifyingDayMin: number
  minQualifyingDays: number
  maxContracts: number
  consistencyRulePct: number
  consistencySchedule: number[] | null
  payoutLadder: number[]
  minPayout: number
  minDaysBetweenPayouts: number
  requiresMinimumBalance: boolean
  effectiveFrom: string
}

export function parseFirmRuleSizeForm(formData: FormData): ParsedFirmRuleSize | { error: string } {
  const accountSize = Number(formData.get('account_size'))
  const drawdownType = String(formData.get('drawdown_type') || '')
  const drawdownAmount = Number(formData.get('drawdown_amount'))
  const dllRaw = String(formData.get('daily_loss_limit') || '').trim()
  const dailyLossLimit = dllRaw === '' ? null : Number(dllRaw)
  const optionalDllRaw = String(formData.get('optional_daily_loss_limit') || '').trim()
  const optionalDailyLossLimit = optionalDllRaw === '' ? null : Number(optionalDllRaw)
  const scaleDllRaw = String(formData.get('scale_dll_pct') || '').trim()
  const scaleDllPct = scaleDllRaw === '' ? null : Number(scaleDllRaw)
  const safetyNetBuffer = Number(formData.get('safety_net_buffer') || 100)
  const mllLockBuffer = Number(formData.get('mll_lock_buffer') || 100)
  const qualifyingDayMin = Number(formData.get('qualifying_day_min') || 0)
  const minQualifyingDays = Number(formData.get('min_qualifying_days') || 0)
  const maxContracts = Number(formData.get('max_contracts'))
  const consistencyRulePct = Number(formData.get('consistency_rule_pct') || 0)
  const minPayout = Number(formData.get('min_payout') || 0)
  const minDaysBetweenPayouts = Number(formData.get('min_days_between_payouts') || 0)
  // Checkbox: present + "on" when checked, absent from formData entirely when unchecked.
  const requiresMinimumBalance = formData.get('requires_minimum_balance') === 'on'
  const effectiveFrom = String(formData.get('effective_from') || '').trim()
  const ladderRaw = String(formData.get('payout_ladder') || '').trim()
  const consistencyScheduleRaw = String(formData.get('consistency_schedule') || '').trim()

  if (!accountSize || !drawdownType || !drawdownAmount || !maxContracts || !effectiveFrom) {
    return { error: 'Account size, drawdown type, drawdown amount, max contracts, and effective date are required.' }
  }
  if (!['trailing_eod', 'trailing_intraday', 'static'].includes(drawdownType)) {
    return { error: 'Invalid drawdown type.' }
  }

  let payoutLadder: number[] = []
  if (ladderRaw) {
    payoutLadder = ladderRaw.split(',').map(s => Number(s.trim()))
    if (payoutLadder.some(n => isNaN(n))) {
      return { error: 'Payout ladder must be a comma-separated list of numbers, e.g. 1000,1250,1500.' }
    }
  }

  let consistencySchedule: number[] | null = null
  if (consistencyScheduleRaw) {
    consistencySchedule = consistencyScheduleRaw.split(',').map(s => Number(s.trim()))
    if (consistencySchedule.some(n => isNaN(n))) {
      return { error: 'Consistency schedule must be a comma-separated list of percentages, e.g. 20,25,30.' }
    }
  }

  if (dllRaw !== '' && isNaN(dailyLossLimit as number)) {
    return { error: 'Daily loss limit must be a number, or left blank for no DLL.' }
  }
  if (optionalDllRaw !== '' && isNaN(optionalDailyLossLimit as number)) {
    return { error: 'Optional daily loss limit must be a number, or left blank if this size offers no DLL opt-in.' }
  }
  if (scaleDllRaw !== '' && isNaN(scaleDllPct as number)) {
    return { error: 'Scale DLL % must be a number, or left blank if this size has no scaling DLL mechanic.' }
  }
  if (isNaN(minDaysBetweenPayouts)) {
    return { error: 'Min days between payouts must be a number (0 = no gate).' }
  }

  return {
    accountSize, drawdownType, drawdownAmount, dailyLossLimit, optionalDailyLossLimit, scaleDllPct, safetyNetBuffer, mllLockBuffer,
    qualifyingDayMin, minQualifyingDays, maxContracts, consistencyRulePct, consistencySchedule, payoutLadder, minPayout,
    minDaysBetweenPayouts, requiresMinimumBalance, effectiveFrom,
  }
}
