// lib/firms/shared/derive.ts
// ─────────────────────────────────────────────────────────────────────────────
// The core drawdown/payout math. Firm-agnostic — every firm uses this same
// derive() against its own DB-backed AccountConfig. Moved here verbatim from
// the old lib/firms/apex/rules.ts (it never had any Apex-specific constants
// baked in), with one fix: payoutEligible now also requires the account to
// have logged at least config.minQualifyingDays qualifying days — previously
// there was no such gate at all (Milestone 4 audit finding).
// ─────────────────────────────────────────────────────────────────────────────
import type { AccountConfig, Entry, DerivedMetrics } from '../types'

function computeMLL(config: AccountConfig, peakBalance: number): number {
  const raw = peakBalance - config.drawdownAmount
  // Trailing MLL rises with peak balance, then LOCKS (stops rising) once it
  // reaches mllLockAt — a ceiling, not a floor: this must be Math.min, not
  // Math.max. Getting this backwards makes every account look prematurely
  // "locked" (mllLocked true, buffer negative) from day one, before any
  // trading — peak starts at accountSize, so raw = accountSize -
  // drawdownAmount = startingMLL on day 0, which is always below
  // mllLockAt (= accountSize + a small buffer); Math.max wrongly clamped
  // that UP to mllLockAt instead of leaving it at the true starting floor.
  // peak is monotonically non-decreasing from accountSize, so raw can
  // never fall below startingMLL — Math.min(raw, mllLockAt) alone is
  // correct with no additional lower clamp needed.
  return Math.min(raw, config.mllLockAt)
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }

// Extracted from coaching.ts's own inline calc 2026-09-23 so Performance
// Home's cross-account consolidation grouping (lib/performance.ts, which
// groups accounts by firm+size+phase) can never drift from what
// buildCoaching() itself treats as the account's phase.
export type Phase = 'lock' | 'build' | 'payout'
export function getPhase(m: Pick<DerivedMetrics, 'mllLocked' | 'aboveSafetyNet'>): Phase {
  return !m.mllLocked ? 'lock' : m.aboveSafetyNet < 0 ? 'build' : 'payout'
}

// Shared by derive() and deriveBalanceHistory() so the day-by-day chart data
// and the current-state metrics can never quietly disagree on this formula.
function computeEffectiveDailyLossLimit(config: AccountConfig, peak: number, mllLocked: boolean): number | null {
  const dllIsDynamic = mllLocked && config.scaleDllPct != null
  return dllIsDynamic ? peak * (config.scaleDllPct! / 100) : config.dailyLossLimit
}

