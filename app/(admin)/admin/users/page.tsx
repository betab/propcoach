// app/(admin)/admin/users/page.tsx
// super_admin only — direct user-record support/correction tool, separate
// from app/(admin)/admin/team (role management) and the not-yet-built
// reporting dashboard (stats, bulk actions — a different, later milestone).
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ROLE_STYLE: Record<string, string> = {
  super_admin: 'border-green text-green',
  admin: 'border-amber text-amber',
  admin_readonly: 'border-blue text-blue',
  user: 'border-dim text-dim',
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: myProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!myProfile || myProfile.role !== 'super_admin') redirect('/admin')

  // profiles RLS only allows reading your own row, and profiles has no email
  // column at all (that lives on auth.users) — listing/searching every user
  // needs the service-role client either way. Safe here because the
  // super_admin check above already ran against the caller's own verified
  // session.
  const admin = createAdminClient()
  const [{ data: profiles }, { data: authUsers }, { data: accounts }] = await Promise.all([
    admin.from('profiles').select('id, display_name, role, plan, created_at').order('created_at', { ascending: false }),
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from('accounts').select('user_id'),
  ])

  const emailById = new Map((authUsers?.users || []).map(u => [u.id, u.email || '']))
  const accountCountById = new Map<string, number>()
  for (const a of accounts || []) {
    accountCountById.set(a.user_id, (accountCountById.get(a.user_id) || 0) + 1)
  }

  const needle = (q || '').trim().toLowerCase()
  const rows = (profiles || [])
    .map(p => ({ ...p, email: emailById.get(p.id) || '', accountCount: accountCountById.get(p.id) || 0 }))
    .filter(p => !needle || p.email.toLowerCase().includes(needle) || (p.display_name || '').toLowerCase().includes(needle))

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl tracking-[3px] text-white">USERS</h1>
        <p className="text-xs text-muted mt-1">
          Direct record editing — profile, plan, accounts, and entries. A support/correction tool, not the place for
          bulk stats or account resets (that's a separate, not-yet-built reporting dashboard).
        </p>
      </div>

      <form method="GET" className="mb-4 flex gap-2 max-w-sm">
        <input
          type="text"
          name="q"
          defaultValue={q || ''}
          className="input"
          placeholder="Search by email or name…"
        />
        <button type="submit" className="btn" style={{ width: 'auto', padding: '8px 16px' }}>
          Search
        </button>
      </form>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-dim text-[10px] uppercase tracking-widest text-left">
                <th className="pb-2 pr-4">Email</th>
                <th className="pb-2 pr-4">Name</th>
                <th className="pb-2 pr-4">Role</th>
                <th className="pb-2 pr-4">Plan</th>
                <th className="pb-2 pr-4">Accounts</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.id} className="border-t border-border/50">
                  <td className="py-3 pr-4 text-white">{p.email || '—'}</td>
                  <td className="py-3 pr-4 text-muted">{p.display_name || '—'}</td>
                  <td className="py-3 pr-4">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border normal-case ${ROLE_STYLE[p.role] || 'border-dim text-dim'}`}>
                      {p.role}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-muted">{p.plan}</td>
                  <td className="py-3 pr-4 text-muted">{p.accountCount}</td>
                  <td className="py-3">
                    <Link href={`/admin/users/${p.id}`} className="text-[10px] tracking-widest uppercase text-amber hover:underline">
                      Manage →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="text-xs text-dim text-center py-6">No users match &quot;{q}&quot;.</div>
        )}
      </div>
    </div>
  )
}
