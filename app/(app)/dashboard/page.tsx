// app/(app)/dashboard/page.tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getFirmConfigForAccount, derive, getAllFirms } from '@/lib/firms'
import type { Account, Entry, FirmMeta } from '@/lib/firms/types'
import { formatDrawdownType } from '@/lib/format'
import RulesEditor from '@/components/RulesEditor'

function fmt(n: number) {
  return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString()
}

async function AccountCard({ account, firmMeta }: { account: Account; firmMeta: FirmMeta | undefined }) {
  const supabase = await createClient()
  const [{ data: entries }, { data: lastPayout }] = await Promise.all([
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
  ])

  let metrics = null
  try {
    const config = await getFirmConfigForAccount(supabase, account)
    metrics = derive(config, (entries || []) as Entry[], account.payout_count, lastPayout?.recorded_at ?? null)
  } catch {}

  const bufColor = !metrics ? '#5a7a90'
    : metrics.buffer < 500  ? '#ff4444'
    : metrics.buffer < 1200 ? '#ffaa00'
    : '#00ff88'

  return (
    <Link href={`/account/${account.id}`} className="block">
      <div className="card hover:border-blue/40 transition-colors cursor-pointer">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-xs text-dim tracking-widest uppercase mb-1 flex items-center gap-2">
              {firmMeta?.name || account.firm_id}
              {account.status !== 'active' && (
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded border normal-case tracking-wide ${
                    account.status === 'passed'
                      ? 'border-green text-green bg-green/10'
                      : 'border-danger text-danger bg-danger/10'
                  }`}
                >
                  {account.status}
                </span>
              )}
            </div>
            <div className="font-display text-xl tracking-wide text-white">
              {account.nickname || `${(account.size/1000).toFixed(0)}K Account`}
            </div>
            {account.account_number && (
              <div className="text-xs text-muted mt-0.5">{account.account_number}</div>
            )}
          </div>
          <div className="text-right">
            <div className="text-[10px] text-dim tracking-widest uppercase">
              {formatDrawdownType(account.drawdown_type)} · {account.version}
            </div>
            <div className="text-xs text-muted mt-1">
              {account.size.toLocaleString()} account
            </div>
          </div>
        </div>

        {/* Metrics row */}
        {metrics ? (
          <div className="grid grid-cols-4 gap-3 pt-3 border-t border-border">
            {[
              { label: 'Balance',    value: fmt(metrics.currentBalance), color: metrics.currentBalance >= account.size ? '#00ff88' : '#ff4444' },
              { label: 'Buffer',     value: fmt(metrics.buffer),         color: bufColor },
              { label: 'MLL',        value: metrics.mllLocked ? 'LOCKED 🔒' : fmt(metrics.currentMLL), color: metrics.mllLocked ? '#00ff88' : '#ffaa00' },
              { label: 'Days Logged',value: String(entries?.length || 0), color: '#7aa3d4' },
            ].map(s => (
              <div key={s.label}>
                <div className="text-[9px] text-dim tracking-widest uppercase mb-1">{s.label}</div>
                <div className="font-display text-base tracking-wide" style={{ color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="pt-3 border-t border-border">
            <div className="text-xs text-muted">Log your first session to see metrics →</div>
          </div>
        )}
      </div>
    </Link>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile }  = await supabase.from('profiles').select('plan, trading_rules, role').eq('id', user!.id).single()
  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user!.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  const isPro       = profile?.plan === 'pro'
  // Same exemption as the DB trigger (check_account_limit(), migration 015)
  // — admins don't need a Pro subscription to track more than one account.
  // This only controls whether the UI shows "+ Add Account" or the upgrade
  // prompt; the trigger is what actually enforces it either way.
  const isAdmin     = !!profile?.role && profile.role !== 'user'
  const activeCount = accounts?.filter(a => a.status === 'active').length || 0
  const canAdd      = isPro || isAdmin || activeCount < 1

  const allFirms = await getAllFirms(supabase)

  return (
    <div>
      <RulesEditor
        title="📌 My Rules"
        table="profiles"
        rowId={user!.id}
        initialValue={profile?.trading_rules ?? null}
        placeholder={'e.g. No trading the first 15 minutes\nMax 2 trades a day\nWalk away after a big win'}
        emptyHint="No rules set yet — add reminders you want to see every time you check your accounts."
      />

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl tracking-[3px] text-white">MY ACCOUNTS</h1>
          <p className="text-xs text-muted mt-1">
            {accounts?.length || 0} account{accounts?.length !== 1 ? 's' : ''}
            {!isPro && !isAdmin && ' · Free plan (1 account max)'}
            {!isPro && isAdmin && ' · Admin — unlimited accounts'}
          </p>
        </div>
        {canAdd ? (
          <Link
            href="/dashboard/new-account"
            className="btn border-green text-green hover:bg-green/10"
          >
            + Add Account
          </Link>
        ) : (
          <Link
            href="/settings/billing"
            className="btn border-amber text-amber hover:bg-amber/10"
          >
            Upgrade for More
          </Link>
        )}
      </div>

      {/* Account grid */}
      {accounts && accounts.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {accounts.map(account => (
            <AccountCard
              key={account.id}
              account={account as Account}
              firmMeta={allFirms.find(f => f.id === account.firm_id)}
            />
          ))}
        </div>
      ) : (
        <div className="card text-center py-16">
          <div className="font-display text-2xl tracking-widest text-dim mb-3">NO ACCOUNTS YET</div>
          <p className="text-sm text-muted mb-6">Add your first funded account to start tracking.</p>
          <div className="flex justify-center">
            <Link href="/dashboard/new-account" className="btn-primary" style={{ width: 'auto', padding: '10px 28px' }}>
              + Add Your First Account
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

