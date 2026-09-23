// components/SignalPanels/MllProgressPanel.tsx
// One progress bar per active account, reusing the same visual pattern as
// the per-account "MLL Lock Progress" card on account/[id]/page.tsx.
import Link from 'next/link'
import type { AccountWithMetrics } from '@/lib/performance'

function fmt(n: number) {
  return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString()
}

export default function MllProgressPanel({ accounts }: { accounts: AccountWithMetrics[] }) {
  if (accounts.length === 0) {
    return (
      <div className="card">
        <div className="stat-label mb-3">MLL Lock Progress</div>
        <div className="text-xs text-muted py-8 text-center">No active accounts.</div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="stat-label mb-3">MLL Lock Progress</div>
      <div className="flex flex-col gap-3">
        {accounts.map(({ account, config, metrics }) => (
          <Link key={account.id} href={`/account/${account.id}`} className="block hover:opacity-90 transition-opacity">
            <div className="flex justify-between mb-1">
              <span className="text-xs text-white">{account.nickname || `${(account.size / 1000).toFixed(0)}K`}</span>
              <span className="text-xs text-muted">
                {metrics.mllLocked ? 'LOCKED' : `${fmt(metrics.currentBalance)} / ${fmt(config.safetyNet)}`}
              </span>
            </div>
            <div className="h-1.5 bg-bg2 rounded overflow-hidden">
              <div
                className="h-full rounded transition-all duration-500"
                style={{
                  width: `${metrics.mllLockProgress}%`,
                  background: metrics.mllLocked ? '#00ff88' : 'linear-gradient(90deg,#1e5a30,#00ff88)',
                }}
              />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
