// app/(app)/account/[id]/page.tsx
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getFirmRules } from '@/lib/firms'
import type { Entry } from '@/lib/firms/types'

function fmt(n: number)  { return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString() }
function fmtS(n: number) { return (n > 0 ? '+$' : n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString() }

export default async function AccountPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
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
    .order('date', { ascending: true })

  const entries = (rawEntries || []) as Entry[]

  const rules  = getFirmRules(account.firm_id)
  const config = rules.getConfig(account.size, account.drawdown_type, account.version)
  const m      = rules.derive(config, entries, account.payout_count)
  const coach  = rules.buildCoaching(config, m, entries, account.payout_count)

  const bufColor = m.buffer < 500 ? '#ff4444' : m.buffer < 1200 ? '#ffaa00' : '#00ff88'

  return (
    <div>
      {/* Breadcrumb + actions */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="text-xs text-dim tracking-widest mb-1">
            <Link href="/dashboard" className="hover:text-green transition-colors">MY ACCOUNTS</Link>
            <span className="mx-2">›</span>
            <span>{account.nickname || `${(account.size/1000).toFixed(0)}K Account`}</span>
          </div>
          <h1 className="font-display text-3xl tracking-[3px] text-white">
            {account.nickname || `${(account.size/1000).toFixed(0)}K ACCOUNT`}
          </h1>
          {account.account_number && (
            <p className="text-xs text-muted mt-0.5">{account.account_number}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Link href={`/account/${account.id}/history`} className="btn">📋 History</Link>
          <Link
            href={`/account/${account.id}/log`}
            className="btn border-green text-green hover:bg-green/10"
          >
            ✏️ Log Session
          </Link>
        </div>
      </div>

      {/* Primary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        {[
          { label: 'Balance',      value: fmt(m.currentBalance),  sub: fmtS(m.currentBalance - config.accountSize) + ' total', color: m.currentBalance >= config.accountSize ? '#00ff88' : '#ff4444' },
          { label: 'MLL Kill Line',value: fmt(m.currentMLL),      sub: m.mllLocked ? '🔒 LOCKED' : 'Trailing…',               color: m.mllLocked ? '#00ff88' : '#ffaa00' },
          { label: 'Buffer',       value: fmt(m.buffer),          sub: m.buffer < 1000 ? '⚠️ TIGHT' : 'Safe zone',             color: bufColor },
          { label: 'Safety Net',   value: fmt(config.safetyNet),  sub: m.aboveSafetyNet >= 0 ? `+${fmt(m.aboveSafetyNet)} above` : `${fmt(Math.abs(m.aboveSafetyNet))} SHORT`, color: m.aboveSafetyNet >= 0 ? '#00ff88' : '#ff4444' },
        ].map(s => (
          <div key={s.label} className="card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        {[
          { label: 'Daily Loss Limit', value: config.dailyLossLimit ? fmt(config.dailyLossLimit) : 'None', sub: config.dailyLossLimit ? "Pauses — won't kill" : 'No DLL on this account', color: '#ffaa00' },
          { label: 'Consistency',      value: m.consistencyPct.toFixed(0) + '%', sub: m.consistencyOk ? '✅ Under 50% — OK' : '❌ Over 50% — Blocked', color: m.consistencyOk ? '#00ff88' : '#ff4444' },
          { label: 'Qualifying Days',  value: String(m.qualifyingDays), sub: `$${config.qualifyingDayMin}+ days logged`, color: '#7aa3d4' },
          { label: `Payout #${account.payout_count + 1}`, value: fmt(m.nextPayoutMax), sub: m.payoutEligible ? '✅ Eligible now' : 'Not eligible yet', color: m.payoutEligible ? '#00ff88' : '#5a7a90' },
        ].map(s => (
          <div key={s.label} className="card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* MLL Lock progress */}
      {!m.mllLocked ? (
        <div className="card mb-3">
          <div className="flex justify-between mb-2">
            <span className="text-xs text-amber tracking-widest uppercase">🎯 MLL Lock Progress — reach {fmt(config.safetyNet)}</span>
            <span className="text-xs text-muted">{fmt(m.currentBalance)} / {fmt(config.safetyNet)}</span>
          </div>
          <div className="h-2 bg-bg2 rounded overflow-hidden">
            <div
              className="h-full rounded transition-all duration-500"
              style={{ width: `${m.mllLockProgress}%`, background: 'linear-gradient(90deg,#1e5a30,#00ff88)' }}
            />
          </div>
          <div className="text-xs text-muted mt-2">{fmt(Math.max(0, config.safetyNet - m.currentBalance))} more to lock MLL forever</div>
        </div>
      ) : (
        <div className="card mb-3 border-green/20 bg-green/5">
          <span className="text-xs text-green tracking-widest">
            🔒 MLL LOCKED AT {fmt(config.mllLockAt)} — Trailing drawdown can no longer wipe your account. Keep building.
          </span>
        </div>
      )}

      {/* Session breakdown + payout */}
      {entries.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div className="card">
            <div className="stat-label mb-3">Session Breakdown</div>
            <div className="flex gap-5">
              {[
                [m.winDays,  '#00ff88', 'Win Days'],
                [m.lossDays, '#ff4444', 'Loss Days'],
                [entries.length, '#7aa3d4', 'Total'],
                [m.winRate + '%', '#ffaa00', 'Win Rate'],
              ].map(([v, c, l]) => (
                <div key={String(l)}>
                  <div className="font-display text-xl tracking-wide" style={{ color: String(c) }}>{v}</div>
                  <div className="text-xs text-muted mt-1">{l}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="stat-label mb-3">Payout Status</div>
            <div className="flex items-center gap-5 flex-wrap">
              <div>
                <div className="font-display text-xl text-green tracking-wide">{account.payout_count}</div>
                <div className="text-xs text-muted mt-1">Completed</div>
              </div>
              <div>
                <div className="font-display text-xl text-blue tracking-wide">{fmt(m.nextPayoutMax)}</div>
                <div className="text-xs text-muted mt-1">Payout #{account.payout_count + 1} max</div>
              </div>
              {m.payoutEligible && (
                <form action={`/api/accounts/${account.id}/payout`} method="POST" className="ml-auto">
                  <button
                    type="submit"
                    className="text-[10px] tracking-widest uppercase border border-green text-green px-3 py-2 rounded hover:bg-green/10 transition-colors font-mono"
                  >
                    Record Payout ✓
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Coaching */}
      <div className="card border-green/10">
        <div className="stat-label mb-4">🧠 Tomorrow's Game Plan</div>
        {entries.length === 0 ? (
          <div className="text-sm text-muted">
            Log your first session to generate your coaching brief.{' '}
            <Link href={`/account/${account.id}/log`} className="text-green hover:underline">Log today →</Link>
          </div>
        ) : (
          <div className="space-y-2">
            {coach.map((rule, i) => {
              const c = rule.severity === 'alert' ? '#ff4444' : rule.severity === 'warn' ? '#ffaa00' : '#00ff88'
              const borderColor = rule.severity === 'alert' ? 'border-l-danger' : rule.severity === 'warn' ? 'border-l-amber' : 'border-l-green'
              return (
                <div key={i} className={`bg-bg2 border-l-[3px] ${borderColor} rounded-r p-3`}>
                  <div className="text-[10px] tracking-widest uppercase mb-1" style={{ color: c }}>{rule.label}</div>
                  <div className="font-display text-lg tracking-wide" style={{ color: c }}>{rule.value}</div>
                  <div className="text-xs text-muted mt-1 leading-relaxed">{rule.note}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
