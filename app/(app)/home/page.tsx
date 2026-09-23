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
} from '@/lib/performance'
import PageHeader from '@/components/PageHeader'
import LeftRail, { type StatTile } from '@/components/LeftRail'
import OrbitalHero from '@/components/OrbitalHero'
import PnlWaveformPanel from '@/components/SignalPanels/PnlWaveformPanel'
import ConsistencyWatchPanel from '@/components/SignalPanels/ConsistencyWatchPanel'
import MllProgressPanel from '@/components/SignalPanels/MllProgressPanel'
import PayoutLog from '@/components/SignalPanels/PayoutLog'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: accountsRaw }, { data: entriesRaw }, { data: payoutsRaw }, firms] = await Promise.all([
    supabase.from('accounts').select('*').eq('user_id', user!.id).order('created_at'),
    supabase.from('entries').select('*').eq('user_id', user!.id).order('date', { ascending: true }),
    supabase.from('payouts').select('*').eq('user_id', user!.id).order('recorded_at', { ascending: false }),
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

  const lockingCount = railStats.totalActiveCount - railStats.mllLockedCount

  const tiles: StatTile[] = [
    { label: 'MLL Locked', value: `${railStats.mllLockedCount}/${railStats.totalActiveCount}`, color: '#00ff88' },
    {
      label: 'Payouts to Date',
      value: `${railStats.payoutsCount} · $${railStats.payoutsSum.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      color: '#7aa3d4',
    },
    {
      label: 'Consistency (All)',
      value: railStats.consistencyBlockedCount > 0
        ? `${railStats.consistencyBlockedCount} BLOCKED`
        : railStats.consistencyCloseCount > 0
          ? `OK · ${railStats.consistencyCloseCount} CLOSE`
          : 'OK',
      color: railStats.consistencyBlockedCount > 0 ? '#ff4444' : railStats.consistencyCloseCount > 0 ? '#ffaa00' : '#00ff88',
    },
  ]

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
    <div>
      <PageHeader section="PERFORMANCE" actions={legend} showAddMetric />

      <div className="flex gap-5 flex-wrap lg:flex-nowrap">
        <LeftRail tiles={tiles} />
        <div className="flex-1 min-w-0">
          <OrbitalHero groups={orbGroups} portfolioSummary={portfolioSummary} archiveSummary={archiveSummary} firms={firms} />
        </div>
      </div>

      <div className="mt-10">
        <div className="text-xs text-dim tracking-[3px] uppercase mb-4">The Signal — Detail</div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <PnlWaveformPanel data={dailyPnl} />
          <ConsistencyWatchPanel data={consistencyWatch} />
          <MllProgressPanel accounts={ok} />
        </div>
        <div className="mt-4">
          <PayoutLog entries={payoutLog} />
        </div>
      </div>
    </div>
  )
}
