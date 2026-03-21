// app/(app)/account/[id]/history/page.tsx
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Entry } from '@/lib/firms/types'

function fmtS(n: number) { return (n > 0 ? '+$' : n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString() }
function fmt(n: number)  { return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString() }

export default async function HistoryPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: account } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (!account) notFound()

  const { data: rawEntries } = await supabase
    .from('entries')
    .select('*')
    .eq('account_id', account.id)
    .order('date', { ascending: false })

  const entries = (rawEntries || []) as Entry[]

  // Compute running balance per entry (oldest to newest, then reverse for display)
  const balances: number[] = []
  let running = account.size
  const ordered = [...entries].reverse()
  for (const e of ordered) { running += e.pnl; balances.push(running) }
  balances.reverse()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-xs text-dim tracking-widest mb-1">
            <Link href="/dashboard" className="hover:text-green transition-colors">MY ACCOUNTS</Link>
            <span className="mx-2">›</span>
            <Link href={`/account/${params.id}`} className="hover:text-green transition-colors">
              {account.nickname || `${(account.size/1000).toFixed(0)}K Account`}
            </Link>
            <span className="mx-2">›</span>
            <span>History</span>
          </div>
          <h1 className="font-display text-3xl tracking-[3px] text-white">SESSION HISTORY</h1>
          <p className="text-xs text-muted mt-1">{entries.length} sessions logged</p>
        </div>
        <Link
          href={`/account/${params.id}/log`}
          className="btn border-green text-green hover:bg-green/10"
        >
          ✏️ Log Session
        </Link>
      </div>

      {entries.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-dim text-sm">No sessions logged yet.</div>
          <Link href={`/account/${params.id}/log`} className="text-green text-xs hover:underline mt-2 block">
            Log your first session →
          </Link>
        </div>
      ) : (
        <div className="card">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[100px_90px_90px_60px_1fr_40px] gap-3 pb-2 mb-2 border-b border-border">
            {['Date', 'P&L', 'Balance', 'Lots', 'Notes', ''].map(h => (
              <div key={h} className="text-[10px] text-dim tracking-widest uppercase">{h}</div>
            ))}
          </div>

          {entries.map((entry, i) => (
            <div
              key={entry.id}
              className="grid grid-cols-[1fr_auto] sm:grid-cols-[100px_90px_90px_60px_1fr_40px] gap-3 items-center py-2.5 border-b border-border/50 last:border-0"
            >
              <div className="text-xs text-blue">{entry.date}</div>
              <div
                className="font-display text-base tracking-wide"
                style={{ color: entry.pnl >= 0 ? '#00ff88' : '#ff4444' }}
              >
                {fmtS(entry.pnl)}
              </div>
              <div className="hidden sm:block text-xs text-muted">{fmt(balances[i])}</div>
              <div className="hidden sm:block text-xs text-muted">{entry.contracts || '—'}</div>
              <div className="hidden sm:block text-xs text-muted/70 truncate">{entry.notes || '—'}</div>

              {/* Delete form */}
              <form action={`/api/entries/${entry.id}/delete`} method="POST" className="hidden sm:block">
                <button
                  type="submit"
                  className="text-muted hover:text-danger transition-colors text-lg leading-none"
                  onClick={e => {
                    if (!confirm('Delete this entry?')) e.preventDefault()
                  }}
                >
                  ×
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
