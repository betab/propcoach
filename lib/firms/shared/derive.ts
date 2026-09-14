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

export function derive(
  config: AccountConfig,
  entries: Entry[],
  payoutCount: number
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
  const effectiveDailyLossLimit = dllIsDynamic
    ? peak * (config.scaleDllPct! / 100)
    : config.dailyLossLimit
  const aboveSN      = bal - config.safetyNet

  const winEntries   = entries.filter(e => e.pnl > 0)
  const lossEntries  = entries.filter(e => e.pnl < 0)
  const qualDays     = entries.filter(e => e.pnl >= config.qualifyingDayMin).length

  const totalProfit  = winEntries.reduce((s, e) => s + e.pnl, 0)
  const biggestDay   = winEntries.length ? Math.max(...winEntries.map(e => e.pnl)) : 0
  const consPct      = totalProfit > 0 ? (biggestDay / totalProfit) * 100 : 0
  const consOk       = config.consistencyRule === 0 || consPct < config.consistencyRule

  const payoutEligible = aboveSN >= config.minPayout && consOk && qualDays >= config.minQualifyingDays
  const nextPayoutMax  = config.payoutLadder[
    Math.min(payoutCount, config.payoutLadder.length - 1)
  ]

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
    payoutEligible,
    nextPayoutMax,
    mllLockProgress: progress,
    winDays:         winEntries.length,
    lossDays:        lossEntries.length,
    winRate,
  }
}
