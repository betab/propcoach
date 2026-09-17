// app/(app)/account/[id]/page.tsx
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getFirmConfigForAccount, derive, buildCoaching } from '@/lib/firms'
import type { Entry, AccountConfig, DerivedMetrics, CoachingRule } from '@/lib/firms/types'
import { formatDrawdownType } from '@/lib/format'
import RulesEditor from '@/components/RulesEditor'
import TradingCalendar from '@/components/TradingCalendar'

function fmt(n: number)  { return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString() }
function fmtS(n: number) { return (n > 0 ? '+$' : n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString() }

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: account } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!account) notFound()

  const [{ data: rawEntries }, { data: lastPayout }, { data: profile }] = await Promise.all([
    supabase
      .from('entries')
      .select('*')
      .eq('account_id', account.id)
      .order('date', { ascending: true }),
    supabase
      .from('payouts')
      .select('recorded_at')
      .eq('account_id', account.id)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('trading_rules')
      .eq('id', user.id)
      .single(),
  ])

  const entries = (rawEntries || []) as Entry[]

  // getFirmConfigForAccount resolves the firm's rules as of THIS account's
  // start_date — a real "no rules found" case (start_date earlier than
  // when this firm/plan's numbers were entered) throws. Unlike
  // dashboard/page.tsx's AccountCard, this was never wrapped, so that
  // throw crashed the entire page with a hard 500 instead of degrading to
  // an explanation — same bug class, just missing here. POST /api/accounts
  // has its own fix for the root cause (validating against the account's
  // real start_date instead of "today" before ever creating the row); this
  // is the last-resort catch for every other way this can still happen
  // (a manually inserted row, a firm's rule history edited after the fact).
  let config: AccountConfig | null = null
  let m: DerivedMetrics | null = null
  let coach: CoachingRule[] = []
  let configError: string | null = null
  try {
    config = await getFirmConfigForAccount(supabase, account)
    m      = derive(config, entries, account.payout_count, lastPayout?.recorded_at ?? null)
    coach  = buildCoaching(config, m, entries, account.payout_count)
  } catch (err) {
    configError = err instanceof Error ? err.message : 'Unknown error resolving this account\'s rules.'
  }

  const bufColor = m ? (m.buffer < 500 ? '#ff4444' : m.buffer < 1200 ? '#ffaa00' : '#00ff88') : '#5a7a90'

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
            {account.status !== 'active' && (
              <span
                className={`ml-3 align-middle text-xs tracking-widest uppercase px-2 py-1 rounded border ${
                  account.status === 'passed'
                    ? 'border-green text-green bg-green/10'
                    : 'border-danger text-danger bg-danger/10'
                }`}
              >
                {account.status}
              </span>
            )}
          </h1>
          <p className="text-xs text-muted mt-0.5">
            {config?.firmName || account.firm_id} · {formatDrawdownType(account.drawdown_type)} · <span className="font-bold uppercase text-white">{account.version}</span>
            {account.account_number && <> · {account.account_number}</>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href={`/account/${account.id}/history`} className="btn">📋 History</Link>
          <Link
            href={`/account/${account.id}/log`}
            className="btn border-green text-green hover:bg-green/10"
          >
            ✏️ Log Session
          </Link>
          {account.status === 'active' ? (
            <>
              <form action={`/api/accounts/${account.id}/status`} method="POST">
                <input type="hidden" name="status" value="passed" />
                <button type="submit" className="btn border-green text-green hover:bg-green/10">
                  ✓ Mark Passed
                </button>
              </form>
              <form action={`/api/accounts/${account.id}/status`} method="POST">
                <input type="hidden" name="status" value="breached" />
                <button type="submit" className="btn border-danger text-danger hover:bg-danger/10">
                  ✕ Mark Breached
                </button>
              </form>
            </>
          ) : (
            <form action={`/api/accounts/${account.id}/status`} method="POST">
              <input type="hidden" name="status" value="active" />
              <button type="submit" className="btn">↺ Reactivate</button>
            </form>
          )}
        </div>
      </div>

      {/* My Rules — global reminders (also editable from the dashboard) plus
          an optional list specific to this account/firm. Shown regardless
          of configError — these don't depend on resolving firm rules. */}
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <RulesEditor
          title="📌 My Rules"
          table="profiles"
          rowId={user.id}
          initialValue={profile?.trading_rules ?? null}
          placeholder={'e.g. No trading the first 15 minutes\nMax 2 trades a day\nWalk away after a big win'}
          emptyHint="No rules set yet — add reminders you want to see every time you check an account."
        />
        <RulesEditor
          title={`📌 ${account.nickname || `${(account.size / 1000).toFixed(0)}K`} Rules`}
          table="accounts"
          rowId={account.id}
          initialValue={account.rules ?? null}
          placeholder={'e.g. This firm resets consistency after payout\nStay under 25% on any one day'}
          emptyHint="No rules specific to this account yet — optional, for anything unique to this firm/plan."
        />
      </div>

      {configError ? (
        <div className="card border-danger/30 bg-danger/5">
          <div className="stat-label mb-2 text-danger">⚠ Rules Not Available For This Start Date</div>
          <p className="text-sm text-muted mb-3">
            We couldn't resolve {account.firm_id}&apos;s rules for this account as of its start date
            ({account.start_date}). This usually means the start date is earlier than when this firm/plan's
            numbers were entered into PropCoach — the account itself is fine, it just has nothing to compute
            metrics against yet.
          </p>
          <p className="text-xs text-dim mb-3">{configError}</p>
          <p className="text-xs text-muted">
            Reach out and we'll either backdate the rule history (if it was genuinely in effect that far
            back) or help you recreate this account with a later start date.
          </p>
        </div>
      ) : config && m && (
      <>
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
          { label: 'Daily Loss Limit', value: m.effectiveDailyLossLimit ? fmt(m.effectiveDailyLossLimit) : 'None', sub: m.dllIsDynamic ? `${config.scaleDllPct}% of peak balance — moves daily` : m.effectiveDailyLossLimit ? "Pauses — won't kill" : 'No DLL on this account', color: '#ffaa00' },
          { label: 'Consistency',      value: m.consistencyPct.toFixed(0) + '%', sub: m.activeConsistencyRule === 0 ? 'No consistency rule' : m.consistencyOk ? `✅ Under ${m.activeConsistencyRule}% — OK` : `❌ Over ${m.activeConsistencyRule}% — Blocked`, color: m.consistencyOk ? '#00ff88' : '#ff4444' },
          { label: 'Qualifying Days',  value: String(m.qualifyingDays), sub: `$${config.qualifyingDayMin}+ days logged`, color: '#7aa3d4' },
          { label: `Payout #${account.payout_count + 1}`, value: m.nextPayoutMax != null ? fmt(m.nextPayoutMax) : '—', sub: m.nextPayoutMax == null ? '⚠ Payout ladder not set yet' : m.payoutEligible ? '✅ Eligible now' : !m.payoutFrequencyOk ? `⏳ ${config.minDaysBetweenPayouts - (m.daysSinceLastPayout ?? 0)}d until next payout` : 'Not eligible yet', color: m.nextPayoutMax == null ? '#ffaa00' : m.payoutEligible ? '#00ff88' : '#5a7a90', disclaimer: 'payout-eligibility' },
        ].map(s => (
          <div key={s.label} className="card">
            <div className="stat-label">
              {s.label}
              {s.disclaimer && (
                <a href={`#disclaimer-${s.disclaimer}`} className="text-dim no-underline hover:text-amber ml-0.5">*</a>
              )}
            </div>
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
                <div className="font-display text-xl text-blue tracking-wide">{m.nextPayoutMax != null ? fmt(m.nextPayoutMax) : '—'}</div>
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
      </>
      )}

      {/* Trading Calendar — pure display over entries, independent of
          whether firm config resolved, so it still renders even when
          configError is set above. */}
      {entries.length > 0 && (
        <div className="mt-3">
          <TradingCalendar entries={entries} />
        </div>
      )}
    </div>
  )
}
