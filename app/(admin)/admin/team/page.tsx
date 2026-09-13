// app/(admin)/admin/team/page.tsx
// super_admin only — this codebase's role hierarchy lets admin_readonly and
// admin view the rest of /admin, but only super_admin may reach this page
// or change anyone's role (enforced again in the route, which is the real
// gate — this redirect is just so a non-super-admin doesn't see the page).
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ROLES = ['user', 'admin_readonly', 'admin', 'super_admin']

const ROLE_STYLE: Record<string, string> = {
  super_admin: 'border-green text-green',
  admin: 'border-amber text-amber',
  admin_readonly: 'border-blue text-blue',
  user: 'border-dim text-dim',
}

export default async function AdminTeamPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: myProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!myProfile || myProfile.role !== 'super_admin') redirect('/admin')

  // profiles RLS only allows reading your own row — listing everyone
  // requires the service-role client. Safe here because the super_admin
  // check above already ran against the caller's own verified session.
  const admin = createAdminClient()
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, display_name, role, created_at')
    .order('created_at', { ascending: true })

  return (
    <div>
      <h1 className="font-display text-3xl tracking-[3px] text-white mb-2">TEAM</h1>
      <p className="text-xs text-muted mb-6">
        Manage who has admin access. Only you (super_admin) can change roles.
      </p>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-dim text-[10px] uppercase tracking-widest text-left">
                <th className="pb-2 pr-4">User</th>
                <th className="pb-2 pr-4">Current Role</th>
                <th className="pb-2">Change To</th>
              </tr>
            </thead>
            <tbody>
              {(profiles || []).map(p => (
                <tr key={p.id} className="border-t border-border/50">
                  <td className="py-3 pr-4 text-white">{p.display_name || p.id.slice(0, 8)}</td>
                  <td className="py-3 pr-4">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border normal-case ${ROLE_STYLE[p.role] || 'border-dim text-dim'}`}>
                      {p.role}
                    </span>
                  </td>
                  <td className="py-3">
                    <form action={`/api/admin/team/${p.id}/role`} method="POST" className="flex gap-2 items-center">
                      <select name="role" defaultValue={p.role} className="input" style={{ padding: '4px 8px', width: 'auto' }}>
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <button type="submit" className="btn" style={{ padding: '4px 12px' }}>
                        Save
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
