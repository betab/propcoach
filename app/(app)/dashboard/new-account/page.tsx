'use client'
// app/(app)/dashboard/new-account/page.tsx
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getAllFirms } from '@/lib/firms'

const ALL_FIRMS = getAllFirms()

export default function NewAccountPage() {
  const router = useRouter()
  const supabase = createClient()

  const [firmId,        setFirmId]        = useState('apex')
  const [size,          setSize]          = useState(50000)
  const [drawdownType,  setDrawdownType]  = useState('trailing_eod')
  const [version,       setVersion]       = useState('4.0')
  const [nickname,      setNickname]      = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [startDate,     setStartDate]     = useState(new Date().toISOString().slice(0, 10))
  const [error,         setError]         = useState('')
  const [loading,       setLoading]       = useState(false)

  const selectedFirm = ALL_FIRMS.find(f => f.id === firmId)
  let availableSizes: number[] = [25000, 50000, 100000, 150000]
  try {
    if (selectedFirm?.rules) availableSizes = selectedFirm.rules.getAvailableSizes()
  } catch {}

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data, error: insertError } = await supabase
      .from('accounts')
      .insert({
        user_id:        user.id,
        firm_id:        firmId,
        nickname:       nickname || `${(size/1000).toFixed(0)}K ${firmId.toUpperCase()}`,
        account_number: accountNumber,
        size,
        drawdown_type:  drawdownType,
        version,
        start_date:     startDate,
      })
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    router.push(`/account/${data.id}`)
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-3xl tracking-[3px] text-white">ADD ACCOUNT</h1>
        <p className="text-xs text-muted mt-1">Connect a funded account to start tracking</p>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Firm selection */}
          <div>
            <label className="label">Prop Firm</label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_FIRMS.map(firm => (
                <button
                  key={firm.id}
                  type="button"
                  onClick={() => !firm.comingSoon && setFirmId(firm.id)}
                  className={`relative p-3 rounded border text-left transition-all ${
                    firm.comingSoon
                      ? 'border-border/50 opacity-40 cursor-not-allowed'
                      : firmId === firm.id
                      ? 'border-green bg-green/5 text-green'
                      : 'border-border text-muted hover:border-blue/40'
                  }`}
                >
                  <div className="text-xs font-semibold tracking-wide">{firm.name}</div>
                  {firm.comingSoon && (
                    <div className="text-[9px] tracking-widest text-amber mt-0.5">COMING SOON</div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Account size */}
          <div>
            <label className="label">Account Size</label>
            <div className="grid grid-cols-4 gap-2">
              {availableSizes.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSize(s)}
                  className={`p-2.5 rounded border text-center text-xs transition-all ${
                    size === s
                      ? 'border-green bg-green/5 text-green'
                      : 'border-border text-muted hover:border-blue/40'
                  }`}
                >
                  ${(s/1000).toFixed(0)}K
                </button>
              ))}
            </div>
          </div>

          {/* Drawdown type */}
          <div>
            <label className="label">Drawdown Type</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'trailing_eod',      label: 'EOD Trailing',      sub: 'Trails at market close' },
                { value: 'trailing_intraday', label: 'Intraday Trailing', sub: 'Trails in real-time' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDrawdownType(opt.value)}
                  className={`p-3 rounded border text-left transition-all ${
                    drawdownType === opt.value
                      ? 'border-green bg-green/5'
                      : 'border-border hover:border-blue/40'
                  }`}
                >
                  <div className={`text-xs font-semibold ${drawdownType === opt.value ? 'text-green' : 'text-muted'}`}>
                    {opt.label}
                  </div>
                  <div className="text-[10px] text-dim mt-0.5">{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Version (Apex-specific) */}
          {firmId === 'apex' && (
            <div>
              <label className="label">Account Version</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: '4.0',    label: '4.0 (March 2026+)',  sub: 'New rules, one-time billing' },
                  { value: 'legacy', label: 'Legacy (pre-March)', sub: 'Old rules, monthly billing' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setVersion(opt.value)}
                    className={`p-3 rounded border text-left transition-all ${
                      version === opt.value
                        ? 'border-green bg-green/5'
                        : 'border-border hover:border-blue/40'
                    }`}
                  >
                    <div className={`text-xs font-semibold ${version === opt.value ? 'text-green' : 'text-muted'}`}>
                      {opt.label}
                    </div>
                    <div className="text-[10px] text-dim mt-0.5">{opt.sub}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Nickname */}
          <div>
            <label className="label">Nickname (optional)</label>
            <input
              type="text"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              className="input"
              placeholder={`e.g. Main ${(size/1000).toFixed(0)}K or Second Attempt`}
            />
          </div>

          {/* Account number */}
          <div>
            <label className="label">Account Number (optional)</label>
            <input
              type="text"
              value={accountNumber}
              onChange={e => setAccountNumber(e.target.value)}
              className="input"
              placeholder="e.g. PA-APEX-387426-01"
            />
          </div>

          {/* Start date */}
          <div>
            <label className="label">Account Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="input"
            />
          </div>

          {error && (
            <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded p-3">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="btn-ghost"
              style={{ width: 'auto', padding: '10px 20px' }}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Creating…' : 'Create Account →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
