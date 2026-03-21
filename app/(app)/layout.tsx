// app/(app)/layout.tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, plan')
    .eq('id', user.id)
    .single()

  return (
    <div className="min-h-screen">
      <header className="bg-bg2 border-b border-border px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <Link href="/dashboard" className="font-display text-xl tracking-[3px] text-green">
          PROPCOACH
        </Link>
        <div className="flex items-center gap-4">
          {profile?.plan === 'free' && (
            <Link
              href="/settings/billing"
              className="text-[10px] tracking-widest uppercase border border-amber/40 text-amber px-3 py-1.5 rounded hover:bg-amber/10 transition-colors"
            >
              Upgrade to Pro
            </Link>
          )}
          <span className="text-xs text-muted hidden sm:block">
            {profile?.display_name || user.email}
          </span>
          <form action="/api/auth/signout" method="POST">
            <button className="btn text-xs">Sign Out</button>
          </form>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
  )
}
