'use client'
// app/(app)/dashboard/new-account/page.tsx
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getAllFirms, getFirmVersions, getAvailableSizes, getCurrentFirmConfig } from '@/lib/firms'
import type { FirmMeta, FirmVersion, DrawdownType } from '@/lib/firms/types'
import PageHeader from '@/components/PageHeader'

// Versions sharing a version_group (e.g. Tradeify Select's select_daily/
// select_flex, both group: 'Select') render as one "family" — like Growth
// and Lightning, which have no group and so are each their own
// single-variant family. A firm with no grouping at all behaves exactly as
// before: one family per version, in DB order.
interface VersionFamily {
  key:      string          // the group name, or the lone version's key
  label:    string          // the group name, or the lone version's label
  variants: FirmVersion[]
}

function buildFamilies(versions: FirmVersion[]): VersionFamily[] {
  const families: VersionFamily[] = []
  const indexByGroup = new Map<string, number>()
  for (const v of versions) {
    if (v.group) {
      const idx = indexByGroup.get(v.group)
      if (idx == null) {
        indexByGroup.set(v.group, families.length)
        families.push({ key: v.group, label: v.group, variants: [v] })
      } else {
        families[idx].variants.push(v)
      }
    } else {
      families.push({ key: v.key, label: v.label, variants: [v] })
    }
  }
  return families
}

// "Select — Daily Payouts (Funded)" + group "Select" -> "Daily Payouts (Funded)".
// Falls back to the full label if it doesn't start with "{group}" + a
// separator — never hides information, just trims the redundant prefix
// when there's a clean one to trim.
function stripGroupPrefix(label: string, group: string): string {
  const escaped = group.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = label.match(new RegExp(`^${escaped}\\s*[-–—:]\\s*`))
  return m ? label.slice(m[0].length) : label
}

