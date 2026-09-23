// lib/firms/shared/coaching.ts
// ─────────────────────────────────────────────────────────────────────────────
// Coaching-card generation. Firm-agnostic, moved here verbatim from the old
// lib/firms/apex/rules.ts. The internal thresholds (0.7 "getting close"
// multiplier, 2.5x big-day multiplier) stay as code constants shared across
// all firms, not DB fields, per the firm-management milestone plan. Daily
// Target and Stop Trading If Down both scale together with the trader's
// per-account daily_target_multiplier (0.5x-2.0x) — see the constants and
// comments where each is used below.
// ─────────────────────────────────────────────────────────────────────────────
import type { AccountConfig, Entry, DerivedMetrics, CoachingRule } from '../types'
import { getPhase } from './derive'

function fmt(n: number)  { return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString() }
function fmtS(n: number) { return (n > 0 ? '+$' : n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString() }

// Baseline before the trader's own risk multiplier: a modest % of account
// size, floored at the firm's own qualifyingDayMin so the target never
// falls below what that firm/size already defines as a "real" trading day
// (checked against every active firm's real qualifying_day_min 2026-09-22 —
// produces sane numbers throughout, $125-$1,500 across Apex/Lucid/Tradeify's
// real sizes, floor only binding on the smaller Apex sizes). Replaces the
// old flat $300-for-every-size baseline.
const BASE_TARGET_PCT = 0.005

// Stop Trading If Down's buffer fraction — 0.4 is the multiplier's 1.0x
// (neutral/unchanged) point; see the risk-slider comment where it's used.
const STOP_LOSS_BASE_FRACTION = 0.4
const STOP_LOSS_MAX_BUFFER_FRACTION = 0.8

// Shared between buildCoaching() and getConsistencyBreachMultiplier() so
// the two can never quietly disagree on what the base target or the
// consistency ceiling are.
function computeRiskMath(config: AccountConfig, m: DerivedMetrics): { baseTarget: number; maxTomorrow: number | null } {
  const rawBase    = config.accountSize * BASE_TARGET_PCT
  const baseTarget = config.qualifyingDayMin > 0 ? Math.max(rawBase, config.qualifyingDayMin) : rawBase

  // Max profit tomorrow before tripping the consistency wall (activeConsistencyRule
  // accounts for firms like Tradeify Lightning where the cap escalates by payout count).
  //
  // Exact solution: if tomorrow's profit x becomes the new biggest day, the
  // constraint is x/(totalProfit+x) < c (c = cap as a fraction) — solving
  // gives x < c*totalProfit/(1-c). Previously this computed
  // totalProfit*(c-eps) - biggestDay, which doesn't account for x also
  // growing the denominator — that formula was always conservative (never
  // unsafe) but could understate real headroom several-fold early in an
  // account's history (verified case: showed $990 vs. a true ~$4,286 on
  // $10K total profit / $2K biggest day / 30% cap).
  //
  // null = no live ceiling to speak of (no active consistency rule, or no
  // profit logged yet to compute a ratio against).
  const c = m.activeConsistencyRule / 100
  const maxTomorrow = m.activeConsistencyRule > 0 && m.totalProfit > 0
    ? Math.floor((m.totalProfit * c / (1 - c)) * 0.999) // epsilon to stay strictly under
    : null

  return { baseTarget, maxTomorrow }
}

/**
 * The daily_target_multiplier value at which the trader's raw target
 * (baseTarget × multiplier) would first exceed the live consistency
 * ceiling — the point DailyTargetSlider marks with its breach indicator.
 * Returned uncapped: a caller comparing against the slider's own min/max
 * decides whether the breach point falls inside the visible 0.5x-2.0x
 * range, sits at/before the conservative end (the whole range is already
 * past it), or past the aggressive end (nothing on the slider reaches it).
 * null = no reachable breach at all — no active consistency rule yet, or
 * no profit logged yet to compute a ratio against.
 */
export function getConsistencyBreachMultiplier(config: AccountConfig, m: DerivedMetrics): number | null {
  const { baseTarget, maxTomorrow } = computeRiskMath(config, m)
  if (maxTomorrow === null || baseTarget <= 0) return null
  return maxTomorrow / baseTarget
}

export function buildCoaching(
  config:                 AccountConfig,
  m:                      DerivedMetrics,
  entries:                Entry[],
  payoutCount:            number,
  dailyTargetMultiplier:  number = 1.0
): CoachingRule[] {
  const rules: CoachingRule[] = []

  const phase = getPhase(m)

  const { baseTarget, maxTomorrow: maxTomorrowOrNull } = computeRiskMath(config, m)
  const maxTomorrow  = maxTomorrowOrNull ?? 99999 // sentinel: no live ceiling, never binds below
  const tieredTarget = Math.round(baseTarget * dailyTargetMultiplier)

  // The consistency ceiling caps the target in every phase, not just
  // 'payout' — totalProfit/biggestDay accrue from entry #1 regardless of
  // phase, so a big pre-lock day still shapes the ratio once it starts
  // being enforced. Capping early is protective even though it isn't
  // formally gated until 'payout'.
  const safeTarget = maxTomorrow < tieredTarget ? maxTomorrow : tieredTarget

  // Stop Trading If Down moves with the same risk slider as Daily Target —
  // 0.4 (the old fixed fraction) is the multiplier's neutral 1.0x point, so
  // a trader who never touches the slider sees the exact same number as
  // before. Conservative (0.5x) tightens to 20% of buffer, aggressive
  // (2.0x) loosens to 80%. STOP_LOSS_MAX_BUFFER_FRACTION is a hard ceiling
  // independent of the slider — even at 2.0x this never recommends past
  // 80% of buffer, so there's always a real cushion left before the MLL
  // itself would be hit; effectiveDailyLossLimit/drawdownAmount is a
  // separate, harder ceiling this never touches — the firm's own real DLL
  // is a rule, not a preference, and the multiplier never scales past it.
  const bufferFraction = Math.min(STOP_LOSS_BASE_FRACTION * dailyTargetMultiplier, STOP_LOSS_MAX_BUFFER_FRACTION)
  const stopLoss = Math.min(
    m.effectiveDailyLossLimit ?? config.drawdownAmount,
    Math.floor(m.buffer * bufferFraction)
  )

  // ── Target ────────────────────────────────────────────────────────────────
  // Skip entirely once consistency is already blocking payout (phase ===
  // 'payout' && !m.consistencyOk) — the separate "Consistency — PAYOUT
  // BLOCKED" card below already covers that state correctly. Previously
  // this card's own formula going to zero/negative in that exact
  // situation fell through to the "healthy" branch, showing a
  // contradictory "$300, ✓ ok" right next to the other card's alert. The
  // lock/build phases below never claim anything about consistency, so
  // they're unaffected by this and always still show.
  if (phase !== 'payout' || m.consistencyOk) {
    let tNote = ''
    if (phase === 'lock')
      tNote = `Priority is reaching ${fmt(config.safetyNet)} so your MLL permanently freezes at ${fmt(config.mllLockAt)}. ${fmt(Math.max(0, config.safetyNet - m.currentBalance))} to go. Build it consistently — one bad swing can push the MLL up before you lock it.`
    else if (phase === 'build')
      tNote = `MLL locked ✅ Now build above the ${fmt(config.safetyNet)} Safety Net to unlock payout requests. ${fmt(Math.abs(m.aboveSafetyNet))} remaining.`
    else if (maxTomorrow < tieredTarget)
      tNote = `Your biggest day (${fmt(m.biggestDay)}) is ${m.consistencyPct.toFixed(0)}% of total profit. Staying under ${fmt(safeTarget)} tomorrow keeps you payout-eligible.`
    else
      tNote = `Consistency healthy at ${m.consistencyPct.toFixed(0)}%. This target qualifies the day and keeps you well clear of the ${m.activeConsistencyRule}% cap.`

    rules.push({
      label: 'Daily Target',
      value: fmt(safeTarget),
      note:  tNote,
      severity: maxTomorrow < tieredTarget ? 'warn' : 'ok',
    })
  }

  // ── Stop loss ─────────────────────────────────────────────────────────────
  const dllNote = m.effectiveDailyLossLimit
    ? m.dllIsDynamic
      ? ` Your DLL is dynamic on this account — currently $${Math.round(m.effectiveDailyLossLimit).toLocaleString()} (${config.scaleDllPct}% of peak balance) and moves as your peak balance does.`
      : ` Your $${m.effectiveDailyLossLimit.toLocaleString()} DLL would pause you at that point anyway — honour this earlier.`
    : ` No DLL on this account type — the MLL is your only hard floor.`
  rules.push({
    label: 'Stop Trading If Down',
    value: fmt(stopLoss),
    note:  `${Math.round((stopLoss / (m.effectiveDailyLossLimit ?? config.drawdownAmount)) * 100)}% of your max daily loss.${dllNote}`,
    severity: m.buffer < 1000 ? 'alert' : 'warn',
  })

  // ── MLL status ────────────────────────────────────────────────────────────
  if (!m.mllLocked) {
    rules.push({
      label:    'MLL — NOT YET LOCKED',
      value:    fmt(m.currentMLL),
      note:     `Kill line is still trailing your balance. Buffer: ${fmt(m.buffer)}. Each losing day pushes it closer. Consistent small gains get you to the lock point faster than swinging.`,
      severity: 'warn',
    })
  } else {
    rules.push({
      label:    'MLL — LOCKED FOREVER 🔒',
      value:    fmt(config.mllLockAt),
      note:     `Trailing drawdown is permanently frozen. Your account cannot be wiped by the MLL mechanic. You now trade for profit, not survival.`,
      severity: 'ok',
    })
  }

  // ── Consistency ───────────────────────────────────────────────────────────
  // Reviewed 2026-09-22 alongside the risk-slider breach marker. Found one
  // real accuracy bug: the old needMore formula (Math.ceil(biggestDay/c) -
  // totalProfit) lands exactly ON the cap boundary rather than strictly
  // under it whenever biggestDay/c happens to be a whole number (e.g. a
  // $3,000 biggest day at a 30% cap = exactly $10,000) — consistencyOk
  // requires strictly < the cap, so that boundary value would still read
  // as blocked. Math.floor(x)+1 is "the next integer strictly greater than
  // x" for any real x, integer or not, so it no longer has that gap (and
  // matches Math.ceil's result in the non-integer case, so no other
  // behavior change).
  if (m.activeConsistencyRule > 0) {
    if (!m.consistencyOk) {
      const targetTotal = Math.floor(m.biggestDay / (m.activeConsistencyRule / 100)) + 1
      const needMore = targetTotal - m.totalProfit
      rules.push({
        label:    `Consistency — PAYOUT BLOCKED`,
        value:    `${m.consistencyPct.toFixed(0)}%`,
        note:     `Biggest day (${fmt(m.biggestDay)}) is over the ${m.activeConsistencyRule}% cap. Add ~${fmt(needMore)} more in profit — any combination of future winning days — to drop the ratio below the threshold. This also caps your Daily Target above, regardless of the risk slider.`,
        severity: 'alert',
      })
    } else if (m.consistencyPct > m.activeConsistencyRule * 0.7) {
      rules.push({
        label:    'Consistency — Getting Close',
        value:    `${m.consistencyPct.toFixed(0)}%`,
        note:     `Approaching the ${m.activeConsistencyRule}% wall. Keep any single day under ${fmt(maxTomorrow)} to stay clear of it — the same ceiling the risk slider above is capped by.`,
        severity: 'warn',
      })
    }
  }

  // ── Payout ready ──────────────────────────────────────────────────────────
  if (m.payoutEligible) {
    rules.push({
      label:    `Payout #${payoutCount + 1} — READY`,
      value:    m.nextPayoutMax != null ? `Up to ${fmt(m.nextPayoutMax)}` : 'Amount not set',
      note:     m.nextPayoutMax != null
        ? `Balance above Safety Net, consistency clear. You can request now. Record the payout in the app so your cycle resets correctly.`
        : `Balance above Safety Net, consistency clear — but this plan's payout ladder hasn't been entered yet, so we can't show a max amount. Check with the firm directly for now.`,
      severity: 'ok',
    })
  } else if (m.aboveSafetyNet >= config.minPayout && m.consistencyOk && m.qualifyingDays < config.minQualifyingDays) {
    rules.push({
      label:    'Payout — Not Enough Qualifying Days',
      value:    `${m.qualifyingDays}/${config.minQualifyingDays}`,
      note:     `Balance and consistency both clear, but you need ${config.minQualifyingDays - m.qualifyingDays} more qualifying day${config.minQualifyingDays - m.qualifyingDays === 1 ? '' : 's'} ($${config.qualifyingDayMin}+ profit) before this firm allows a payout request.`,
      severity: 'warn',
    })
  } else if (m.aboveSafetyNet >= config.minPayout && m.consistencyOk && m.qualifyingDays >= config.minQualifyingDays && !m.payoutFrequencyOk) {
    const daysLeft = config.minDaysBetweenPayouts - (m.daysSinceLastPayout ?? 0)
    rules.push({
      label:    'Payout — Too Soon Since Last Payout',
      value:    `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`,
      note:     `Everything else clears, but this account requires ${config.minDaysBetweenPayouts} days between payout requests. Come back in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`,
      severity: 'warn',
    })
  }

  // ── Recent trend ──────────────────────────────────────────────────────────
  if (entries.length >= 3) {
    const recent     = entries.slice(-3)
    const recentLoss = recent.filter(e => e.pnl < 0).length
    if (recentLoss >= 2) {
      rules.push({
        label:    `${recentLoss}/3 Recent Days Were Losses`,
        value:    'Caution Mode',
        note:     `Back-to-back losses are a signal. Tomorrow: minimum size, honour your stop the moment you hit it, zero revenge trading.`,
        severity: 'alert',
      })
    }
    const lastDay = recent[recent.length - 1]
    // qualifyingDayMin*2.5 degenerates to ">$0" — any winning day at all —
    // for firms with no qualifying minimum (Lucid entirely, Tradeify
    // Lightning/Select Daily: qualifyingDayMin=0). Found 2026-09-22 via a
    // live-account audit: a genuine $304 day on a $50K Lucid account was
    // flagging as "Big Day Yesterday" even though it's under that
    // account's own $375 Daily Target. Falls back to baseTarget (the same
    // size-scaled floor the risk slider is built from, always > 0) so
    // "big day" stays a real bar instead of firing on a few-dollar win —
    // unchanged for every firm that already has a real qualifyingDayMin.
    const bigDayThreshold = (config.qualifyingDayMin > 0 ? config.qualifyingDayMin : baseTarget) * 2.5
    if (lastDay.pnl > bigDayThreshold) {
      rules.push({
        label:    'Big Day Yesterday',
        value:    fmtS(lastDay.pnl),
        note:     `After a strong session the urge is to press harder. Resist it — hit your target and walk away. Let the big day compound naturally.`,
        severity: 'warn',
      })
    }
  }

  return rules
}
