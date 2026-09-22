// app/(admin)/admin/users/[userId]/page.tsx
// super_admin only. Role changes stay on /admin/team (the one place that
// edits profiles.role) — this page edits everything else about a user:
// display name, plan, and their accounts (linking through to per-account
// entry editing at users/[userId]/accounts/[accountId]).
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatDrawdownType } from '@/lib/format'

function fmt(n: number) {
  return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString()
}

export default async function AdminUserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: myProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!myProfile || myProfile.role !== 'super_admin') redirect('/admin')

  const admin = createAdminClient()
  const [{ data: profile }, { data: authUser }, { data: accounts }] = await Promise.all([
    admin.from('profiles').select('*').eq('id', userId).single(),
    admin.auth.admin.getUserById(userId),
    admin.from('accounts').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
  ])
  if (!profile) notFound()

  const accountIds = (accounts || []).map(a => a.id)
  const { data: entryCounts } = accountIds.length
    ? await admin.from('entries').select('account_id').in('account_id', accountIds)
    : { data: [] as { account_id: string }[] }
  const entryCountByAccount = new Map<string, number>()
  for (const e of entryCounts || []) {
    entryCountByAccount.set(e.account_id, (entryCountByAccount.get(e.account_id) || 0) + 1)
  }

  return (
    <div>
      <div className="text-xs text-dim tracking-widest mb-1">
        <Link href="/admin/users" className="hover:text-amber transition-colors">USERS</Link>
        <span className="mx-2">›</span>
        <span>{authUser?.user?.email || profile.display_name || userId.slice(0, 8)}</span>
      </div>
      <h1 className="font-display text-3xl tracking-[3px] text-white mb-6">
        {authUser?.user?.email || profile.display_name || 'USER'}
      </h1>

      {/* Profile — display name + plan. Role changes stay on /admin/team. */}
      <div className="card mb-4">
        <div className="stat-label mb-3">Profile</div>
        <form action={`/api/admin/users/${userId}`} method="POST" className="space-y-3">
          <div>
            <label className="label">Display Name</label>
            <input type="text" name="display_name" defaultValue={profile.display_name || ''} className="input" />
          </div>
          <div>
            <label className="label">Plan</label>
            <select name="plan" defaultValue={profile.plan} className="input">
              <option value="free">free</option>
              <option value="pro">pro</option>
            </select>
            <p className="text-[10px] text-dim mt-1">
              Normally set by the Stripe webhook — override only to correct a support issue (e.g. a payment that
              succeeded but the webhook missed).
            </p>
          </div>
          <div className="text-xs text-muted">
            Role: <span className="text-white">{profile.role}</span> —{' '}
            <Link href="/admin/team" className="text-amber hover:underline">change on Team →</Link>
          </div>
          <button type="submit" className="btn border-blue text-blue hover:bg-blue/10">
            Save Profile
          </button>
        </form>
      </div>

      {/* Accounts */}
      <div className="card">
        <div className="stat-label mb-3">Accounts</div>
        {(accounts || []).length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-dim text-[10px] uppercase tracking-widest text-left">
                  <th className="pb-2 pr-4">Nickname</th>
                  <th className="pb-2 pr-4">Firm</th>
                  <th className="pb-2 pr-4">Size</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Start</th>
                  <th className="pb-2 pr-4">Entries</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {(accounts || []).map(a => (
                  <tr key={a.id} className="border-t border-border/50">
                    <td className="py-3 pr-4 text-white">{a.nickname || `${(a.size / 1000).toFixed(0)}K`}</td>
                    <td className="py-3 pr-4 text-muted">{a.firm_id}</td>
                    <td className="py-3 pr-4 text-muted">{fmt(a.size)}</td>
                    <td className="py-3 pr-4 text-muted">{formatDrawdownType(a.drawdown_type)}</td>
                    <td className="py-3 pr-4 text-muted">{a.status}</td>
                    <td className="py-3 pr-4 text-muted">{a.start_date}</td>
                    <td className="py-3 pr-4 text-muted">{entryCountByAccount.get(a.id) || 0}</td>
                    <td className="py-3">
                      <Link
                        href={`/admin/users/${userId}/accounts/${a.id}`}
                        className="text-[10px] tracking-widest uppercase text-amber hover:underline"
                      >
                        Manage →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-xs text-dim">No accounts yet.</div>
        )}
      </div>
    </div>
  )
}
