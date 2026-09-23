// components/SignalPanels/WinRateTrendPanel.tsx
// Rolling win-rate line — is the trader trending up or down lately?
'use client'

import { ResponsiveContainer, ComposedChart, Line, ReferenceLine, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import type { WinRateTrendPoint } from '@/lib/performance'

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

type ChartRow = { ts: number; winRatePct: number }

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartRow }[] }) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0].payload
  return (
    <div className="bg-bg3 border border-border rounded-lg p-3 shadow-lg">
      <div className="text-xs text-white font-bold mb-2">{fmtDate(row.ts)}</div>
      <div className="flex items-center gap-2 text-xs">
        <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#00ff88' }} />
        <span className="text-muted">Rolling win rate:</span>
        <span className="text-white font-bold">{row.winRatePct}%</span>
      </div>
    </div>
  )
}

export default function WinRateTrendPanel({ data }: { data: WinRateTrendPoint[] }) {
  const rows: ChartRow[] = data.map(d => ({
    ts: new Date(d.date + 'T00:00:00Z').getTime(),
    winRatePct: d.winRatePct,
  }))

  if (rows.length < 2) {
    return (
      <div className="card h-[320px] flex flex-col">
        <div className="stat-label mb-3">Win Rate Trend</div>
        <div className="flex-1 flex items-center justify-center text-xs text-muted text-center">Not enough logged days yet to chart a trend.</div>
      </div>
    )
  }

  const last = rows[rows.length - 1].winRatePct
  const lineColor = last >= 50 ? '#00ff88' : '#ffaa00'

  return (
    <div className="card h-[320px] flex flex-col">
      <div className="flex items-baseline justify-between mb-3">
        <div className="stat-label">Win Rate Trend</div>
        <div className="font-display text-lg" style={{ color: lineColor }}>{last}%</div>
      </div>
      <div className="flex-1 min-h-0">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#1a2332" strokeWidth={1} vertical={false} />
          <ReferenceLine y={50} stroke="#1a2a40" strokeDasharray="2 4" />
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
            domain={[0, 100]}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#5a7a90', strokeWidth: 1, strokeDasharray: '3 3' }} />
          <Line
            type="monotone"
            dataKey="winRatePct"
            stroke={lineColor}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5, fill: lineColor, stroke: '#0d1420', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      </div>
    </div>
  )
}
