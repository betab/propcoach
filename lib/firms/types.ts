// lib/firms/types.ts
// ─────────────────────────────────────────────────────────────────────────────
// Every prop firm in the system implements these interfaces.
// UI components only ever interact with these types — never firm-specific code.
// Adding a new firm = create its config + rules files, register in index.ts.
// ─────────────────────────────────────────────────────────────────────────────

export type DrawdownType = 'trailing_eod' | 'trailing_intraday' | 'static'
export type AccountPlan  = 'free' | 'pro'
export type AccountStatus = 'active' | 'breached' | 'passed'

// ── Raw entry from database ───────────────────────────────────────────────────
export interface Entry {
  id:              string
  account_id:      string
  user_id:         string
  date:            string          // ISO date 'YYYY-MM-DD'
  closing_balance: number
  pnl:             number
  contracts:       number
  notes:           string
  created_at:      string
}

// ── Payout record ─────────────────────────────────────────────────────────────
export interface Payout {
  id:          string
  account_id:  string
  amount:      number
  recorded_at: string
}

// ── Account row from database ─────────────────────────────────────────────────
export interface Account {
  id:             string
  user_id:        string
  firm_id:        string
  nickname:       string
  account_number: string
  size:           number
  drawdown_type:  DrawdownType
  version:        string
  start_date:     string
  is_active:      boolean
  status:         AccountStatus
  payout_count:   number
  daily_loss_limit_enabled: boolean  // trader's one-time opt-in, set at creation — see migration 006
  created_at:     string
}

// ── Configuration for a specific account size at a specific firm ──────────────
export interface AccountConfig {
  firmId:            string
  firmName:          string
  firmLogo:          string          // path to logo in /public/logos/
  accountSize:       number
  drawdownType:      DrawdownType
  drawdownAmount:    number          // absolute $ amount
  startingMLL:       number          // accountSize - drawdownAmount
  safetyNet:         number          // point at which MLL locks + payouts unlock
  mllLockAt:         number          // MLL freezes here forever
  dailyLossLimit:    number | null   // effective DLL for this account (base, or the opted-in amount)
  optionalDailyLossLimit: number | null  // the $ amount if this size lets a trader opt into a DLL that isn't already on by default; null = no such option offered
  scaleDllPct:       number | null   // e.g. Lucid's "LucidScale DLL": once mllLocked, DLL becomes this % of peakBalance instead of a fixed $ amount; null = no such mechanic
  qualifyingDayMin:  number          // min $ profit for a day to qualify
  minQualifyingDays: number          // min count of qualifying days before payout eligible (0 = no gate)
  maxContracts:      number
  consistencyRule:   number          // max % any single day can be of total profit (0 = no rule) — the flat/base value; see consistencyRuleSchedule for firms that escalate it
  consistencyRuleSchedule: number[] | null  // e.g. Tradeify Lightning's escalating consistency: [20,25,30] = 20% before any payout, 25% after the first, 30% after the second+ — same indexing pattern as payoutLadder. null/empty = no escalation, consistencyRule applies at every payout count
  payoutLadder:      number[]        // max withdrawal per payout, by payout number
  minPayout:         number
  minDaysBetweenPayouts: number      // e.g. Tradeify Select Flex's 5-day gate between payout requests; 0 = no gate (payout-eligible any day the other conditions clear)
}

// ── All computed metrics for a given account ──────────────────────────────────
export interface DerivedMetrics {
  currentBalance:   number
  peakBalance:      number
  currentMLL:       number
  mllLocked:        boolean
  effectiveDailyLossLimit: number | null  // config.dailyLossLimit, unless dllIsDynamic — then peakBalance * scaleDllPct%
  dllIsDynamic:     boolean          // true once mllLocked && config.scaleDllPct is set — the DLL shown should be effectiveDailyLossLimit, recomputed daily, not a fixed number
  buffer:           number          // currentBalance - currentMLL
  safetyNet:        number
  aboveSafetyNet:   number          // negative = below safety net
  qualifyingDays:   number
  totalProfit:      number
  biggestDay:       number
  consistencyPct:   number
  consistencyOk:    boolean
  activeConsistencyRule: number  // the % actually in effect right now — config.consistencyRule, or the schedule-resolved value once payouts have started. Use this for display, never config.consistencyRule directly
  daysSinceLastPayout: number | null  // null = no prior payout recorded (the gate never applies to a first payout)
  payoutFrequencyOk: boolean         // false only when minDaysBetweenPayouts hasn't elapsed since the last payout
  payoutEligible:   boolean
  nextPayoutMax:    number
  mllLockProgress:  number          // 0–100 toward locking MLL
  winDays:          number
  lossDays:         number
  winRate:          number          // 0–100
}

// ── A single coaching card ────────────────────────────────────────────────────
export interface CoachingRule {
  label:    string
  value:    string
  note:     string
  severity: 'ok' | 'warn' | 'alert'
}

// ── A prop firm's named ruleset (e.g. Apex "4.0" vs "Legacy") ─────────────────
export interface FirmVersion {
  key:   string   // '4.0', 'legacy', 'standard'
  label: string   // '4.0 (March 2026+)'
}

// ── Firm metadata for the registry ───────────────────────────────────────────
export interface FirmMeta {
  id:          string
  name:        string
  logo:        string
  isActive:    boolean              // show in UI?
  comingSoon:  boolean              // show greyed-out "coming soon" badge
}
