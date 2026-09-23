// components/SignalPanels/PnlWaveformPanel.tsx
'use client'

import { ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import type { DailyPortfolioPoint } from '@/lib/performance'

function fmt(n: number) {
  return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString()
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

type ChartRow = { ts: number; cumulativePnl: number }

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartRow }[] }) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0].payload
  return (
    <div className="bg-bg3 border border-border rounded-lg p-3 shadow-lg">
      <div className="text-xs text-white font-bold mb-2">{fmtDate(row.ts)}</div>
      <div className="flex items-center gap-2 text-xs">
        <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#00ff88' }} />
        <span className="text-muted">Cumulative P&L:</span>
        <span className="text-white font-bold">{fmt(row.cumulativePnl)}</span>
      </div>
    </div>
  )
}

export default function PnlWaveformPanel({ data }: { data: DailyPortfolioPoint[] }) {
  const rows: ChartRow[] = data.map(d => ({
    ts: new Date(d.date + 'T00:00:00Z').getTime(),
    cumulativePnl: d.cumulativePnl,
  }))

  if (rows.length < 2) {
    return (
      <div className="card h-[320px] flex flex-col">
        <div className="stat-label mb-3">P&L Waveform</div>
        <div className="flex-1 flex items-center justify-center text-xs text-muted text-center">Not enough logged days yet to chart a trend.</div>
      </div>
    )
  }

  const last = rows[rows.length - 1].cumulativePnl
  const lineColor = last >= 0 ? '#00ff88' : '#ff4444'

  return (
    <div className="card h-[320px] flex flex-col">
      <div className="stat-label mb-3">P&L Waveform</div>
      <div className="flex-1 min-h-0">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="pnlWaveformFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={0.18} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1a2332" strokeWidth={1} vertical={false} />
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
            tickFormatter={fmt}
            tick={{ fill: '#5a7a90', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={70}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#5a7a90', strokeWidth: 1, strokeDasharray: '3 3' }} />
          <Area
            type="monotone"
            dataKey="cumulativePnl"
            stroke={lineColor}
            strokeWidth={2}
            fill="url(#pnlWaveformFill)"
            activeDot={{ r: 5, fill: lineColor, stroke: '#0d1420', strokeWidth: 2 }}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      </div>
    </div>
  )
}
