// lib/metric-registry.ts
// The source of truth for every metric Performance Home can show — what the
// "+ Add Metric" drawer lists, and what a saved profiles.performance_layout
// is validated against. Pure metadata only (no rendering); home/page.tsx
// maps each id to its actual pre-computed value/component.
export type MetricId =
  | 'mll_locked' | 'payouts_to_date' | 'consistency_all' | 'avg_days_to_lock' | 'largest_drawdown'
  | 'current_streak' | 'avg_daily_pnl'
  | 'pnl_waveform' | 'consistency_watch' | 'mll_progress' | 'payout_log' | 'best_worst_weekly' | 'win_rate_trend'

export type MetricCategory = 'rail' | 'detail'

export interface MetricDef {
  id:          MetricId
  category:    MetricCategory
  label:       string
  description: string
  color:       string
}

export const METRIC_REGISTRY: MetricDef[] = [
  { id: 'mll_locked',        category: 'rail', label: 'MLL Locked',         description: 'Accounts with drawdown locked, out of total active',                    color: '#00ff88' },
  { id: 'payouts_to_date',   category: 'rail', label: 'Payouts to Date',    description: 'Count and total $ across every account',                                color: '#7aa3d4' },
  { id: 'consistency_all',   category: 'rail', label: 'Consistency (All)',  description: 'Blocked / close-to-cap accounts, portfolio-wide',                       color: '#ffaa00' },
  { id: 'avg_days_to_lock',  category: 'rail', label: 'Avg Days to Lock',   description: 'Average time-to-MLL-lock across accounts that have locked',             color: '#e8eef2' },
  { id: 'largest_drawdown',  category: 'rail', label: 'Largest Drawdown',   description: 'Deepest single-day balance dip, portfolio-wide',                        color: '#ff4444' },
  { id: 'current_streak',    category: 'rail', label: 'Current Streak',     description: 'Consecutive winning or losing days, portfolio-wide',                    color: '#00ff88' },
  { id: 'avg_daily_pnl',     category: 'rail', label: 'Avg Daily P&L',      description: 'Average P&L per logged day, portfolio-wide',                            color: '#7aa3d4' },

  { id: 'pnl_waveform',      category: 'detail', label: 'P&L Waveform',              description: 'Cumulative profit & loss across every account, over time',        color: '#00ff88' },
  { id: 'consistency_watch', category: 'detail', label: 'Consistency Watch',         description: "Worst-offender account per day, vs. its own cap",                color: '#ffaa00' },
  { id: 'mll_progress',      category: 'detail', label: 'MLL Lock Progress',         description: 'Per-account bars toward locking the trailing drawdown',           color: '#7aa3d4' },
  { id: 'payout_log',        category: 'detail', label: 'Payout Log',                description: 'Every recorded payout, most recent first',                        color: '#e8eef2' },
  { id: 'best_worst_weekly', category: 'detail', label: 'Best/Worst Day (Weekly)',   description: "This week's single best and worst P&L day, portfolio-wide",       color: '#ff4444' },
  { id: 'win_rate_trend',    category: 'detail', label: 'Win Rate Trend (Rolling)',  description: 'Rolling 7-day win-rate line — trending up or down?',              color: '#00ff88' },
]

export const METRIC_BY_ID = new Map(METRIC_REGISTRY.map(m => [m.id, m]))

export const DEFAULT_RAIL_LAYOUT: MetricId[]   = METRIC_REGISTRY.filter(m => m.category === 'rail').map(m => m.id)
export const DEFAULT_DETAIL_LAYOUT: MetricId[] = METRIC_REGISTRY.filter(m => m.category === 'detail').map(m => m.id)

export interface PerformanceLayout {
  rail:   MetricId[]
  detail: MetricId[]
}

function sanitizeIds(raw: unknown, category: MetricCategory): MetricId[] {
  const validIds = METRIC_REGISTRY.filter(m => m.category === category).map(m => m.id)
  const validSet = new Set<string>(validIds)
  const kept: MetricId[] = Array.isArray(raw)
    ? raw.filter((id): id is MetricId => typeof id === 'string' && validSet.has(id))
    : []
  // Any registry id not already in the stored order — either the user never
  // saved this category, or a metric was added to the registry after their
  // last save — gets appended so it still surfaces, at the end.
  const missing = validIds.filter(id => !kept.includes(id))
  return [...kept, ...missing]
}

// Validates a stored profiles.performance_layout against the current
// registry: drops ids no longer valid (a metric removed from the registry),
// appends any registry ids missing from the stored order (a metric added
// since the user's last save). Null/undefined (never customized) resolves
// to the full default order for both categories.
export function sanitizeLayout(stored: { rail?: unknown; detail?: unknown } | null | undefined): PerformanceLayout {
  return {
    rail:   sanitizeIds(stored?.rail, 'rail'),
    detail: sanitizeIds(stored?.detail, 'detail'),
  }
}
