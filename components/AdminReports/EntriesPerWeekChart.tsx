// components/AdminReports/EntriesPerWeekChart.tsx
'use client'

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import type { WeekCount } from '@/lib/admin-reports'

function fmtWeek(iso: string) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: WeekCount }[] }) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0].payload
  return (
    <div className="bg-bg3 border border-border rounded-lg p-3 shadow-lg">
      <div className="text-xs text-white font-bold mb-1">Week of {fmtWeek(row.weekStart)}</div>
      <div className="flex items-center gap-2 text-xs">
        <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#7aa3d4' }} />
        <span className="text-muted">Entries logged:</span>
        <span className="text-white font-bold">{row.count}</span>
      </div>
    </div>
  )
}

export default function EntriesPerWeekChart({ data }: { data: WeekCount[] }) {
  return (
    <div className="card h-[280px] flex flex-col">
      <div className="stat-label mb-3">Entries Logged — Last {data.length} Weeks</div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#1a2332" strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="weekStart"
              tickFormatter={fmtWeek}
              tick={{ fill: '#5a7a90', fontSize: 10 }}
              axisLine={{ stroke: '#1a2332' }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: '#5a7a90', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(122,163,212,0.08)' }} />
            <Bar dataKey="count" fill="#7aa3d4" radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
