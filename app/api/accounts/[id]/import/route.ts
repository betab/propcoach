// app/api/accounts/[id]/import/route.ts
// The write path for the CSV/statement import feature (PR 2 of 2 — see
// app/(app)/account/[id]/import/page.tsx for the parse-and-preview UI that
// PR 1 shipped, and the plan doc for full context).
//
// Deliberately does NOT trust the client's preview numbers: the client
// sends only the raw per-day aggregation (a closing balance or a P&L
// delta per date, see lib/import/parseImportFile.ts's ImportedDay), and
// this route re-fetches the account and its current entries fresh, then
// recomputes buildImportPreview itself. That closes a real race — the
// trader could log a manual entry in another tab while reviewing the
// import preview — and means the server, not the browser, is the source
// of truth for the financial numbers actually written.
//
// A single Supabase upsert() call issues one INSERT ... ON CONFLICT
// statement for the whole batch, which is one Postgres transaction —
// giving the all-or-nothing behavior the plan called for without needing
// a separate RPC/transaction wrapper. closing_balance/pnl are always
// included in the payload (so a collision overwrites them); contracts and
// notes are deliberately left OUT of the payload — the import file has no
// data for either, so omitting them means an overwritten row keeps
// whatever contracts/notes the trader had already entered, while a new
// row falls back to the entries table's own defaults (0 / '').
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildImportPreview, type ImportedDayEntry, daysArrayToMap } from '@/lib/import/parseImportFile'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function validateDays(input: unknown): ImportedDayEntry[] | null {
  if (!Array.isArray(input) || input.length === 0) return null
  const out: ImportedDayEntry[] = []
  for (const row of input) {
    if (typeof row !== 'object' || row === null) return null
    const { date, closingBalance, pnlDelta, sourceRowCount } = row as Record<string, unknown>
    if (typeof date !== 'string' || !DATE_RE.test(date)) return null
    const hasBalance = typeof closingBalance === 'number' && Number.isFinite(closingBalance)
    const hasDelta   = typeof pnlDelta === 'number' && Number.isFinite(pnlDelta)
    if (hasBalance === hasDelta) return null  // exactly one of the two must be set
    if (typeof sourceRowCount !== 'number' || !Number.isFinite(sourceRowCount) || sourceRowCount < 1) return null
    out.push(
      hasBalance
        ? { date, sourceRowCount, closingBalance: closingBalance as number }
        : { date, sourceRowCount, pnlDelta: pnlDelta as number }
    )
  }
  return out
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: account } = await supabase
    .from('accounts').select('id, size').eq('id', id).eq('user_id', user.id).single()
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const days = validateDays((body as { days?: unknown })?.days)
  if (!days) {
    return NextResponse.json({ error: 'Invalid or empty "days" array' }, { status: 400 })
  }

  const { data: existingEntries, error: fetchError } = await supabase
    .from('entries').select('date, closing_balance').eq('account_id', id)
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const preview = buildImportPreview(account.size, existingEntries ?? [], daysArrayToMap(days))

  const rows = preview.map(row => ({
    account_id:      id,
    user_id:         user.id,
    date:            row.date,
    closing_balance: row.newClosingBalance,
    pnl:             row.newPnl,
  }))

  const { error: upsertError } = await supabase
    .from('entries')
    .upsert(rows, { onConflict: 'account_id,date' })
  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  const overwritten = preview.filter(r => r.willOverwrite).length
  return NextResponse.json({
    imported:    rows.length,
    overwritten,
    created:     rows.length - overwritten,
  })
}
