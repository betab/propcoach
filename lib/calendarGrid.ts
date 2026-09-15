// lib/calendarGrid.ts
// Pure month-grid math for the Trading Calendar — no React, no Supabase, so
// it's unit-testable standalone. All dates are UTC-anchored (noon-free,
// midnight UTC) to match how `entries.date` round-trips as a plain
// 'YYYY-MM-DD' string elsewhere in this app (new-account start_date, etc.)
// — using local-time Date math here would let the grid's day-of-week
// alignment silently drift by a day for users west of UTC.

export interface CalendarDay {
  date: Date
  inMonth: boolean
}

/** 'YYYY-MM-DD', matching how entries.date is already stored/compared. */
export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * A 7-column grid of complete weeks (6 rows for most months, fewer only
 * when a month happens to fit exactly) covering `month` (0-indexed), padded
 * with the trailing days of the prior month and leading days of the next
 * so every row has 7 cells — the standard calendar-UI shape.
 */
export function buildMonthGrid(year: number, month: number): CalendarDay[][] {
  const firstOfMonth = new Date(Date.UTC(year, month, 1))
  const startWeekday = firstOfMonth.getUTCDay() // 0 = Sunday
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

  const cells: CalendarDay[] = []

  for (let i = 0; i < startWeekday; i++) {
    cells.push({ date: new Date(Date.UTC(year, month, 1 - (startWeekday - i))), inMonth: false })
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ date: new Date(Date.UTC(year, month, day)), inMonth: true })
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date
    cells.push({ date: new Date(last.getTime() + 86_400_000), inMonth: false })
  }

  const weeks: CalendarDay[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}
