// components/BalanceChart.tsx
'use client'

import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import type { BalanceHistoryPoint } from '@/lib/firms/shared/derive'

function fmt(n: number) {
  return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString()
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

// One row per logged entry only — no row (and so no plotted point) for a day
// nothing was logged, weekends included. 'ts' still carries the real date
// (for the tooltip header) but the axis is categorical, not time-scaled, so
// entries sit evenly spaced with no gap reserved for the days between them.
type ChartRow = { ts: number; balance: number; minimum: number; lossLimitFloor: number | null }

// Short stroke-style swatches instead of dots — mirrors each series' actual
// line style (the dataviz skill's own guidance: a legend key should mirror
// the mark), and reads as this chart's own design rather than a copy of the
// reference screenshot it was designed against.
function LegendSwatch({ color, dash }: { color: string; dash?: string }) {
  return (
    <svg width="16" height="8" className="shrink-0" aria-hidden="true">
      <line x1="0" y1="4" x2="16" y2="4" stroke={color} strokeWidth={2} strokeDasharray={dash} strokeLinecap="round" />
    </svg>
  )
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartRow }[] }) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0].payload
  return (
    <div className="bg-bg3 border border-border rounded-lg p-3 shadow-lg">
      <div className="text-xs text-white font-bold mb-2">{fmtDate(row.ts)}</div>
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#00ff88' }} />
          <span className="text-muted">Account Balance:</span>
          <span className="text-white font-bold">{fmt(row.balance)}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#ff4444' }} />
          <span className="text-muted">Minimum Balance:</span>
          <span className="text-white font-bold">{fmt(row.minimum)}</span>
        </div>
        {row.lossLimitFloor != null && (
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#7aa3d4' }} />
            <span className="text-muted">Daily Loss Limit:</span>
            <span className="text-white font-bold">{fmt(row.lossLimitFloor)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function BalanceChart({ data }: { data: BalanceHistoryPoint[] }) {
  const rows: ChartRow[] = data.map(d => ({
    ts: new Date(d.date + 'T00:00:00Z').getTime(),
    balance: d.balance,
    minimum: d.minimum,
    lossLimitFloor: d.lossLimitFloor,
  }))
  const hasLossLimit = rows.some(r => r.lossLimitFloor != null)

  if (rows.length < 2) return null

  // $100-stepped Y-axis ticks, padded one step past the data's own range.
  const allValues = rows.flatMap(r => [r.balance, r.minimum, ...(r.lossLimitFloor != null ? [r.lossLimitFloor] : [])])
  const domainMin = Math.floor(Math.min(...allValues) / 100) * 100 - 100
  const domainMax = Math.ceil(Math.max(...allValues) / 100) * 100 + 100
  const yTicks: number[] = []
  for (let v = domainMin; v <= domainMax; v += 100) yTicks.push(v)

  return (
    <div className="card mb-3">
      {/* Legend — hand-rolled to match the app's own label style rather than
          recharts' default legend chrome */}
      <div className="flex items-center gap-4 mb-3">
        {[
          { color: '#00ff88', label: 'Balance' },
          { color: '#ff4444', label: 'Minimum' },
          ...(hasLossLimit ? [{ color: '#7aa3d4', label: 'Loss Limit', dash: '1 3' }] : []),
        ].map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <LegendSwatch color={s.color} dash={'dash' in s ? s.dash : undefined} />
            <span className="text-xs text-muted">{s.label}</span>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00ff88" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#00ff88" stopOpacity={0} />
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
            domain={[domainMin, domainMax]}
            ticks={yTicks}
            interval={0}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ stroke: '#5a7a90', strokeWidth: 1, strokeDasharray: '3 3' }}
          />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="#00ff88"
            strokeWidth={2}
            fill="url(#balanceFill)"
            activeDot={{ r: 5, fill: '#00ff88', stroke: '#0d1420', strokeWidth: 2 }}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="minimum"
            stroke="#ff4444"
            strokeWidth={2}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          {hasLossLimit && (
            <Line
              type="monotone"
              dataKey="lossLimitFloor"
              stroke="#7aa3d4"
              strokeWidth={2}
              strokeDasharray="1 3"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
