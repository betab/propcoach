'use client'
// app/(app)/account/[id]/import/page.tsx
// PR 1 of the CSV/statement import feature: upload + parse + preview only —
// no write path yet (see the plan doc's PR breakdown). The preview table is
// the safety net for the "imports overwrite existing entries" decision:
// since there's no undo once PR 2 ships the write, every date this would
// touch has to be visible, with its existing value if any, before a trader
// ever commits to it.
import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Account, Entry } from '@/lib/firms/types'
import PageHeader from '@/components/PageHeader'
import { parseCsv } from '@/lib/import/csv'
import {
  detectColumns, guessMode, parseStatementRows, parseTradeLevelRows, buildImportPreview,
  type ImportMode, type PreviewRow,
} from '@/lib/import/parseImportFile'

function fmt(n: number)  { return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString() }
function fmtS(n: number) { return (n > 0 ? '+$' : n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString() }

export default function ImportPage() {
  const params    = useParams()
  const supabase  = createClient()
  const accountId = params.id as string

  const [account,  setAccount]  = useState<Account | null>(null)
  const [entries,  setEntries]  = useState<Entry[]>([])

  const [fileName, setFileName] = useState('')
  const [headers,  setHeaders]  = useState<string[]>([])
  const [dataRows, setDataRows] = useState<string[][]>([])
  const [fileError, setFileError] = useState('')

  const [mode,             setMode]             = useState<ImportMode>('trade_level')
  const [dateColumn,       setDateColumn]        = useState('')
  const [balanceColumn,    setBalanceColumn]     = useState('')
  const [pnlColumn,        setPnlColumn]         = useState('')
  const [commissionColumn, setCommissionColumn]  = useState('')

  useEffect(() => {
    async function load() {
      // Same session-hydration-race guard as log/page.tsx — see that
      // file's comment for the full explanation.
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: acc } = await supabase
        .from('accounts').select('*').eq('id', accountId).eq('user_id', user.id).single()
      const { data: ent } = await supabase
        .from('entries').select('*').eq('account_id', accountId).order('date', { ascending: true })
      setAccount(acc as Account)
      setEntries((ent || []) as Entry[])
    }
    load()
  }, [accountId])

  async function handleFile(file: File) {
    setFileError('')
    setFileName(file.name)
    const text = await file.text()
    const rows = parseCsv(text)
    if (rows.length < 2) {
      setFileError('No data rows found in that file.')
      setHeaders([]); setDataRows([])
      return
    }
    const [headerRow, ...body] = rows
    setHeaders(headerRow)
    setDataRows(body)

    const detected = detectColumns(headerRow)
    setDateColumn(detected.date ?? '')
    setBalanceColumn(detected.balance ?? '')
    setPnlColumn(detected.pnl ?? '')
    setCommissionColumn(detected.commission ?? '')
    setMode(guessMode(body, headerRow.indexOf(detected.date ?? '')))
  }

  const { preview, unparsedCount, ready } = useMemo(() => {
    if (!account || headers.length === 0 || !dateColumn) {
      return { preview: [] as PreviewRow[], unparsedCount: 0, ready: false }
    }
    if (mode === 'statement' && !balanceColumn) return { preview: [], unparsedCount: 0, ready: false }
    if (mode === 'trade_level' && !pnlColumn)   return { preview: [], unparsedCount: 0, ready: false }

    const agg = mode === 'statement'
      ? parseStatementRows(dataRows, headers, { dateColumn, balanceColumn })
      : parseTradeLevelRows(dataRows, headers, { dateColumn, pnlColumn, commissionColumn: commissionColumn || undefined })

    const rows = buildImportPreview(
      account.size,
      entries.map(e => ({ date: e.date, closing_balance: e.closing_balance })),
      agg.days
    )
    return { preview: rows, unparsedCount: agg.unparsedCount, ready: true }
  }, [account, entries, headers, dataRows, mode, dateColumn, balanceColumn, pnlColumn, commissionColumn])

  const overwriteCount = preview.filter(r => r.willOverwrite).length
  const newCount = preview.length - overwriteCount

  if (!account) {
    return <div className="text-muted text-sm">Loading…</div>
  }

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        breadcrumb={
          <>
            <Link href="/dashboard" className="hover:text-green transition-colors">MY ACCOUNTS</Link>
            <span className="mx-2">›</span>
            <Link href={`/account/${accountId}`} className="hover:text-green transition-colors">
              {account.nickname || `${(account.size / 1000).toFixed(0)}K Account`}
            </Link>
            <span className="mx-2">›</span>
            <span>Import</span>
          </>
        }
        section="IMPORT"
        subtitle="Upload a broker/platform export to bulk-fill your daily log."
      />

      <div className="card space-y-4">
        <div>
          <label className="label">CSV File</label>
          <input
            type="file"
            accept=".csv,text/csv"
            className="input"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
          {fileName && <p className="text-xs text-muted mt-1.5">{fileName} · {dataRows.length} row{dataRows.length === 1 ? '' : 's'}</p>}
          {fileError && (
            <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded p-3 mt-2">{fileError}</div>
          )}
        </div>

        {headers.length > 0 && (
          <>
            <div>
              <label className="label">Export Type</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setMode('statement')}
                  className={mode === 'statement' ? 'btn border-green text-green' : 'btn'}
                >
                  Statement / Balance (one row per day)
                </button>
                <button
                  type="button"
                  onClick={() => setMode('trade_level')}
                  className={mode === 'trade_level' ? 'btn border-green text-green' : 'btn'}
                >
                  Trade / Order History (multiple rows per day)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Date Column</label>
                <select className="input" value={dateColumn} onChange={e => setDateColumn(e.target.value)}>
                  <option value="">— select —</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              {mode === 'statement' ? (
                <div>
                  <label className="label">Balance Column</label>
                  <select className="input" value={balanceColumn} onChange={e => setBalanceColumn(e.target.value)}>
                    <option value="">— select —</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="label">P&amp;L Column</label>
                  <select className="input" value={pnlColumn} onChange={e => setPnlColumn(e.target.value)}>
                    <option value="">— select —</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              )}
            </div>

            {mode === 'trade_level' && (
              <div>
                <label className="label">Commission Column (optional)</label>
                <select className="input" value={commissionColumn} onChange={e => setCommissionColumn(e.target.value)}>
                  <option value="">— none —</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            )}
          </>
        )}
      </div>

      {ready && (
        <div className="card mt-6">
          <div className="stat-label mb-3">Preview</div>
          <p className="text-xs text-muted mb-3">
            {preview.length} day{preview.length === 1 ? '' : 's'} parsed
            {overwriteCount > 0 && <> · <span className="text-amber">{overwriteCount} overwrite{overwriteCount === 1 ? '' : 's'} an existing entry</span></>}
            {newCount > 0 && <> · {newCount} new</>}
            {unparsedCount > 0 && <> · <span className="text-danger">{unparsedCount} row{unparsedCount === 1 ? '' : 's'} skipped (unparsable)</span></>}
          </p>

          {preview.length === 0 ? (
            <p className="text-xs text-muted">No rows matched the selected columns — check the mapping above.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-dim text-left border-b border-border">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Existing Balance</th>
                    <th className="py-2 pr-3">New Balance</th>
                    <th className="py-2 pr-3">P&amp;L</th>
                    <th className="py-2 pr-3">Rows</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map(row => (
                    <tr key={row.date} className="border-b border-border/50">
                      <td className="py-2 pr-3 text-white">{row.date}</td>
                      <td className="py-2 pr-3 text-muted">{row.existingClosingBalance !== null ? fmt(row.existingClosingBalance) : '—'}</td>
                      <td className="py-2 pr-3 text-white">{fmt(row.newClosingBalance)}</td>
                      <td className="py-2 pr-3" style={{ color: row.newPnl >= 0 ? '#00ff88' : '#ff4444' }}>{fmtS(row.newPnl)}</td>
                      <td className="py-2 pr-3 text-muted">{row.sourceRowCount}</td>
                      <td className="py-2">
                        {row.willOverwrite
                          ? <span className="text-amber">overwrites existing</span>
                          : <span className="text-green">new</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="text-xs text-dim bg-bg2 border border-border rounded p-3 mt-4">
            Nothing has been saved yet — the write path (import &amp; overwrite) ships in a follow-up PR.
          </div>
        </div>
      )}

      <div className="mt-4">
        <Link href={`/account/${accountId}`} className="btn-ghost" style={{ display: 'inline-block', width: 'auto', padding: '10px 20px' }}>
          ← Back to Account
        </Link>
      </div>
    </div>
  )
}
