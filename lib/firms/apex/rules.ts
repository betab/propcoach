// lib/firms/apex/rules.ts
import type {
  AccountConfig, Entry, DerivedMetrics,
  CoachingRule, FirmRules, DrawdownType
} from '../types'
import { getApexConfig, getApexAvailableSizes } from './config'

// ── Core math ─────────────────────────────────────────────────────────────────

function computeMLL(config: AccountConfig, peakBalance: number): number {
  const raw = peakBalance - config.drawdownAmount
  return Math.max(raw, config.mllLockAt)
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }

// ── Derive all metrics from raw entries ───────────────────────────────────────

function derive(
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
  const aboveSN      = bal - config.safetyNet

  const winEntries   = entries.filter(e => e.pnl > 0)
  const lossEntries  = entries.filter(e => e.pnl < 0)
  const qualDays     = entries.filter(e => e.pnl >= config.qualifyingDayMin).length

  const totalProfit  = winEntries.reduce((s, e) => s + e.pnl, 0)
  const biggestDay   = winEntries.length ? Math.max(...winEntries.map(e => e.pnl)) : 0
  const consPct      = totalProfit > 0 ? (biggestDay / totalProfit) * 100 : 0
  const consOk       = config.consistencyRule === 0 || consPct < config.consistencyRule

  const payoutEligible = aboveSN >= config.minPayout && consOk
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

// ── Coaching rules ────────────────────────────────────────────────────────────

function fmt(n: number)  { return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString() }
function fmtS(n: number) { return (n > 0 ? '+$' : n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString() }

function buildCoaching(
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

// ── Export as FirmRules ───────────────────────────────────────────────────────
export const apexRules: FirmRules = {
  getConfig:          (size, type, version) => getApexConfig(size, type as DrawdownType, version),
  getAvailableSizes:  getApexAvailableSizes,
  derive,
  buildCoaching,
}
