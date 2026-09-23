// app/(app)/home/page.tsx
// Performance Home — the post-login landing page. Orchestration only: the
// real aggregation logic lives in lib/performance.ts (framework-free, pure
// functions over already-fetched rows) so it stays testable without a live
// Supabase connection.
import { createClient } from '@/lib/supabase/server'
import { getAllFirms } from '@/lib/firms'
import type { Account, Entry, Payout } from '@/lib/firms/types'
import {
  loadActiveAccountMetrics, classifyOrbs, computePortfolioSummary, deriveDailyPortfolioPnl,
  computeLeftRailStats, computeArchiveSummary, buildPayoutLog, deriveConsistencyWatch,
  computeAvgDaysToLock, computeLargestDrawdown, computeCurrentStreak, computeAvgDailyPnl,
  deriveWinRateTrend, deriveBestWorstDayWeekly,
} from '@/lib/performance'
import OrbitalHero from '@/components/OrbitalHero'
import PnlWaveformPanel from '@/components/SignalPanels/PnlWaveformPanel'
import ConsistencyWatchPanel from '@/components/SignalPanels/ConsistencyWatchPanel'
import MllProgressPanel from '@/components/SignalPanels/MllProgressPanel'
import PayoutLog from '@/components/SignalPanels/PayoutLog'
import WinRateTrendPanel from '@/components/SignalPanels/WinRateTrendPanel'
import BestWorstDayPanel from '@/components/SignalPanels/BestWorstDayPanel'
import PerformanceCustomizer from '@/components/PerformanceCustomizer'
import { sanitizeLayout, type MetricId } from '@/lib/metric-registry'
import type { StatTile } from '@/lib/performance'

