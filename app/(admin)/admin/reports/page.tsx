// app/(admin)/admin/reports/page.tsx
// Reporting Dashboard (PR B of that milestone — stats only, read-only for
// every admin tier including admin_readonly, matching the rest of the
// (admin) route group). Every query here is a cross-user platform-wide
// aggregate (all signups, all accounts, all entries) — the normal
// RLS-scoped client can't see past auth.uid(), so this uses the
// service-role client, same reason admin/users/* already needs it.
import { createAdminClient } from '@/lib/supabase/admin'
import {
  computeSignupsOverTime, computePlanMix, computeAccountStatusCounts,
  computeEntriesPerWeek, computeFirmPopularity,
} from '@/lib/admin-reports'
import SignupsChart from '@/components/AdminReports/SignupsChart'
import EntriesPerWeekChart from '@/components/AdminReports/EntriesPerWeekChart'

export default async function AdminReportsPage() {
  const admin = createAdminClient()

  const [{ data: profiles }, { data: accounts }, { data: entries }, { data: firms }] = await Promise.all([
    admin.from('profiles').select('plan, created_at'),
    admin.from('accounts').select('firm_id, is_active'),
    admin.from('entries').select('date'),
    admin.from('firms').select('id, name'),
  ])

  const signups   = computeSignupsOverTime(profiles ?? [])
  const planMix    = computePlanMix(profiles ?? [])
  const accountStatus = computeAccountStatusCounts(accounts ?? [])
  const entriesPerWeek = computeEntriesPerWeek(entries ?? [])
  const firmPopularity = computeFirmPopularity(accounts ?? [], firms ?? [])

  const totalUsers = (profiles ?? []).length
  const totalAccounts = (accounts ?? []).length

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl tracking-[3px] text-white">REPORTS</h1>
        <p className="text-xs text-muted mt-1">{totalUsers} users · {totalAccounts} accounts</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 mb-6">
        <div className="card">
          <div className="stat-label mb-3">Plan Mix</div>
          <div className="flex items-end gap-6">
            <div>
              <div className="stat-value text-green">{planMix.pro}</div>
              <div className="stat-sub">Pro</div>
            </div>
            <div>
              <div className="stat-value text-dim">{planMix.free}</div>
              <div className="stat-sub">Free</div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="stat-label mb-3">Accounts</div>
          <div className="flex items-end gap-6">
            <div>
              <div className="stat-value text-green">{accountStatus.active}</div>
              <div className="stat-sub">Active</div>
            </div>
            <div>
              <div className="stat-value text-dim">{accountStatus.archived}</div>
              <div className="stat-sub">Archived</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 mb-6">
        <SignupsChart data={signups} />
        <EntriesPerWeekChart data={entriesPerWeek} />
      </div>

      <div className="card">
        <div className="stat-label mb-3">Firm Popularity</div>
        {firmPopularity.length === 0 ? (
          <p className="text-xs text-muted">No accounts yet.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-dim text-left border-b border-border">
                <th className="py-2 pr-3">Firm</th>
                <th className="py-2">Accounts</th>
              </tr>
            </thead>
            <tbody>
              {firmPopularity.map(row => (
                <tr key={row.firmId} className="border-b border-border/50">
                  <td className="py-2 pr-3 text-white">{row.firmName}</td>
                  <td className="py-2 text-muted">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
