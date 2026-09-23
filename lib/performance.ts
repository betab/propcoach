// lib/performance.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cross-account aggregation for the Performance Home page (app/(app)/home).
// Pure, framework-free like lib/firms/shared/derive.ts/coaching.ts — takes
// already-fetched rows, does no Supabase calls of its own except
// loadActiveAccountMetrics (which resolves per-account firm config, the one
// piece that's inherently per-account rather than a single aggregate query).
//
// Nothing here touches archived accounts' AccountConfig/DerivedMetrics —
// lifetime P&L and win rate come straight from raw entries, and the Archive
// orb only needs status counts, not derived metrics. See home/page.tsx's own
// comments for the query shape this is built against (three queries total,
// no N+1 — both entries and payouts carry user_id directly).
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js'
import { getFirmConfigForAccount, derive, deriveBalanceHistory, getPhase } from './firms'
import type { Phase } from './firms'
import type { Account, AccountConfig, DerivedMetrics, Entry, Payout, FirmMeta } from './firms/types'

export interface AccountWithMetrics {
  account: Account
  config:  AccountConfig
  metrics: DerivedMetrics
  phase:   Phase
}

// Same 0.7 "getting close" threshold buildCoaching() uses for its own
// "Consistency — Getting Close" card (lib/firms/shared/coaching.ts) — kept
// identical so the left rail's "N close" count never disagrees with what an
// individual account page would say about itself.
const CONSISTENCY_CLOSE_THRESHOLD = 0.7

// An account "needs attention" — always gets its own orb regardless of how
// many total accounts exist — when it's actionable right now: ready for a
// real payout, close enough to locking its MLL that it's worth watching,
// already blocked on consistency, or freshly breached.
function needsAttention(entry: AccountWithMetrics): boolean {
  return entry.metrics.payoutEligible
    || entry.metrics.mllLockProgress >= 90
    || !entry.metrics.consistencyOk
    || entry.account.status === 'breached'
}

// Resolves AccountConfig + derive() for each active account, memoized by the
// exact tuple that determines a resolved config (so accounts sharing it —
// the same key classifyOrbs() consolidates by — resolve it once). One
// account's resolution failure collects into `errored` rather than
// throwing, mirroring dashboard/page.tsx's AccountCard try/catch.
export async function loadActiveAccountMetrics(
  supabase: SupabaseClient,
  activeAccounts: Account[],
  entriesByAccount: Map<string, Entry[]>,
  lastPayoutByAccount: Map<string, string | null>
): Promise<{ ok: AccountWithMetrics[]; errored: Account[] }> {
  const configCache = new Map<string, Promise<AccountConfig>>()
  const configKey = (a: Account) =>
    `${a.firm_id}|${a.version}|${a.size}|${a.drawdown_type}|${a.start_date}|${a.daily_loss_limit_enabled}`

  const ok: AccountWithMetrics[] = []
  const errored: Account[] = []

  await Promise.all(activeAccounts.map(async account => {
    try {
      const key = configKey(account)
      let configPromise = configCache.get(key)
      if (!configPromise) {
        configPromise = getFirmConfigForAccount(supabase, account)
        configCache.set(key, configPromise)
      }
      const config  = await configPromise
      const entries = entriesByAccount.get(account.id) ?? []
      const metrics = derive(config, entries, account.payout_count, lastPayoutByAccount.get(account.id) ?? null)
      ok.push({ account, config, metrics, phase: getPhase(metrics) })
    } catch {
      errored.push(account)
    }
  }))

  return { ok, errored }
}

export type OrbGroup =
  | { kind: 'individual';   entry: AccountWithMetrics }
  | { kind: 'consolidated'; firmId: string; size: number; phase: Phase; members: AccountWithMetrics[] }
  | { kind: 'other';        members: AccountWithMetrics[] }

const MAX_INDIVIDUAL_STEADY = 8