export function derive(
  config: AccountConfig,
  entries: Entry[],
  payoutCount: number,
  lastPayoutAt: string | Date | null = null
): DerivedMetrics {
  let bal  = config.accountSize
  let peak = config.accountSize

  for (const e of entries) {
    bal += e.pnl
    if (bal > peak) peak = bal
  }

  const currentMLL   = computeMLL(config, peak)
  const mllLocked    = currentMLL >= config.mllLockAt
  const buffer       = bal - currentMLL

  // Lucid's "LucidScale DLL": once the trailing MLL locks (peak balance has
  // risen past the point where the floor stops moving — "Above Initial
  // Trail" in Lucid's own terms, the same threshold mllLocked already
  // captures), the daily loss limit stops being a fixed dollar figure and
  // becomes a percentage of peak balance instead, recomputed as peak moves.
  // Firms without this mechanic (config.scaleDllPct === null, every firm
  // except Lucid) always fall through to the static dailyLossLimit — this
  // never changes behavior for Apex/TopStep/Tradeify accounts.
  const dllIsDynamic = mllLocked && config.scaleDllPct != null
  const effectiveDailyLossLimit = computeEffectiveDailyLossLimit(config, peak, mllLocked)
  const aboveSN      = bal - config.safetyNet

  const winEntries   = entries.filter(e => e.pnl > 0)
  const lossEntries  = entries.filter(e => e.pnl < 0)
  const qualDays     = entries.filter(e => e.pnl >= config.qualifyingDayMin).length

  const totalProfit  = winEntries.reduce((s, e) => s + e.pnl, 0)
  const biggestDay   = winEntries.length ? Math.max(...winEntries.map(e => e.pnl)) : 0
  const consPct      = totalProfit > 0 ? (biggestDay / totalProfit) * 100 : 0

  // Tradeify Lightning's escalating consistency rule: the cap that actually
  // applies depends on how many payouts the account has already taken —
  // same "index by payout number, clamp at the last entry" pattern as
  // payoutLadder below. Firms without a schedule (every firm except
  // Lightning) just use the flat consistencyRule at every payout count.
  const activeConsistencyRule = config.consistencyRuleSchedule && config.consistencyRuleSchedule.length > 0
    ? config.consistencyRuleSchedule[Math.min(payoutCount, config.consistencyRuleSchedule.length - 1)]
    : config.consistencyRule
  const consOk       = activeConsistencyRule === 0 || consPct < activeConsistencyRule

  // Tradeify Select's Daily-vs-Flex payout cadence: Flex requires
  // minDaysBetweenPayouts (5) days since the account's last recorded
  // payout before the next one is eligible; Daily (and every other firm,
  // minDaysBetweenPayouts === 0) has no such gate. No prior payout means
  // the gate can't have failed to elapse — the first payout is never
  // blocked by it.
  const daysSinceLastPayout = lastPayoutAt
    ? Math.floor((Date.now() - new Date(lastPayoutAt).getTime()) / 86_400_000)
    : null
  const payoutFrequencyOk = config.minDaysBetweenPayouts === 0
    || daysSinceLastPayout === null
    || daysSinceLastPayout >= config.minDaysBetweenPayouts

  // Tradeify Select Flex has no minimum account balance requirement at all
  // ("You can request a payout immediately after achieving 5 winning days,
  // regardless of your account balance" — Tradeify's own help center). Every
  // other firm/plan (requiresMinimumBalance === true, the default) keeps
  // requiring balance to clear safetyNet by at least minPayout.
  const balanceOk = config.requiresMinimumBalance ? aboveSN >= config.minPayout : true
  const payoutEligible = balanceOk && consOk && qualDays >= config.minQualifyingDays && payoutFrequencyOk
  // An empty payoutLadder is a real gap (a firm/size onboarded without its
  // payout amounts entered yet — see supabase data for Lucid, e.g.) rather
  // than a firm that genuinely caps payouts at $0. Indexing into [] gives
  // undefined, which fmt()'s Math.round() turns into a silent "$NaN" on
  // screen — null is explicit and lets the UI say "not configured" instead
  // of showing a number that looks like a real (and wrong) answer.
  const nextPayoutMax = config.payoutLadder.length > 0
    ? config.payoutLadder[Math.min(payoutCount, config.payoutLadder.length - 1)]
    : null

  const progress = clamp(
    ((bal - config.accountSize) / (config.safetyNet - config.accountSize)) * 100,
    0, 100
  )

  const winRate = entries.length
    ? Math.round((winEntries.length / entries.length) * 100)
    : 0

  return {
    currentBalance:  bal,
    peakBalance:     peak,
    currentMLL,
    mllLocked,
    effectiveDailyLossLimit,
    dllIsDynamic,
    buffer,
    safetyNet:       config.safetyNet,
    aboveSafetyNet:  aboveSN,
    qualifyingDays:  qualDays,
    totalProfit,
    biggestDay,
    consistencyPct:  consPct,
    consistencyOk:   consOk,
    activeConsistencyRule,
    daysSinceLastPayout,
    payoutFrequencyOk,
    payoutEligible,
    nextPayoutMax,
    mllLockProgress: progress,
    winDays:         winEntries.length,
    lossDays:        lossEntries.length,
    winRate,
  }
}

export interface BalanceHistoryPoint {
  date:           string        // entry.date, 'YYYY-MM-DD'
  balance:        number        // running balance as of this entry
  minimum:        number        // currentMLL as of this entry — the trailing floor, same formula derive() uses
  lossLimitFloor: number | null // balance - effectiveDailyLossLimit as of this entry; null when this firm/plan has no DLL
}

// One point per logged entry (chronological order expected, same contract as
// derive() — the account pages already fetch entries ordered ascending by
// date). Powers the account page's balance chart. Deliberately does NOT
// include a point for "today" or any un-logged day — the chart only ever
// shows real, logged data, same as every other metric on the account page.
export function deriveBalanceHistory(config: AccountConfig, entries: Entry[]): BalanceHistoryPoint[] {
  let bal  = config.accountSize
  let peak = config.accountSize
  const points: BalanceHistoryPoint[] = []

  for (const e of entries) {
    bal += e.pnl
    if (bal > peak) peak = bal

    const minimum    = computeMLL(config, peak)
    const mllLocked  = minimum >= config.mllLockAt
    const effectiveDailyLossLimit = computeEffectiveDailyLossLimit(config, peak, mllLocked)

    points.push({
      date: e.date,
      balance: bal,
      minimum,
      lossLimitFloor: effectiveDailyLossLimit != null ? bal - effectiveDailyLossLimit : null,
    })
  }

  return points
}
