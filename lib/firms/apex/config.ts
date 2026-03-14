// lib/firms/apex/config.ts
import type { AccountConfig, DrawdownType } from '../types'

// ── Apex 4.0 account parameters by size ──────────────────────────────────────
// Source: Apex support docs + verified against live PA dashboard March 2026
const APEX_SIZES: Record<number, {
  drawdown:     number
  dll:          number        // daily loss limit (EOD only)
  maxContracts: number        // PA phase contract limit (eval is higher)
  ladder:       number[]      // payout ladder max per withdrawal
}> = {
  25000:  { drawdown: 1500, dll: 500,  maxContracts: 2,  ladder: [500,  750,  1000, 1000, 1250, 1500] },
  50000:  { drawdown: 2500, dll: 1000, maxContracts: 4,  ladder: [1000, 1250, 1500, 1500, 1750, 2000] },
  100000: { drawdown: 3000, dll: 1500, maxContracts: 6,  ladder: [2000, 2500, 3000, 3000, 3500, 4000] },
  150000: { drawdown: 5000, dll: 2000, maxContracts: 9,  ladder: [2500, 3000, 3500, 3500, 4000, 4500] },
}

// Safety net = startBalance + drawdown + $100
// MLL locks when it reaches startBalance + $100
function safetyNet(size: number, drawdown: number) { return size + drawdown + 100 }
function mllLockAt(size: number)                   { return size + 100 }

export function getApexConfig(
  size: number,
  drawdownType: DrawdownType,
  version = '4.0'
): AccountConfig {
  const s = APEX_SIZES[size]
  if (!s) throw new Error(`Apex does not offer a ${size} account size`)

  const dd = s.drawdown
  const sn = safetyNet(size, dd)

  return {
    firmId:           'apex',
    firmName:         'Apex Trader Funding',
    firmLogo:         '/logos/apex.svg',
    accountSize:      size,
    drawdownType,
    drawdownAmount:   dd,
    startingMLL:      size - dd,
    safetyNet:        sn,
    mllLockAt:        mllLockAt(size),
    // Intraday accounts have no daily loss limit — MLL is the only floor
    dailyLossLimit:   drawdownType === 'trailing_eod' ? s.dll : null,
    qualifyingDayMin: 250,
    maxContracts:     s.maxContracts,
    consistencyRule:  50,          // no single day can be ≥50% of total profit
    payoutLadder:     s.ladder,
    minPayout:        500,
  }
}

export function getApexAvailableSizes(): number[] {
  return Object.keys(APEX_SIZES).map(Number)
}