// The approved node-scaling rule (plan file, "Performance dashboard"
// section): needs-attention accounts are always individual; up to 8 more
// steady accounts are individual; remaining steady accounts consolidate by
// exact firm+size+phase match (×N badge); true one-offs with no match
// become a single "other" bucket. Keeps total orbs bounded regardless of
// how many total accounts exist.
export function classifyOrbs(accounts: AccountWithMetrics[]): OrbGroup[] {
  const urgent = accounts.filter(needsAttention)
  const steady = accounts.filter(a => !needsAttention(a))

  const urgentGroups: OrbGroup[] = urgent.map(entry => ({ kind: 'individual', entry }))

  const individualSteady = steady.slice(0, MAX_INDIVIDUAL_STEADY)
  const overflowSteady   = steady.slice(MAX_INDIVIDUAL_STEADY)
  const individualSteadyGroups: OrbGroup[] = individualSteady.map(entry => ({ kind: 'individual', entry }))

  const groupMap = new Map<string, AccountWithMetrics[]>()
  for (const entry of overflowSteady) {
    const key = `${entry.account.firm_id}|${entry.account.size}|${entry.phase}`
    const arr = groupMap.get(key) ?? []
    arr.push(entry)
    groupMap.set(key, arr)
  }

  const consolidatedGroups: OrbGroup[] = []
  const otherMembers: AccountWithMetrics[] = []
  for (const [key, members] of groupMap) {
    if (members.length >= 2) {
      const [firmId, sizeStr, phase] = key.split('|')
      consolidatedGroups.push({ kind: 'consolidated', firmId, size: Number(sizeStr), phase: phase as Phase, members })
    } else {
      otherMembers.push(...members)
    }
  }
  const otherGroup: OrbGroup[] = otherMembers.length > 0 ? [{ kind: 'other', members: otherMembers }] : []

  return [...urgentGroups, ...individualSteadyGroups, ...consolidatedGroups, ...otherGroup]
}

export interface PortfolioSummary { lifetimePnl: number; winRate: number; winDays: number; lossDays: number }

// Straight from raw entries (ALL accounts — active AND archived, this is
// real lifetime trading history and doesn't vanish when an account is
// archived) — no AccountConfig/derive() needed at all for this number.
// winRate matches derive.ts's own convention: win days / total entries
// (not win/(win+loss) — flat days count in the denominator, not the
// numerator).
export function computePortfolioSummary(allEntries: Entry[]): PortfolioSummary {
  const lifetimePnl = allEntries.reduce((s, e) => s + e.pnl, 0)
  const winDays  = allEntries.filter(e => e.pnl > 0).length
  const lossDays = allEntries.filter(e => e.pnl < 0).length
  const winRate  = allEntries.length ? Math.round((winDays / allEntries.length) * 100) : 0
  return { lifetimePnl, winRate, winDays, lossDays }
}

export interface DailyPortfolioPoint { date: string; cumulativePnl: number }

// Groups every entry (all accounts, active + archived) by calendar date,
// sums pnl per date, then a running cumulative total. Deliberately not a
// reuse of deriveBalanceHistory — that's one-account peak/MLL math against
// a single starting balance, not a cross-account calendar grouping.
export function deriveDailyPortfolioPnl(allEntries: Entry[]): DailyPortfolioPoint[] {
  const byDate = new Map<string, number>()
  for (const e of allEntries) byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.pnl)

  const dates = Array.from(byDate.keys()).sort()
  let running = 0
  return dates.map(date => {
    running += byDate.get(date)!
    return { date, cumulativePnl: running }
  })
}

// A single HUD rail tile — label/value/optional accent color. Lived in
// components/LeftRail.tsx originally; moved here once PerformanceCustomizer
// took over rendering the rail directly (drag-and-drop needs per-tile
// control LeftRail's own markup didn't have) and LeftRail itself became
// dead code.
export interface StatTile {
  label: string
  value: string
  color?: string
}

export interface LeftRailStats {
  mllLockedCount: number
  totalActiveCount: number
  payoutsCount: number
  payoutsSum: number
  consistencyBlockedCount: number
  consistencyCloseCount: number
}

export function computeLeftRailStats(ok: AccountWithMetrics[], totalActiveCount: number, payouts: Payout[]): LeftRailStats {
  const mllLockedCount = ok.filter(a => a.metrics.mllLocked).length
  const payoutsCount = payouts.length
  const payoutsSum   = payouts.reduce((s, p) => s + (p.amount ?? 0), 0)

  let consistencyBlockedCount = 0
  let consistencyCloseCount   = 0
  for (const a of ok) {
    if (a.metrics.activeConsistencyRule <= 0) continue
    if (!a.metrics.consistencyOk) consistencyBlockedCount++
    else if (a.metrics.consistencyPct > a.metrics.activeConsistencyRule * CONSISTENCY_CLOSE_THRESHOLD) consistencyCloseCount++
  }

  return { mllLockedCount, totalActiveCount, payoutsCount, payoutsSum, consistencyBlockedCount, consistencyCloseCount }
}

export interface ArchiveSummary { total: number; passed: number; breached: number }

export function computeArchiveSummary(archivedAccounts: Account[]): ArchiveSummary {
  return {
    total:    archivedAccounts.length,
    passed:   archivedAccounts.filter(a => a.status === 'passed').length,
    breached: archivedAccounts.filter(a => a.status === 'breached').length,
  }
}

