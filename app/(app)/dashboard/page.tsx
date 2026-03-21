// app/(app)/dashboard/page.tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getFirmRules } from '@/lib/firms'
import { getAllFirms } from '@/lib/firms'
import type { Account, Entry } from '@/lib/firms/types'

function fmt(n: number) {
  return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString()
}

async function AccountCard({ account }: { account: Account }) {
  const supabase = await createClient()
  const { data: entries } = await supabase
    .from('entries')
    .select('*')
    .eq('account_id', account.id)
    .order('date', { ascending: true })

  const allFirms = getAllFirms()
  const firmMeta = allFirms.find(f => f.id === account.firm_id)

  let metrics = null
  try {
    const rules = getFirmRules(account.firm_id)
    const config = rules.getConfig(account.size, account.drawdown_type, account.version)
    metrics = rules.derive(config, (entries || []) as Entry[], account.payout_count)
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
            <div className="text-xs text-dim tracking-widest uppercase mb-1">
              {firmMeta?.name || account.firm_id}
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
              {account.drawdown_type === 'trailing_eod' ? 'EOD' : 'Intraday'} · {account.version}
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

  const { data: profile }  = await supabase.from('profiles').select('plan').eq('id', user!.id).single()
  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user!.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  const isPro     = profile?.plan === 'pro'
  const canAdd    = isPro || (accounts?.length || 0) < 1

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl tracking-[3px] text-white">MY ACCOUNTS</h1>
          <p className="text-xs text-muted mt-1">
            {accounts?.length || 0} account{accounts?.length !== 1 ? 's' : ''}
            {!isPro && ' · Free plan (1 account max)'}
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
            <AccountCard key={account.id} account={account as Account} />
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

