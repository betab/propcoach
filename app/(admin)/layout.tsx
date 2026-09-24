// app/(admin)/layout.tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // This is the real gate — proxy.ts's check is best-effort UX only, same as
  // how app/(app)/layout.tsx (not proxy.ts) is the actual gate for /dashboard.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, display_name')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role === 'user') redirect('/dashboard')

  const isReadOnly   = profile.role === 'admin_readonly'
  const isSuperAdmin = profile.role === 'super_admin'

  return (
    <div className="min-h-screen">
      {/* Unmistakable "you are editing live financial rules" banner — the
          whole point of a visually distinct admin area (per milestone plan). */}
      <div className="bg-danger/15 border-b border-danger/40 text-danger text-center text-[10px] tracking-widest uppercase py-1.5">
        ⚠ Admin Mode {isReadOnly ? '— Read Only' : '— Changes Affect Live Accounts'}
      </div>
      <header className="bg-bg2 border-b border-amber/30 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-5">
          <Link href="/admin" className="font-display text-xl tracking-[3px] text-amber">
            PROPCOACH ADMIN
          </Link>
          <nav className="flex items-center gap-4 text-xs text-muted">
            <Link href="/admin" className="hover:text-amber transition-colors">Firms</Link>
            <Link href="/admin/proposals" className="hover:text-amber transition-colors">Proposals</Link>
            <Link href="/admin/disclaimers" className="hover:text-amber transition-colors">Disclaimers</Link>
            <Link href="/admin/reports" className="hover:text-amber transition-colors">Reports</Link>
            {isSuperAdmin && (
              <>
                <Link href="/admin/team" className="hover:text-amber transition-colors">Team</Link>
                <Link href="/admin/users" className="hover:text-amber transition-colors">Users</Link>
              </>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted hidden sm:block">
            {profile.display_name || user.email} · {profile.role.replace('_', ' ')}
          </span>
          <Link
            href="/dashboard"
            className="text-[10px] tracking-widest uppercase border border-border text-muted px-3 py-1.5 rounded hover:border-blue/40 transition-colors"
          >
            ← Back to App
          </Link>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
  )
}