export interface PayoutLogEntry {
  accountId:  string
  label:      string
  firmName:   string
  amount:     number | null
  recordedAt: string
}

// Joins in JS from data already in memory (accounts + firms) — no per-payout
// query. Expects `payouts` already ordered how the caller wants displayed
// (home/page.tsx fetches recorded_at descending); this function doesn't
// re-sort or slice.
export function buildPayoutLog(payouts: Payout[], accounts: Account[], firms: FirmMeta[]): PayoutLogEntry[] {
  const accountById = new Map(accounts.map(a => [a.id, a]))
  const firmById     = new Map(firms.map(f => [f.id, f]))

  return payouts.map(p => {
    const account  = accountById.get(p.account_id)
    const label    = account?.nickname || (account ? `${(account.size / 1000).toFixed(0)}K Account` : 'Unknown Account')
    const firmName = account ? (firmById.get(account.firm_id)?.name ?? account.firm_id) : 'Unknown Firm'
    return { accountId: p.account_id, label, firmName, amount: p.amount, recordedAt: p.recorded_at }
  })
}

export interface ConsistencyWatchPoint {
  date:      string
  pctOfCap:  number  // 0-100+, 100 = at the cap
  accountId: string
  label:     string  // whichever account is worst that day — the identity can change day to day
}

// "Consistency Watch" (final name, per user sign-off): each day, the single
// worst-offender active account — highest cumulative-consistency-to-date as
// a % of ITS OWN cap. Line identity can change day to day as the worst
// offender changes; that's deliberate, not a bug. Documented approximation:
// firms with an escalating consistency schedule (Tradeify Lightning) use
// today's activeConsistencyRule applied retroactively, since historical
// payout-count-as-of-date isn't tracked — there is no clean way to
// reconstruct what the cap actually was on a past date for those firms.
export function deriveConsistencyWatch(
  ok: AccountWithMetrics[],
  entriesByAccount: Map<string, Entry[]>
): ConsistencyWatchPoint[] {
  const relevant = ok.filter(a => a.metrics.activeConsistencyRule > 0)
  if (relevant.length === 0) return []

  const allDates = new Set<string>()
  const entriesByAccountByDate = new Map<string, Map<string, Entry>>()
  for (const a of relevant) {
    const byDate = new Map<string, Entry>()
    for (const e of entriesByAccount.get(a.account.id) ?? []) {
      byDate.set(e.date, e)
      allDates.add(e.date)
    }
    entriesByAccountByDate.set(a.account.id, byDate)
  }
  const dates = Array.from(allDates).sort()

  const state = new Map<string, { totalProfit: number; biggestDay: number }>()
  for (const a of relevant) state.set(a.account.id, { totalProfit: 0, biggestDay: 0 })

  const points: ConsistencyWatchPoint[] = []
  for (const date of dates) {
    let worst: { pctOfCap: number; accountId: string; label: string } | null = null

    for (const a of relevant) {
      const entry = entriesByAccountByDate.get(a.account.id)?.get(date)
      const s = state.get(a.account.id)!
      if (entry && entry.pnl > 0) {
        s.totalProfit += entry.pnl
        if (entry.pnl > s.biggestDay) s.biggestDay = entry.pnl
      }
      // A losing/flat day, or no entry at all today, leaves totalProfit/
      // biggestDay unchanged — carried forward from this account's last
      // real winning day, same as derive.ts's own totalProfit definition
      // (sums winning entries only).

      if (s.totalProfit <= 0) continue // nothing meaningful to rate yet
      const pctOfCap = (s.biggestDay / s.totalProfit) / (a.metrics.activeConsistencyRule / 100) * 100
      if (!worst || pctOfCap > worst.pctOfCap) {
        worst = { pctOfCap, accountId: a.account.id, label: a.account.nickname || `${(a.account.size / 1000).toFixed(0)}K` }
      }
    }

    if (worst) points.push({ date, ...worst })
  }

  return points
}

// ─────────────────────────────────────────────────────────────────────────────
// The 4 new metrics approved via the metric-library mockup (2026-09-23), plus
// the 2 rail tiles already implied by the original Combined_Home mockup
// (Avg Days to Lock, Largest Drawdown) but never actually wired in.
// ─────────────────────────────────────────────────────────────────────────────

