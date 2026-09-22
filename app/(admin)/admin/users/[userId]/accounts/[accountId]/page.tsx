// app/(admin)/admin/users/[userId]/accounts/[accountId]/page.tsx
// super_admin only. Edits fields normal users can't self-edit (size, firm,
// drawdown type, version, start_date — locked in migration 013) plus the
// account's logged entries — a correction tool for support requests, not a
// creation flow (see /dashboard/new-account for that).
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAllFirms, getFirmVersions } from '@/lib/firms'

function fmt(n: number) {
  return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString()
}

export default async function AdminUserAccountPage({
  params,
}: {
  params: Promise<{ userId: string; accountId: string }>
}) {
  const { userId, accountId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: myProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!myProfile || myProfile.role !== 'super_admin') redirect('/admin')

  const admin = createAdminClient()
  const [{ data: account }, { data: entries }, firms] = await Promise.all([
    admin.from('accounts').select('*').eq('id', accountId).single(),
    admin.from('entries').select('*').eq('account_id', accountId).order('date', { ascending: true }),
    getAllFirms(admin),
  ])
  if (!account || account.user_id !== userId) notFound()

  const versions = await getFirmVersions(admin, account.firm_id)

  return (
    <div>
      <div className="text-xs text-dim tracking-widest mb-1">
        <Link href="/admin/users" className="hover:text-amber transition-colors">USERS</Link>
        <span className="mx-2">›</span>
        <Link href={`/admin/users/${userId}`} className="hover:text-amber transition-colors">
          {userId.slice(0, 8)}
        </Link>
        <span className="mx-2">›</span>
        <span>{account.nickname || `${(account.size / 1000).toFixed(0)}K`}</span>
      </div>
      <h1 className="font-display text-3xl tracking-[3px] text-white mb-6">
        {account.nickname || `${(account.size / 1000).toFixed(0)}K ACCOUNT`}
      </h1>

      {/* Account config — the fields locked from the user's own self-edit
          (migration 013) plus the ones they can already edit themselves,
          all in one place for a support correction. */}
      <div className="card mb-4">
        <div className="stat-label mb-3">Account Config</div>
        <form action={`/api/admin/users/${userId}/accounts/${accountId}`} method="POST" className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Nickname</label>
              <input type="text" name="nickname" defaultValue={account.nickname || ''} className="input" />
            </div>
            <div>
              <label className="label">Account Number</label>
              <input type="text" name="account_number" defaultValue={account.account_number || ''} className="input" />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Firm</label>
              <select name="firm_id" defaultValue={account.firm_id} className="input">
                {firms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Version</label>
              <select name="version" defaultValue={account.version} className="input">
                {versions.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
                {!versions.some(v => v.key === account.version) && (
                  <option value={account.version}>{account.version} (not in current list)</option>
                )}
              </select>
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Size ($)</label>
              <input type="number" name="size" defaultValue={account.size} className="input" step="1" required />
            </div>
            <div>
              <label className="label">Drawdown Type</label>
              <select name="drawdown_type" defaultValue={account.drawdown_type} className="input">
                <option value="trailing_eod">Trailing EOD</option>
                <option value="trailing_intraday">Trailing Intraday</option>
                <option value="static">Static</option>
              </select>
            </div>
            <div>
              <label className="label">Start Date</label>
              <input type="date" name="start_date" defaultValue={account.start_date} className="input" required />
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Status</label>
              <select name="status" defaultValue={account.status} className="input">
                <option value="active">active</option>
                <option value="breached">breached</option>
                <option value="passed">passed</option>
              </select>
            </div>
            <div>
              <label className="label">Payout Count</label>
              <input type="number" name="payout_count" defaultValue={account.payout_count} className="input" min="0" />
            </div>
            <div className="flex items-end gap-4 pb-2">
              <label className="flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" name="is_active" defaultChecked={account.is_active} className="accent-green" />
                Active
              </label>
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  name="daily_loss_limit_enabled"
                  defaultChecked={account.daily_loss_limit_enabled}
                  className="accent-blue"
                />
                DLL opt-in
              </label>
            </div>
          </div>
          <div>
            <label className="label">Rules (optional)</label>
            <textarea name="rules" defaultValue={account.rules || ''} className="input" style={{ height: 60, resize: 'vertical' }} />
          </div>
          <button type="submit" className="btn border-blue text-blue hover:bg-blue/10">
            Save Account
          </button>
        </form>
      </div>

      {/* Entries */}
      <div className="card">
        <div className="stat-label mb-3">Entries ({(entries || []).length})</div>
        {(entries || []).length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-dim text-[10px] uppercase tracking-widest text-left">
                  <th className="pb-2 pr-3">Date</th>
                  <th className="pb-2 pr-3">Closing Balance</th>
                  <th className="pb-2 pr-3">P&amp;L</th>
                  <th className="pb-2 pr-3">Contracts</th>
                  <th className="pb-2 pr-3">Notes</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {(entries || []).map(e => (
                  <tr key={e.id} className="border-t border-border/50">
                    <td className="py-2 pr-3 text-white whitespace-nowrap">{e.date}</td>
                    <td className="py-2 pr-3">
                      <form
                        id={`entry-${e.id}`}
                        action={`/api/admin/users/${userId}/entries/${e.id}`}
                        method="POST"
                      />
                      <input
                        type="number" step="0.01" name="closing_balance" defaultValue={e.closing_balance}
                        form={`entry-${e.id}`} className="input" style={{ padding: '4px 6px', width: 110 }}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number" step="0.01" name="pnl" defaultValue={e.pnl}
                        form={`entry-${e.id}`} className="input" style={{ padding: '4px 6px', width: 100 }}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number" name="contracts" defaultValue={e.contracts}
                        form={`entry-${e.id}`} className="input" style={{ padding: '4px 6px', width: 70 }}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="text" name="notes" defaultValue={e.notes || ''}
                        form={`entry-${e.id}`} className="input" style={{ padding: '4px 6px' }}
                      />
                    </td>
                    <td className="py-2 whitespace-nowrap">
                      <button type="submit" form={`entry-${e.id}`} className="text-[10px] tracking-widest uppercase text-blue hover:underline mr-3">
                        Save
                      </button>
                      <form action={`/api/admin/users/${userId}/entries/${e.id}/delete`} method="POST" className="inline">
                        <button type="submit" className="text-[10px] tracking-widest uppercase text-danger hover:underline">
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-xs text-dim">No entries logged yet.</div>
        )}
      </div>
    </div>
  )
}
