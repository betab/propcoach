// components/SignalPanels/PayoutLog.tsx
import type { PayoutLogEntry } from '@/lib/performance'

function fmt(n: number) {
  return '$' + Math.round(n).toLocaleString()
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function PayoutLog({ entries }: { entries: PayoutLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="card h-[320px] flex flex-col">
        <div className="stat-label mb-3">Payout Log</div>
        <div className="flex-1 flex items-center justify-center text-xs text-muted text-center">No payouts recorded yet.</div>
      </div>
    )
  }

  return (
    <div className="card h-[320px] flex flex-col">
      <div className="stat-label mb-3">Payout Log</div>
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col divide-y divide-border">
        {entries.map((p, i) => (
          <div key={i} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
            <div>
              <div className="text-xs text-white">{p.label}</div>
              <div className="text-[10px] text-dim mt-0.5">{p.firmName} · {fmtDate(p.recordedAt)}</div>
            </div>
            {p.amount != null ? (
              <div className="text-sm font-display text-green">{fmt(p.amount)}</div>
            ) : (
              <div className="text-[10px] text-dim tracking-widest uppercase">Not Recorded</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
