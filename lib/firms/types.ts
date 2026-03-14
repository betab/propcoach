// lib/firms/types.ts
// ─────────────────────────────────────────────────────────────────────────────
// Every prop firm in the system implements these interfaces.
// UI components only ever interact with these types — never firm-specific code.
// Adding a new firm = create its config + rules files, register in index.ts.
// ─────────────────────────────────────────────────────────────────────────────

export type DrawdownType = 'trailing_eod' | 'trailing_intraday' | 'static'
export type AccountPlan  = 'free' | 'pro'

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
  payout_count:   number
  created_at:     string
}

// ── Configuration for a specific account size at a specific firm ──────────────
export interface AccountConfig {
  firmId:           string
  firmName:         string
  firmLogo:         string          // path to logo in /public/logos/
  accountSize:      number
  drawdownType:     DrawdownType
  drawdownAmount:   number          // absolute $ amount
  startingMLL:      number          // accountSize - drawdownAmount
  safetyNet:        number          // point at which MLL locks + payouts unlock
  mllLockAt:        number          // MLL freezes here forever
  dailyLossLimit:   number | null   // null = no DLL (e.g. Intraday accounts)
  qualifyingDayMin: number          // min $ profit for a day to qualify
  maxContracts:     number
  consistencyRule:  number          // max % any single day can be of total profit (0 = no rule)
  payoutLadder:     number[]        // max withdrawal per payout, by payout number
  minPayout:        number
}

// ── All computed metrics for a given account ──────────────────────────────────
export interface DerivedMetrics {
  currentBalance:   number
  peakBalance:      number
  currentMLL:       number
  mllLocked:        boolean
  buffer:           number          // currentBalance - currentMLL
  safetyNet:        number
  aboveSafetyNet:   number          // negative = below safety net
  qualifyingDays:   number
  totalProfit:      number
  biggestDay:       number
  consistencyPct:   number
  consistencyOk:    boolean
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

// ── What every firm's rules module must export ────────────────────────────────
export interface FirmRules {
  getConfig(size: number, drawdownType: DrawdownType, version?: string): AccountConfig
  getAvailableSizes(): number[]
  derive(config: AccountConfig, entries: Entry[], payoutCount: number): DerivedMetrics
  buildCoaching(config: AccountConfig, metrics: DerivedMetrics, entries: Entry[], payoutCount: number): CoachingRule[]
}

// ── Firm metadata for the registry ───────────────────────────────────────────
export interface FirmMeta {
  id:          string
  name:        string
  logo:        string
  isActive:    boolean              // show in UI?
  comingSoon:  boolean              // show greyed-out "coming soon" badge
  rules:       FirmRules
}
