// components/SignalPanels/ConsistencyWatchPanel.tsx
// Plots the single worst-offender active account per day (highest %-of-its-
// own consistency cap) — the line's identity can change day to day as the
// worst offender changes. See lib/performance.ts's deriveConsistencyWatch.
'use client'

import { ResponsiveContainer, ComposedChart, Line, ReferenceArea, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import type { ConsistencyWatchPoint } from '@/lib/performance'

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

type ChartRow = { ts: number; pctOfCap: number; label: string }

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartRow }[] }) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0].payload
  const color = row.pctOfCap >= 100 ? '#ff4444' : '#ffaa00'
  return (
    <div className="bg-bg3 border border-border rounded-lg p-3 shadow-lg">
      <div className="text-xs text-white font-bold mb-2">{fmtDate(row.ts)}</div>
      <div className="flex items-center gap-2 text-xs">
        <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="text-muted">Worst offender:</span>
        <span className="text-white font-bold">{row.label}</span>
      </div>
      <div className="text-xs text-muted mt-1">{Math.round(row.pctOfCap)}% of its consistency cap</div>
    </div>
  )
}

export default function ConsistencyWatchPanel({ data }: { data: ConsistencyWatchPoint[] }) {
  const rows: ChartRow[] = data.map(d => ({
    ts: new Date(d.date + 'T00:00:00Z').getTime(),
    pctOfCap: d.pctOfCap,
    label: d.label,
  }))

  if (rows.length < 2) {
    return (
      <div className="card">
        <div className="stat-label mb-3">Consistency Watch</div>
        <div className="text-xs text-muted py-8 text-center">No accounts with an active consistency rule yet.</div>
      </div>
    )
  }

  const maxVal = Math.max(100, ...rows.map(r => r.pctOfCap))
  const yMax = Math.ceil((maxVal + 10) / 10) * 10

  return (
    <div className="card">
      <div className="stat-label mb-3">Consistency Watch</div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#1a2332" strokeWidth={1} vertical={false} />
          <ReferenceArea y1={100} y2={yMax} fill="#ff4444" fillOpacity={0.08} />
          <XAxis
            dataKey="ts"
            type="category"
            padding={{ left: 12, right: 12 }}
            tickFormatter={fmtDate}
            tick={{ fill: '#5a7a90', fontSize: 11 }}
            axisLine={{ stroke: '#1a2332' }}
            tickLine={false}
          />
          <YAxis
            orientation="right"
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fill: '#5a7a90', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={50}
            domain={[0, yMax]}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#5a7a90', strokeWidth: 1, strokeDasharray: '3 3' }} />
          <Line
            type="monotone"
            dataKey="pctOfCap"
            stroke="#ffaa00"
            strokeWidth={2}
            dot={{ r: 3, fill: '#ffaa00', stroke: '#0d1420', strokeWidth: 1 }}
            activeDot={{ r: 5, fill: '#ffaa00', stroke: '#0d1420', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
