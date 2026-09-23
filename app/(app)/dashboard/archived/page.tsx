// app/(app)/dashboard/archived/page.tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getAllFirms } from '@/lib/firms'
import { formatDrawdownType } from '@/lib/format'

export default async function ArchivedAccountsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user!.id)
    .eq('is_active', false)
    .order('created_at', { ascending: true })

  const allFirms = await getAllFirms(supabase)

  return (
    <div>
      <div className="text-xs text-dim tracking-widest mb-1">
        <Link href="/dashboard" className="hover:text-green transition-colors">MY ACCOUNTS</Link>
        <span className="mx-2">›</span>
        <span>ARCHIVED</span>
      </div>
      <h1 className="font-display text-3xl tracking-[3px] text-white mb-1">ARCHIVED ACCOUNTS</h1>
      <p className="text-xs text-muted mb-6">
        {accounts?.length || 0} archived account{accounts?.length !== 1 ? 's' : ''} — these don't count toward your account limit and won't show on your main dashboard.
      </p>

      {accounts && accounts.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {accounts.map(account => {
            const firmMeta = allFirms.find(f => f.id === account.firm_id)
            return (
              <div key={account.id} className="card">
                <div className="text-xs text-dim tracking-widest uppercase mb-1 flex items-center gap-2">
                  {firmMeta?.name || account.firm_id}
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded border normal-case tracking-wide ${
                      account.status === 'passed'
                        ? 'border-green text-green bg-green/10'
                        : 'border-danger text-danger bg-danger/10'
                    }`}
                  >
                    {account.status}
                  </span>
                </div>
                <div className="font-display text-xl tracking-wide text-white">
                  {account.nickname || `${(account.size / 1000).toFixed(0)}K Account`}
                </div>
                <div className="text-xs text-muted mt-0.5">
                  {formatDrawdownType(account.drawdown_type)} · {account.size.toLocaleString()}
                  {account.account_number && <> · {account.account_number}</>}
                </div>
                <div className="flex gap-2 pt-3 mt-3 border-t border-border">
                  <Link href={`/account/${account.id}`} className="btn">View →</Link>
                  <form action={`/api/accounts/${account.id}/archive`} method="POST">
                    <input type="hidden" name="active" value="true" />
                    <button type="submit" className="btn border-blue text-blue hover:bg-blue/10">
                      ↺ Restore
                    </button>
                  </form>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card text-center py-16">
          <div className="font-display text-2xl tracking-widest text-dim mb-3">NO ARCHIVED ACCOUNTS</div>
          <p className="text-sm text-muted">Accounts you archive after they're breached or passed will show up here.</p>
        </div>
      )}
    </div>
  )
}
