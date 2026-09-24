// lib/admin-reports.ts
// Pure aggregation functions for the Reporting Dashboard (PR B of that
// milestone — see the plan doc). Framework-free, same shape as
// lib/performance.ts and lib/firms/shared/derive.ts: takes already-fetched
// rows, does no Supabase calls itself. The page.tsx caller is responsible
// for fetching via the service-role client (these are cross-user platform
// stats, which the normal RLS-scoped client can't see past auth.uid()).

export interface DayCount { date: string; count: number }
export interface WeekCount { weekStart: string; count: number }

// One point per calendar day across [today - days + 1, today], UTC —
// zero-filled so a quiet day shows as 0, not a gap in the chart.
export function computeSignupsOverTime(
  profiles: { created_at: string }[],
  days = 30,
  now: Date = new Date()
): DayCount[] {
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const counts = new Map<string, number>()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(todayUTC)
    d.setUTCDate(d.getUTCDate() - i)
    counts.set(d.toISOString().slice(0, 10), 0)
  }
  for (const p of profiles) {
    const day = p.created_at.slice(0, 10)
    if (counts.has(day)) counts.set(day, (counts.get(day) ?? 0) + 1)
  }
  return [...counts.entries()].map(([date, count]) => ({ date, count }))
}

export function computePlanMix(profiles: { plan: string | null }[]): { free: number; pro: number } {
  let free = 0, pro = 0
  for (const p of profiles) {
    if (p.plan === 'pro') pro++
    else free++  // null/free/anything else counts as free — matches the schema's own default
  }
  return { free, pro }
}

export function computeAccountStatusCounts(accounts: { is_active: boolean }[]): { active: number; archived: number } {
  let active = 0, archived = 0
  for (const a of accounts) {
    if (a.is_active) active++
    else archived++
  }
  return { active, archived }
}

// ISO-week-ish bucketing (Monday-start), zero-filled across the last N weeks.
function mondayOf(d: Date): Date {
  const day = d.getUTCDay()  // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setUTCDate(monday.getUTCDate() + diff)
  return new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate()))
}

export function computeEntriesPerWeek(
  entries: { date: string }[],
  weeks = 8,
  now: Date = new Date()
): WeekCount[] {
  const thisMonday = mondayOf(now)
  const counts = new Map<string, number>()
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(thisMonday)
    d.setUTCDate(d.getUTCDate() - i * 7)
    counts.set(d.toISOString().slice(0, 10), 0)
  }
  const earliestBucket = new Date(thisMonday)
  earliestBucket.setUTCDate(earliestBucket.getUTCDate() - (weeks - 1) * 7)

  for (const e of entries) {
    const entryDate = new Date(e.date + 'T00:00:00Z')
    const bucket = mondayOf(entryDate)
    if (bucket < earliestBucket) continue
    const key = bucket.toISOString().slice(0, 10)
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].map(([weekStart, count]) => ({ weekStart, count }))
}

export interface FirmPopularity { firmId: string; firmName: string; count: number }

export function computeFirmPopularity(
  accounts: { firm_id: string }[],
  firms: { id: string; name: string }[]
): FirmPopularity[] {
  const nameById = new Map(firms.map(f => [f.id, f.name]))
  const counts = new Map<string, number>()
  for (const a of accounts) {
    counts.set(a.firm_id, (counts.get(a.firm_id) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([firmId, count]) => ({ firmId, firmName: nameById.get(firmId) ?? firmId, count }))
    .sort((a, b) => b.count - a.count)
}
