// lib/firms/topstep/rules.ts
// ─────────────────────────────────────────────────────────────────────────────
// TopStep Funded Trader rules
// TODO: Implement when adding TopStep support
// Rules reference: https://topstep.com/funded-trader/rules
// ─────────────────────────────────────────────────────────────────────────────
import type { AccountConfig, Entry, DerivedMetrics, CoachingRule, FirmRules, DrawdownType } from '../types'

const TOPSTEP_SIZES: Record<number, {
  drawdown: number
  profitTarget: number
  maxContracts: number
}> = {
  50000:  { drawdown: 2000, profitTarget: 3000, maxContracts: 5  },
  100000: { drawdown: 3000, profitTarget: 6000, maxContracts: 10 },
  150000: { drawdown: 4500, profitTarget: 9000, maxContracts: 15 },
}

function getTopstepConfig(size: number, drawdownType: DrawdownType): AccountConfig {
  const s = TOPSTEP_SIZES[size]
  if (!s) throw new Error(`TopStep does not offer a ${size} account size`)

  return {
    firmId:           'topstep',
    firmName:         'TopStep',
    firmLogo:         '/logos/topstep.svg',
    accountSize:      size,
    drawdownType:     'trailing_eod',        // TopStep uses EOD trailing
    drawdownAmount:   s.drawdown,
    startingMLL:      size - s.drawdown,
    safetyNet:        size + s.drawdown + 100,
    mllLockAt:        size + 100,
    dailyLossLimit:   null,                  // TODO: verify TopStep DLL rules
    qualifyingDayMin: 200,                   // TODO: verify
    maxContracts:     s.maxContracts,
    consistencyRule:  0,                     // TopStep has no consistency rule
    payoutLadder:     [5000, 5000, 5000],    // TODO: verify TopStep payout rules
    minPayout:        100,
  }
}

// Placeholder — uses same derive logic as Apex since math is identical
// Will need firm-specific adjustments once TopStep rules are fully verified
function derive(config: AccountConfig, entries: Entry[], payoutCount: number): DerivedMetrics {
  throw new Error('TopStep rules not yet implemented')
}

function buildCoaching(config: AccountConfig, m: DerivedMetrics, entries: Entry[], payoutCount: number): CoachingRule[] {
  throw new Error('TopStep coaching not yet implemented')
}

export const topstepRules: FirmRules = {
  getConfig:         (size, type) => getTopstepConfig(size, type),
  getAvailableSizes: () => Object.keys(TOPSTEP_SIZES).map(Number),
  derive,
  buildCoaching,
}