function fmtSigned(n: number) {
  return (n < 0 ? '-$' : '+$') + Math.abs(Math.round(n)).toLocaleString()
}

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: accountsRaw }, { data: entriesRaw }, { data: payoutsRaw }, { data: profile }, firms] = await Promise.all([
    supabase.from('accounts').select('*').eq('user_id', user!.id).order('created_at'),
    supabase.from('entries').select('*').eq('user_id', user!.id).order('date', { ascending: true }),
    supabase.from('payouts').select('*').eq('user_id', user!.id).order('recorded_at', { ascending: false }),
    supabase.from('profiles').select('performance_layout').eq('id', user!.id).single(),
    getAllFirms(supabase),
  ])

  const accounts = (accountsRaw || []) as Account[]
  const entries  = (entriesRaw  || []) as Entry[]
  const payouts  = (payoutsRaw  || []) as Payout[]

  const activeAccounts   = accounts.filter(a => a.is_active)
  const archivedAccounts = accounts.filter(a => !a.is_active)

  const entriesByAccount = new Map<string, Entry[]>()
  for (const e of entries) {
    const arr = entriesByAccount.get(e.account_id) ?? []
    arr.push(e)
    entriesByAccount.set(e.account_id, arr)
  }

  // payouts is recorded_at-descending, so the first hit per account_id is the most recent.
  const lastPayoutByAccount = new Map<string, string | null>()
  for (const p of payouts) {
    if (!lastPayoutByAccount.has(p.account_id)) lastPayoutByAccount.set(p.account_id, p.recorded_at)
  }

  const { ok } = await loadActiveAccountMetrics(supabase, activeAccounts, entriesByAccount, lastPayoutByAccount)
  const orbGroups         = classifyOrbs(ok)
  const portfolioSummary  = computePortfolioSummary(entries)
  const dailyPnl          = deriveDailyPortfolioPnl(entries)
  const railStats         = computeLeftRailStats(ok, activeAccounts.length, payouts)
  const archiveSummary    = computeArchiveSummary(archivedAccounts)
  const payoutLog         = buildPayoutLog(payouts, accounts, firms).slice(0, 10)
  const consistencyWatch  = deriveConsistencyWatch(ok, entriesByAccount)
  const avgDaysToLock     = computeAvgDaysToLock(ok, entriesByAccount)
  const largestDrawdown   = computeLargestDrawdown(entries)
  const currentStreak     = computeCurrentStreak(entries)
  const avgDailyPnl       = computeAvgDailyPnl(entries)
  const winRateTrend      = deriveWinRateTrend(entries)
  const bestWorstWeekly   = deriveBestWorstDayWeekly(entries)

  const lockingCount = railStats.totalActiveCount - railStats.mllLockedCount

  const railContent: Partial<Record<MetricId, StatTile>> = {
    mll_locked: { label: 'MLL Locked', value: `${railStats.mllLockedCount}/${railStats.totalActiveCount}`, color: '#00ff88' },
    payouts_to_date: {
      label: 'Payouts to Date',
      value: `${railStats.payoutsCount} · $${railStats.payoutsSum.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      color: '#7aa3d4',
    },
    consistency_all: {
      label: 'Consistency (All)',
      value: railStats.consistencyBlockedCount > 0
        ? `${railStats.consistencyBlockedCount} BLOCKED`
        : railStats.consistencyCloseCount > 0
          ? `OK · ${railStats.consistencyCloseCount} CLOSE`
          : 'OK',
      color: railStats.consistencyBlockedCount > 0 ? '#ff4444' : railStats.consistencyCloseCount > 0 ? '#ffaa00' : '#00ff88',
    },
    avg_days_to_lock: { label: 'Avg Days to Lock', value: avgDaysToLock != null ? `${avgDaysToLock} Days` : '—' },
    largest_drawdown: { label: 'Largest Drawdown', value: largestDrawdown < 0 ? fmtSigned(largestDrawdown) : '—', color: '#ff4444' },
    current_streak: {
      label: 'Current Streak',
      value: currentStreak ? `${currentStreak.days}d ${currentStreak.direction === 'win' ? 'Win' : 'Loss'}` : '—',
      color: currentStreak ? (currentStreak.direction === 'win' ? '#00ff88' : '#ff4444') : undefined,
    },
    avg_daily_pnl: {
      label: 'Avg Daily P&L',
      value: entries.length > 0 ? fmtSigned(avgDailyPnl) : '—',
      color: avgDailyPnl >= 0 ? '#00ff88' : '#ff4444',
    },
  }

  const detailContent: Partial<Record<MetricId, React.ReactNode>> = {
    pnl_waveform: <PnlWaveformPanel data={dailyPnl} />,
    consistency_watch: <ConsistencyWatchPanel data={consistencyWatch} />,
    mll_progress: <MllProgressPanel accounts={ok} />,
    payout_log: <PayoutLog entries={payoutLog} />,
    win_rate_trend: <WinRateTrendPanel data={winRateTrend} />,
    best_worst_weekly: <BestWorstDayPanel data={bestWorstWeekly} />,
  }

  const { rail: railOrder, detail: detailOrder } = sanitizeLayout(profile?.performance_layout as { rail?: unknown; detail?: unknown } | null)

  const legend = (
    <div className="flex items-center gap-4 text-[10px] tracking-widest uppercase text-muted">
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#00ff88' }} />
        {railStats.mllLockedCount} Locked
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#7aa3d4' }} />
        {lockingCount} Building
      </span>
      {archiveSummary.total > 0 && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#3a6a90' }} />
          {archiveSummary.total} Archived
        </span>
      )}
    </div>
  )

  return (
    <PerformanceCustomizer
      userId={user!.id}
      initialRailOrder={railOrder}
      initialDetailOrder={detailOrder}
      railContent={railContent}
      detailContent={detailContent}
      legendSlot={legend}
      heroSlot={<OrbitalHero groups={orbGroups} portfolioSummary={portfolioSummary} archiveSummary={archiveSummary} firms={firms} />}
    />
  )
}
