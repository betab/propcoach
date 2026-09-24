// lib/import/parseImportFile.ts
// Pure parsing/aggregation logic for the account-data import flow (PR 1 of
// the CSV/statement import feature — see the plan doc). No Supabase calls
// here, same "framework-free, takes already-loaded data" shape as
// lib/firms/shared/derive.ts and lib/performance.ts, so PR 2's write path
// (and any future test) can reuse it without re-deriving the math.
//
// Broker/platform export column names weren't confirmed against primary
// source docs (see the research report this feature was scoped from) —
// so detection here is a best-effort GUESS, always meant to be shown to
// the trader as a pre-filled, correctable dropdown rather than trusted
// silently. Get the guess wrong and the trader just picks the right
// column; get a value un-parseable and the row is skipped and counted,
// never silently coerced to 0.

export type ImportMode = 'statement' | 'trade_level'

// ── Column detection (best-effort guess, always user-correctable) ─────────────
const DATE_HEADER_RE       = /\b(date|time|fill time|entry time|trade date|timestamp)\b/i
const BALANCE_HEADER_RE    = /\b(balance|equity|ending balance|net liq)\b/i
const PNL_HEADER_RE        = /\b(profit|p&?l|net profit)\b/i
const CUMULATIVE_PNL_RE    = /\bcum/i  // "Cum. net profit" — a running total, never the per-row P&L column
const COMMISSION_HEADER_RE = /\b(commission|fee|fees)\b/i

export interface DetectedColumns {
  date?:       string
  balance?:    string
  pnl?:        string
  commission?: string
}

export function detectColumns(headers: string[]): DetectedColumns {
  const trimmed = headers.map(h => h.trim())
  const find = (re: RegExp, exclude?: RegExp) =>
    trimmed.find(h => re.test(h) && !(exclude && exclude.test(h)))
  return {
    date:       find(DATE_HEADER_RE),
    balance:    find(BALANCE_HEADER_RE),
    pnl:        find(PNL_HEADER_RE, CUMULATIVE_PNL_RE) ?? find(PNL_HEADER_RE),
    commission: find(COMMISSION_HEADER_RE),
  }
}

// A file where distinct CALENDAR DAYS cover most rows looks like
// one-row-per-day (a statement); a file with many rows sharing a day looks
// like trade/order-level history needing aggregation. Only a starting
// guess — the trader can still flip the mode toggle by hand.
//
// Must compare the parsed date-only value, not the raw column string: a
// trade-level file's date column is often a full timestamp (date + time),
// so every row's raw string is unique even when several trades share a
// calendar day — comparing raw strings would misdetect that as "statement"
// every time.
export function guessMode(rows: string[][], dateColIdx: number): ImportMode {
  if (rows.length === 0 || dateColIdx < 0) return 'trade_level'
  const dates = rows
    .map(r => parseDateLoose(r[dateColIdx] ?? ''))
    .filter((d): d is string => d !== null)
  if (dates.length === 0) return 'trade_level'
  const uniqueDates = new Set(dates).size
  return uniqueDates >= dates.length * 0.9 ? 'statement' : 'trade_level'
}

