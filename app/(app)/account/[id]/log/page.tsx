'use client'
// app/(app)/account/[id]/log/page.tsx
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getFirmRules } from '@/lib/firms'
import type { Entry, Account } from '@/lib/firms/types'

function fmt(n: number)  { return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString() }
function fmtS(n: number) { return (n > 0 ? '+$' : n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString() }

export default function LogSessionPage() {
  const params   = useParams()
  const router   = useRouter()
  const supabase = createClient()
  const accountId = params.id as string

  const [account,  setAccount]  = useState<Account | null>(null)
  const [entries,  setEntries]  = useState<Entry[]>([])
  const [date,     setDate]     = useState(new Date().toISOString().slice(0, 10))
  const [balance,  setBalance]  = useState('')
  const [contracts,setContracts]= useState('')
  const [notes,    setNotes]    = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [hint,     setHint]     = useState<{ text: string; color: string } | null>(null)

  useEffect(() => {
    async function load() {
      const { data: acc } = await supabase
        .from('accounts').select('*').eq('id', accountId).single()
      const { data: ent } = await supabase
        .from('entries').select('*').eq('account_id', accountId).order('date', { ascending: true })
      setAccount(acc as Account)
      setEntries((ent || []) as Entry[])
    }
    load()
  }, [accountId])

  // Compute current balance from entries
  const currentBalance = account
    ? entries.reduce((b, e) => b + e.pnl, account.size)
    : 0

  // Update hint when balance input changes
  useEffect(() => {
    if (!account || !balance) { setHint(null); return }
    const entered = parseFloat(balance)
    if (isNaN(entered)) { setHint(null); return }
    const pnl = entered - currentBalance
    const rules  = getFirmRules(account.firm_id)
    const config = rules.getConfig(account.size, account.drawdown_type, account.version)
    if (pnl >= config.qualifyingDayMin) {
      setHint({ text: `${fmtS(pnl)} P&L · ✅ Qualifying day ($${config.qualifyingDayMin}+)`, color: '#00ff88' })
    } else if (pnl >= 0) {
      setHint({ text: `${fmtS(pnl)} P&L · ⚠️ Below $${config.qualifyingDayMin} qualifying threshold`, color: '#ffaa00' })
    } else {
      setHint({ text: `${fmtS(pnl)} P&L · ❌ Loss day`, color: '#ff4444' })
    }
  }, [balance, currentBalance, account])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!account) return
    setLoading(true)
    setError('')

    const entered = parseFloat(balance)
    if (isNaN(entered)) { setError('Enter a valid closing balance.'); setLoading(false); return }

    const pnl = entered - currentBalance
    const { data: { user } } = await supabase.auth.getUser()

    const { error: insertError } = await supabase.from('entries').insert({
      account_id:      accountId,
      user_id:         user!.id,
      date,
      closing_balance: entered,
      pnl,
      contracts:       parseInt(contracts) || 0,
      notes:           notes.trim(),
    })

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    router.push(`/account/${accountId}`)
    router.refresh()
  }

  if (!account) {
    return <div className="text-muted text-sm">Loading…</div>
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="mb-6">
        <div className="text-xs text-dim tracking-widest mb-1">
          <Link href="/dashboard" className="hover:text-green transition-colors">MY ACCOUNTS</Link>
          <span className="mx-2">›</span>
          <Link href={`/account/${accountId}`} className="hover:text-green transition-colors">
            {account.nickname || `${(account.size/1000).toFixed(0)}K Account`}
          </Link>
          <span className="mx-2">›</span>
          <span>Log Session</span>
        </div>
        <h1 className="font-display text-3xl tracking-[3px] text-white">LOG SESSION</h1>
        <p className="text-xs text-muted mt-1">
          Current balance: <span className="text-green">{fmt(currentBalance)}</span>
        </p>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="input"
              required
            />
          </div>

          <div>
            <label className="label">Closing Balance ($)</label>
            <input
              type="number"
              value={balance}
              onChange={e => setBalance(e.target.value)}
              className="input"
              placeholder={`e.g. ${Math.round(currentBalance).toLocaleString()}`}
              step="0.01"
              required
            />
            {hint && (
              <p className="text-xs mt-1.5" style={{ color: hint.color }}>{hint.text}</p>
            )}
          </div>

          <div>
            <label className="label">Max Contracts Used (optional)</label>
            <input
              type="number"
              value={contracts}
              onChange={e => setContracts(e.target.value)}
              className="input"
              placeholder={`1–${account ? 4 : 4}`}
              min="1"
            />
          </div>

          <div>
            <label className="label">Session Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="input"
              style={{ height: 80, resize: 'vertical' }}
              placeholder="Setups, mistakes, observations…"
            />
          </div>

          {error && (
            <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded p-3">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Link
              href={`/account/${accountId}`}
              className="btn-ghost"
              style={{ display: 'block', textAlign: 'center', padding: '10px 20px', width: 'auto' }}
            >
              Cancel
            </Link>
            <button type="submit" className="btn-primary" disabled={loading || !balance}>
              {loading ? 'Saving…' : 'Save Session →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
