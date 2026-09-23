// components/SignalPanels/BestWorstDayPanel.tsx
// This week's single best and worst P&L day, portfolio-wide (rolling
// 7-logged-days window, not a calendar-week boundary — see
// lib/performance.ts's deriveBestWorstDayWeekly).
import type { BestWorstWeekly } from '@/lib/performance'

function fmt(n: number) {
  return (n < 0 ? '-$' : '+$') + Math.abs(Math.round(n)).toLocaleString()
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export default function BestWorstDayPanel({ data }: { data: BestWorstWeekly }) {
  if (!data.best || !data.worst) {
    return (
      <div className="card h-[320px] flex flex-col">
        <div className="stat-label mb-3">Best/Worst Day (Weekly)</div>
        <div className="flex-1 flex items-center justify-center text-xs text-muted text-center">No logged days in the last week yet.</div>
      </div>
    )
  }

  return (
    <div className="card h-[320px] flex flex-col">
      <div className="stat-label mb-3">Best/Worst Day (Weekly)</div>
      <div className="flex-1 flex items-center gap-5">
        <div className="flex-1">
          <div className="text-[10px] text-dim tracking-widest uppercase mb-1">Best</div>
          <div className="font-display text-xl text-green">{fmt(data.best.pnl)}</div>
          <div className="text-xs text-muted mt-0.5">{fmtDate(data.best.date)}</div>
        </div>
        <div className="w-px bg-border" />
        <div className="flex-1">
          <div className="text-[10px] text-dim tracking-widest uppercase mb-1">Worst</div>
          <div className="font-display text-xl text-danger">{fmt(data.worst.pnl)}</div>
          <div className="text-xs text-muted mt-0.5">{fmtDate(data.worst.date)}</div>
        </div>
      </div>
    </div>
  )
}