// ── Loose value parsing ─────────────────────────────────────────────────────
export function parseDateLoose(raw: string): string | null {
  const s = (raw ?? '').trim()
  if (!s) return null
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (us) {
    const [, m, d, y] = us
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}

export function parseNumberLoose(raw: string): number | null {
  const s = (raw ?? '').trim()
  if (!s) return null
  const negParen = /^\(.*\)$/.test(s)
  const cleaned = s.replace(/[()$,]/g, '').trim()
  if (cleaned === '' || cleaned === '-') return null
  const n = parseFloat(cleaned)
  if (isNaN(n)) return null
  return negParen ? -Math.abs(n) : n
}

// ── Per-day aggregation ──────────────────────────────────────────────────────
// A day's value is EITHER an absolute closing balance (statement mode) OR a
// net P&L delta to apply on top of whatever the previous day's balance ends
// up being (trade-level mode) — buildImportPreview below resolves either
// shape against the account's actual chronological history.
export interface ImportedDay {
  sourceRowCount: number
  closingBalance?: number
  pnlDelta?:       number
}

// ── Serialization helpers ────────────────────────────────────────────────────
// The write path (PR 2) sends the raw per-day aggregation — not the
// resolved preview — to the server, which re-fetches the account/entries
// fresh and recomputes buildImportPreview itself rather than trusting
// whatever the client's (possibly stale) preview screen showed. A Map
// isn't JSON-serializable, so these convert to/from a plain array at the
// client/server boundary; both sides otherwise share this same module.
export type ImportedDayEntry = { date: string } & ImportedDay

export function daysMapToArray(days: Map<string, ImportedDay>): ImportedDayEntry[] {
  return [...days.entries()].map(([date, day]) => ({ date, ...day }))
}

export function daysArrayToMap(entries: ImportedDayEntry[]): Map<string, ImportedDay> {
  return new Map(entries.map(({ date, ...day }) => [date, day]))
}

export interface AggregationResult {
  days:          Map<string, ImportedDay>
  unparsedCount: number
}

export function parseStatementRows(
  rows: string[][],
  headers: string[],
  mapping: { dateColumn: string; balanceColumn: string }
): AggregationResult {
  const dateIdx = headers.indexOf(mapping.dateColumn)
  const balIdx  = headers.indexOf(mapping.balanceColumn)
  const days = new Map<string, ImportedDay>()
  let unparsedCount = 0

  for (const row of rows) {
    const date    = parseDateLoose(row[dateIdx] ?? '')
    const balance = parseNumberLoose(row[balIdx] ?? '')
    if (date === null || balance === null) { unparsedCount++; continue }
    // Last row for a date wins — export files are typically already in
    // chronological order, and a later row for the same date is the more
    // authoritative one (e.g. an end-of-day statement re-run).
    const existing = days.get(date)
    days.set(date, { closingBalance: balance, sourceRowCount: (existing?.sourceRowCount ?? 0) + 1 })
  }
  return { days, unparsedCount }
}

export function parseTradeLevelRows(
  rows: string[][],
  headers: string[],
  mapping: { dateColumn: string; pnlColumn: string; commissionColumn?: string }
): AggregationResult {
  const dateIdx = headers.indexOf(mapping.dateColumn)
  const pnlIdx  = headers.indexOf(mapping.pnlColumn)
  const commIdx = mapping.commissionColumn ? headers.indexOf(mapping.commissionColumn) : -1
  const days = new Map<string, ImportedDay>()
  let unparsedCount = 0

  for (const row of rows) {
    const date = parseDateLoose(row[dateIdx] ?? '')
    const pnl  = parseNumberLoose(row[pnlIdx] ?? '')
    if (date === null || pnl === null) { unparsedCount++; continue }
    const commission = commIdx >= 0 ? (parseNumberLoose(row[commIdx] ?? '') ?? 0) : 0
    const net = pnl - Math.abs(commission)
    const existing = days.get(date)
    days.set(date, {
      pnlDelta:       (existing?.pnlDelta ?? 0) + net,
      sourceRowCount: (existing?.sourceRowCount ?? 0) + 1,
    })
  }
  return { days, unparsedCount }
}

// ── Preview: merge imported days against real account history ─────────────────
// Replicates app/(app)/account/[id]/log/page.tsx's own pnl derivation
// (closing_balance delta from the running balance) across the FULL
// chronological sequence — existing entries the import doesn't touch, plus
// every imported day — so a trade-level day's balance correctly chains off
// whatever precedes it, whether that's a real entry or another imported day.
export interface PreviewRow {
  date:                    string
  existingClosingBalance:  number | null  // null = no existing entry for this date
  newClosingBalance:       number
  newPnl:                  number
  willOverwrite:           boolean
  sourceRowCount:          number
}

export function buildImportPreview(
  accountSize: number,
  existingEntries: { date: string; closing_balance: number }[],
  importedDays: Map<string, ImportedDay>
): PreviewRow[] {
  const existingByDate = new Map(existingEntries.map(e => [e.date, e.closing_balance]))
  const allDates = new Set<string>([...existingByDate.keys(), ...importedDays.keys()])
  const sortedDates = [...allDates].sort()

  const rows: PreviewRow[] = []
  let prevBalance = accountSize

  for (const date of sortedDates) {
    const imported = importedDays.get(date)
    const closingBalance = imported
      ? (imported.closingBalance !== undefined ? imported.closingBalance : prevBalance + (imported.pnlDelta ?? 0))
      : existingByDate.get(date)!

    if (imported) {
      rows.push({
        date,
        existingClosingBalance: existingByDate.has(date) ? existingByDate.get(date)! : null,
        newClosingBalance:      closingBalance,
        newPnl:                 closingBalance - prevBalance,
        willOverwrite:          existingByDate.has(date),
        sourceRowCount:         imported.sourceRowCount,
      })
    }
    prevBalance = closingBalance
  }
  return rows
}