// Average days from an account's start_date to the day its trailing MLL
// first locked (deriveBalanceHistory's own per-entry `minimum` reaching
// config.mllLockAt — the exact same threshold derive.ts's mllLocked uses),
// across every active account that has locked. Scoped to active accounts
// only (needs firm-config resolution, same scope as the other config-
// dependent rail tiles like MLL Locked/Consistency) — unlike the other new
// metrics below, which are config-free and so can span all entries,
// archived accounts included.
export function computeAvgDaysToLock(
  ok: AccountWithMetrics[],
  entriesByAccount: Map<string, Entry[]>
): number | null {
  const daysToLock: number[] = []

  for (const { account, config } of ok) {
    const entries = entriesByAccount.get(account.id) ?? []
    const history = deriveBalanceHistory(config, entries)
    const lockPoint = history.find(p => p.minimum >= config.mllLockAt)
    if (lockPoint) {
      const days = Math.round(
        (new Date(lockPoint.date).getTime() - new Date(account.start_date).getTime()) / 86_400_000
      )
      daysToLock.push(days)
    }
  }

  if (daysToLock.length === 0) return null
  return Math.round(daysToLock.reduce((s, d) => s + d, 0) / daysToLock.length)
}

// The single worst (most negative) logged day's P&L, portfolio-wide, across
// every account (active + archived — a real historical low doesn't stop
// counting once its account is archived). Config-free: just raw entries.
export function computeLargestDrawdown(allEntries: Entry[]): number {
  const losses = allEntries.filter(e => e.pnl < 0).map(e => e.pnl)
  return losses.length ? Math.min(...losses) : 0
}

// Shared by the streak/avg/trend/best-worst metrics below — one row per
// calendar date with that date's total P&L summed across every account.
function dailyTotals(allEntries: Entry[]): { date: string; total: number }[] {
  const byDate = new Map<string, number>()
  for (const e of allEntries) byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.pnl)
  return Array.from(byDate.entries())
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export interface StreakInfo { days: number; direction: 'win' | 'loss' }

// Consecutive winning or losing days, portfolio-wide, counting back from the
// most recent logged day. A flat (exactly $0) most-recent day breaks any
// streak rather than extending one, same as it does nowhere — there's no
// "flat" direction to report.
export function computeCurrentStreak(allEntries: Entry[]): StreakInfo | null {
  const days = dailyTotals(allEntries)
  if (days.length === 0) return null

  const lastSign = Math.sign(days[days.length - 1].total)
  if (lastSign === 0) return null

  let count = 0
  for (let i = days.length - 1; i >= 0; i--) {
    if (Math.sign(days[i].total) !== lastSign) break
    count++
  }
  return { days: count, direction: lastSign > 0 ? 'win' : 'loss' }
}

// Average P&L per logged day, portfolio-wide — a steadier number than any
// single day's swing, since multiple accounts' entries on the same date are
// summed into one day first (dailyTotals), not averaged per-entry.
export function computeAvgDailyPnl(allEntries: Entry[]): number {
  const days = dailyTotals(allEntries)
  return days.length ? days.reduce((s, d) => s + d.total, 0) / days.length : 0
}

export interface WinRateTrendPoint { date: string; winRatePct: number }

// Rolling win-rate line: for each logged day, the % of the trailing
// `windowDays` calendar-days-with-entries (not calendar days — weekends/
// no-log days don't dilute the window) that were net winning days. Fewer
// than `windowDays` of history so far → whatever's available, same
// "partial window at the start" behavior a rolling average always has.
export function deriveWinRateTrend(allEntries: Entry[], windowDays = 7): WinRateTrendPoint[] {
  const days = dailyTotals(allEntries)
  return days.map((d, i) => {
    const window = days.slice(Math.max(0, i - windowDays + 1), i + 1)
    const wins = window.filter(w => w.total > 0).length
    return { date: d.date, winRatePct: Math.round((wins / window.length) * 100) }
  })
}

export interface BestWorstDay { date: string; pnl: number }
export interface BestWorstWeekly { best: BestWorstDay | null; worst: BestWorstDay | null }

// The single best and worst logged day, portfolio-wide, within the trailing
// `windowDays` (default 7 — "weekly", per the approved mockup) days that
// actually have entries. Not a calendar-week boundary — a rolling window,
// consistent with deriveWinRateTrend's own "rolling" framing.
export function deriveBestWorstDayWeekly(allEntries: Entry[], windowDays = 7): BestWorstWeekly {
  const days = dailyTotals(allEntries)
  const recent = days.slice(-windowDays)
  if (recent.length === 0) return { best: null, worst: null }

  const best  = recent.reduce((a, b) => (b.total > a.total ? b : a))
  const worst = recent.reduce((a, b) => (b.total < a.total ? b : a))
  return { best: { date: best.date, pnl: best.total }, worst: { date: worst.date, pnl: worst.total } }
}
