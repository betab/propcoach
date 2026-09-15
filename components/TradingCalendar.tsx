'use client'
// components/TradingCalendar.tsx
// Month-view P&L calendar for the bottom of an account page — green/red
// days with amounts, Prev/Next/Today navigation. Pure display over already-
// fetched entries; no new data fetching or DB fields.
import { useMemo, useState } from 'react'
import { buildMonthGrid, dateKey } from '@/lib/calendarGrid'
import type { Entry } from '@/lib/firms/types'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function fmtShort(n: number) {
  const sign = n < 0 ? '-' : n > 0 ? '+' : ''
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString()}`
}

export default function TradingCalendar({ entries }: { entries: Entry[] }) {
  const pnlByDate = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of entries) map.set(e.date, e.pnl)
    return map
  }, [entries])

  // Open on the most recent entry's month so there's something to look at
  // immediately, falling back to the current month for a brand-new account.
  const initial = useMemo(() => {
    const last = entries[entries.length - 1]
    const d = last ? new Date(`${last.date}T00:00:00Z`) : new Date()
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [year, setYear] = useState(initial.year)
  const [month, setMonth] = useState(initial.month)

  const weeks = useMemo(() => buildMonthGrid(year, month), [year, month])

  function goPrev() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(mo => mo - 1)
  }
  function goNext() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(mo => mo + 1)
  }
  function goToday() {
    const now = new Date()
    setYear(now.getUTCFullYear())
    setMonth(now.getUTCMonth())
  }

  const monthTotal = weeks.flat()
    .filter(c => c.inMonth)
    .reduce((sum, c) => sum + (pnlByDate.get(dateKey(c.date)) ?? 0), 0)

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="stat-label">📅 Trading Calendar</div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={goPrev} aria-label="Previous month" className="btn-ghost text-xs px-2.5 py-1 rounded transition-colors">‹</button>
          <span className="text-xs text-white tracking-widest uppercase min-w-[100px] text-center">
            {MONTH_NAMES[month]} {year}
          </span>
          <button type="button" onClick={goNext} aria-label="Next month" className="btn-ghost text-xs px-2.5 py-1 rounded transition-colors">›</button>
          <button type="button" onClick={goToday} className="text-[10px] tracking-widest uppercase text-blue hover:underline ml-1">
            Today
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_LABELS.map(w => (
          <div key={w} className="text-[9px] text-dim tracking-widest uppercase text-center py-1">{w}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weeks.flat().map((cell, i) => {
          const key = dateKey(cell.date)
          const pnl = pnlByDate.get(key)
          const hasEntry = pnl !== undefined
          const isWin = hasEntry && pnl! > 0
          const isLoss = hasEntry && pnl! < 0

          return (
            <div
              key={i}
              className={`rounded p-1 text-center border ${
                !cell.inMonth ? 'border-transparent opacity-25'
                : isWin ? 'border-green/40 bg-green/10'
                : isLoss ? 'border-danger/40 bg-danger/10'
                : hasEntry ? 'border-border bg-bg2'
                : 'border-border/50'
              }`}
              style={{ minHeight: 48 }}
            >
              <div className={`text-[10px] ${cell.inMonth ? 'text-muted' : 'text-dim'}`}>{cell.date.getUTCDate()}</div>
              {cell.inMonth && hasEntry && (
                <div className={`text-[9px] sm:text-[10px] font-semibold mt-1 leading-tight ${isWin ? 'text-green' : isLoss ? 'text-danger' : 'text-muted'}`}>
                  {fmtShort(pnl!)}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="text-xs text-muted mt-3">
        Month total:{' '}
        <span className={monthTotal > 0 ? 'text-green' : monthTotal < 0 ? 'text-danger' : 'text-muted'}>
          {fmtShort(monthTotal)}
        </span>
      </div>
    </div>
  )
}
