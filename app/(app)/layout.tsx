// app/(app)/layout.tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import SignOutButton from '@/components/SignOutButton'
import Avatar from '@/components/Avatar'
import DisclaimerFooter from '@/components/DisclaimerFooter'
import { getActiveDisclaimers } from '@/lib/disclaimers'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, disclaimers] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name, plan, role, avatar_url')
      .eq('id', user.id)
      .single(),
    getActiveDisclaimers(supabase),
  ])

  const isAdmin = !!profile?.role && profile.role !== 'user'

  return (
    <div className="min-h-screen">
      <header className="bg-bg2 border-b border-border px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-5">
          <Link href="/dashboard" className="font-display text-xl tracking-[3px] text-green">
            PROPCOACH
          </Link>
          <nav className="flex items-center gap-3 sm:gap-4 text-xs text-muted">
            <Link href="/dashboard" className="hover:text-green transition-colors">Accounts</Link>
            {isAdmin && (
              <Link href="/admin" className="hover:text-amber transition-colors">Admin</Link>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {profile?.plan === 'free' && !isAdmin && (
            <Link
              href="/settings/billing"
              className="text-[10px] tracking-widest uppercase border border-amber/40 text-amber px-3 py-1.5 rounded hover:bg-amber/10 transition-colors"
            >
              Upgrade to Pro
            </Link>
          )}
          {/* Username (+ avatar) is the entry point into Settings — no
              separate "Settings" nav item needed. */}
          <Link
            href="/settings"
            className="flex items-center gap-2 text-xs text-muted hover:text-white transition-colors"
          >
            <Avatar url={profile?.avatar_url} name={profile?.display_name || user.email} size={26} />
            <span className="hidden sm:block">{profile?.display_name || user.email}</span>
          </Link>
          <SignOutButton />
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
      <DisclaimerFooter disclaimers={disclaimers} />
    </div>
  )
}