export default function NewAccountPage() {
  const router = useRouter()
  const supabase = createClient()

  const [allFirms,       setAllFirms]       = useState<FirmMeta[]>([])
  const [versions,       setVersions]       = useState<FirmVersion[]>([])
  const [availableSizes, setAvailableSizes] = useState<number[]>([])

  const [firmId,        setFirmId]        = useState('apex')
  const [size,          setSize]          = useState(50000)
  const [drawdownType,  setDrawdownType]  = useState('trailing_eod')
  const [version,       setVersion]       = useState('4.0')
  const [nickname,      setNickname]      = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [startDate,     setStartDate]     = useState(new Date().toISOString().slice(0, 10))
  const [optionalDll,   setOptionalDll]   = useState<number | null>(null)
  const [dllEnabled,    setDllEnabled]    = useState(false)
  const [error,         setError]         = useState('')
  const [loading,       setLoading]       = useState(false)

  useEffect(() => {
    getAllFirms(supabase).then(setAllFirms)
  }, [])

  // Reload the firm's available versions whenever it changes, and pick a
  // sensible default version (only shows a picker when there's more than
  // one — most firms will only have one until an admin adds a second, e.g.
  // Apex Legacy once its real numbers are entered).
  useEffect(() => {
    let cancelled = false
    getFirmVersions(supabase, firmId).then(v => {
      if (cancelled) return
      setVersions(v)
      if (v.length && !v.some(x => x.key === version)) setVersion(v[0].key)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmId])

  // Reload available sizes whenever firm or version changes.
  useEffect(() => {
    if (!version) { setAvailableSizes([]); return }
    let cancelled = false
    getAvailableSizes(supabase, firmId, version).then(sizes => {
      if (cancelled) return
      setAvailableSizes(sizes)
      if (sizes.length && !sizes.includes(size)) setSize(sizes[0])
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmId, version])

  // Preview whether this exact combination offers an optional Daily Loss
  // Limit opt-in (Lucid Trading, e.g.) — most firms/sizes don't, in which
  // case the checkbox below just doesn't render. Resets the trader's choice
  // whenever the option disappears (a different selection that doesn't
  // offer it) so a stale "enabled" can't silently carry over.
  useEffect(() => {
    if (!version || !size) { setOptionalDll(null); return }
    let cancelled = false
    getCurrentFirmConfig(supabase, firmId, size, drawdownType as DrawdownType, version)
      .then(config => { if (!cancelled) setOptionalDll(config.optionalDailyLossLimit) })
      .catch(() => { if (!cancelled) setOptionalDll(null) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmId, size, drawdownType, version])

  useEffect(() => {
    if (optionalDll == null) setDllEnabled(false)
  }, [optionalDll])

  const families = useMemo(() => buildFamilies(versions), [versions])
  const selectedFamily = families.find(f => f.variants.some(v => v.key === version))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firm_id:        firmId,
        size,
        drawdown_type:  drawdownType,
        version,
        nickname,
        account_number: accountNumber,
        start_date:     startDate,
        daily_loss_limit_enabled: dllEnabled,
      }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Something went wrong.')
      setLoading(false)
      return
    }

    router.push(`/account/${data.id}`)
  }

  return (
    <div className="max-w-lg mx-auto">
      <PageHeader section="ADD ACCOUNT" subtitle="Connect a funded account to start tracking" />

      <div className="card">
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Firm selection */}
          <div>
            <label className="label">Prop Firm</label>
            <div className="grid grid-cols-2 gap-2">
              {allFirms.map(firm => (
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
            {availableSizes.length > 0 ? (
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
            ) : (
              <div className="text-xs text-dim">No account sizes available for this firm yet.</div>
            )}
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

          {/* Optional Daily Loss Limit — only shown when this firm/size offers one (e.g. Lucid Trading). Chosen once, at creation, same as on the firm's own site. */}
          {optionalDll != null && (
            <div>
              <label className="label">Daily Loss Limit</label>
              <button
                type="button"
                onClick={() => setDllEnabled(v => !v)}
                className={`w-full p-3 rounded border text-left transition-all ${
                  dllEnabled ? 'border-green bg-green/5' : 'border-border hover:border-blue/40'
                }`}
              >
                <div className={`text-xs font-semibold ${dllEnabled ? 'text-green' : 'text-muted'}`}>
                  {dllEnabled ? `Enabled — $${optionalDll.toLocaleString()}/day` : 'Optional — off by default'}
                </div>
                <div className="text-[10px] text-dim mt-0.5">
                  This firm lets you opt into a ${optionalDll.toLocaleString()} daily loss limit. This choice can't
                  be changed after the account is created.
                </div>
              </button>
            </div>
          )}

          {/* Plan — only shown when this firm has more than one family. Versions
              sharing a version_group (e.g. Tradeify's Select) collapse into one
              card here; picking a multi-variant family reveals the Payout
              Schedule selector below instead of listing every variant flat. */}
          {families.length > 1 && (
            <div>
              <label className="label">Plan</label>
              <div className="grid grid-cols-2 gap-2">
                {families.map(family => (
                  <button
                    key={family.key}
                    type="button"
                    onClick={() => setVersion(family.variants[0].key)}
                    className={`p-3 rounded border text-left transition-all ${
                      selectedFamily?.key === family.key
                        ? 'border-green bg-green/5'
                        : 'border-border hover:border-blue/40'
                    }`}
                  >
                    <div className={`text-xs font-semibold ${selectedFamily?.key === family.key ? 'text-green' : 'text-muted'}`}>
                      {family.label}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Variant — only shown for the family currently selected, and only
              when it actually has more than one (e.g. Select's Daily vs Flex
              payout cadence). A single-variant family never shows this. */}
          {selectedFamily && selectedFamily.variants.length > 1 && (
            <div>
              <label className="label">Payout Schedule</label>
              <div className="grid grid-cols-2 gap-2">
                {selectedFamily.variants.map(v => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => setVersion(v.key)}
                    className={`p-3 rounded border text-left transition-all ${
                      version === v.key
                        ? 'border-green bg-green/5'
                        : 'border-border hover:border-blue/40'
                    }`}
                  >
                    <div className={`text-xs font-semibold ${version === v.key ? 'text-green' : 'text-muted'}`}>
                      {stripGroupPrefix(v.label, selectedFamily.label)}
                    </div>
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
            <button type="submit" className="btn-primary" disabled={loading || !availableSizes.length}>
              {loading ? 'Creating…' : 'Create Account →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
