// lib/firms/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Central registry of all prop firms.
// To add a new firm:
//   1. Create lib/firms/{firmid}/config.ts and rules.ts
//   2. Add an entry to FIRM_REGISTRY below
//   3. Add logo to /public/logos/{firmid}.svg
//   4. That's it — the UI picks it up automatically
// ─────────────────────────────────────────────────────────────────────────────

import type { FirmMeta } from './types'
import { apexRules }    from './apex/rules'
import { topstepRules } from './topstep/rules'

export const FIRM_REGISTRY: Record<string, FirmMeta> = {
  apex: {
    id:          'apex',
    name:        'Apex Trader Funding',
    logo:        '/logos/apex.svg',
    isActive:    true,
    comingSoon:  false,
    rules:       apexRules,
  },
  topstep: {
    id:          'topstep',
    name:        'TopStep',
    logo:        '/logos/topstep.svg',
    isActive:    false,
    comingSoon:  true,
    rules:       topstepRules,
  },
  tradeday: {
    id:          'tradeday',
    name:        'TradeDay',
    logo:        '/logos/tradeday.svg',
    isActive:    false,
    comingSoon:  true,
    rules:       null as any,   // implement before setting isActive: true
  },
  mff: {
    id:          'mff',
    name:        'My Funded Futures',
    logo:        '/logos/mff.svg',
    isActive:    false,
    comingSoon:  true,
    rules:       null as any,
  },
}

export function getFirmRules(firmId: string) {
  const firm = FIRM_REGISTRY[firmId]
  if (!firm) throw new Error(`Unknown firm: ${firmId}`)
  if (!firm.isActive) throw new Error(`Firm ${firmId} is not yet active`)
  return firm.rules
}

export function getActiveFirms() {
  return Object.values(FIRM_REGISTRY).filter(f => f.isActive)
}

export function getAllFirms() {
  return Object.values(FIRM_REGISTRY)
}
