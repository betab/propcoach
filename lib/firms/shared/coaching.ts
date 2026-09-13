// lib/firms/shared/coaching.ts
// ─────────────────────────────────────────────────────────────────────────────
// Coaching-card generation. Firm-agnostic, moved here verbatim from the old
// lib/firms/apex/rules.ts. The internal thresholds (0.7 "getting close"
// multiplier, 2.5x big-day multiplier, 0.4 stop-loss fraction) stay as code
// constants shared across all firms, not DB fields, per the firm-management
// milestone plan.
// ─────────────────────────────────────────────────────────────────────────────
import type { AccountConfig, Entry, DerivedMetrics, CoachingRule } from '../types'

function fmt(n: number)  { return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString() }
function fmtS(n: number) { return (n > 0 ? '+$' : n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString() }

export function buildCoaching(
  config:      AccountConfig,
  m:           DerivedMetrics,
  entries:     Entry[],
  payoutCount: number
): CoachingRule[] {
  const rules: CoachingRule[] = []

  const phase = !m.mllLocked
    ? 'lock'
    : m.aboveSafetyNet < 0
    ? 'build'
    : 'payout'

  // Max profit tomorrow before tripping 50% consistency wall
  const maxTomorrow = m.totalProfit > 0
    ? Math.floor(m.totalProfit * (config.consistencyRule / 100 - 0.001)) - m.biggestDay
    : 99999
  const safeTarget = maxTomorrow > 50 && maxTomorrow < 300 ? maxTomorrow : 300
  const stopLoss   = Math.min(
    config.dailyLossLimit ?? config.drawdownAmount,
    Math.floor(m.buffer * 0.4)
  )

  // ── Target ────────────────────────────────────────────────────────────────
  let tNote = ''
  if (phase === 'lock')
    tNote = `Priority is reaching ${fmt(config.safetyNet)} so your MLL permanently freezes at ${fmt(config.mllLockAt)}. ${fmt(Math.max(0, config.safetyNet - m.currentBalance))} to go. Build it consistently — one bad swing can push the MLL up before you lock it.`
  else if (phase === 'build')
    tNote = `MLL locked ✅ Now build above the ${fmt(config.safetyNet)} Safety Net to unlock payout requests. ${fmt(Math.abs(m.aboveSafetyNet))} remaining.`
  else if (maxTomorrow < 300 && maxTomorrow > 0)
    tNote = `Your biggest day (${fmt(m.biggestDay)}) is ${m.consistencyPct.toFixed(0)}% of total profit. Staying under ${fmt(safeTarget)} tomorrow keeps you payout-eligible.`
  else
    tNote = `Consistency healthy at ${m.consistencyPct.toFixed(0)}%. This target qualifies the day and keeps you well clear of the ${config.consistencyRule}% cap.`

  rules.push({
    label: 'Daily Target',
    value: fmt(safeTarget),
    note:  tNote,
    severity: maxTomorrow > 0 && maxTomorrow < 300 ? 'warn' : 'ok',
  })

  // ── Stop loss ─────────────────────────────────────────────────────────────
  const dllNote = config.dailyLossLimit
    ? ` Your $${config.dailyLossLimit.toLocaleString()} DLL would pause you at that point anyway — honour this earlier.`
    : ` No DLL on this account type — the MLL is your only hard floor.`
  rules.push({
    label: 'Stop Trading If Down',
    value: fmt(stopLoss),
    note:  `${Math.round((stopLoss / (config.dailyLossLimit ?? config.drawdownAmount)) * 100)}% of your max daily loss.${dllNote}`,
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
  if (config.consistencyRule > 0) {
    if (!m.consistencyOk) {
      const needMore = Math.ceil(m.biggestDay / (config.consistencyRule / 100) - m.totalProfit)
      rules.push({
        label:    `Consistency — PAYOUT BLOCKED`,
        value:    `${m.consistencyPct.toFixed(0)}%`,
        note:     `Biggest day is over ${config.consistencyRule}% of total profit. Need ~${fmt(needMore)} more across multiple sessions to drop below the threshold.`,
        severity: 'alert',
      })
    } else if (m.consistencyPct > config.consistencyRule * 0.7) {
      rules.push({
        label:    'Consistency — Getting Close',
        value:    `${m.consistencyPct.toFixed(0)}%`,
        note:     `Approaching the ${config.consistencyRule}% wall. Avoid a large single day until you have more total profit cushion.`,
        severity: 'warn',
      })
    }
  }

  // ── Payout ready ──────────────────────────────────────────────────────────
  if (m.payoutEligible) {
    rules.push({
      label:    `Payout #${payoutCount + 1} — READY`,
      value:    `Up to ${fmt(m.nextPayoutMax)}`,
      note:     `Balance above Safety Net, consistency clear. You can request now. Record the payout in the app so your cycle resets correctly.`,
      severity: 'ok',
    })
  } else if (m.aboveSafetyNet >= config.minPayout && m.consistencyOk && m.qualifyingDays < config.minQualifyingDays) {
    rules.push({
      label:    'Payout — Not Enough Qualifying Days',
      value:    `${m.qualifyingDays}/${config.minQualifyingDays}`,
      note:     `Balance and consistency both clear, but you need ${config.minQualifyingDays - m.qualifyingDays} more qualifying day${config.minQualifyingDays - m.qualifyingDays === 1 ? '' : 's'} ($${config.qualifyingDayMin}+ profit) before this firm allows a payout request.`,
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
    if (lastDay.pnl > config.qualifyingDayMin * 2.5) {
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
