'use client'
// app/(app)/settings/page.tsx
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AvatarUpload from '@/components/AvatarUpload'
import CancelAccountSection from '@/components/CancelAccountSection'
import PageHeader from '@/components/PageHeader'

export default function SettingsPage() {
  const [email,       setEmail]       = useState('')
  const [profile,     setProfile]     = useState<any>(null)
  const [displayName, setDisplayName] = useState('')
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [error,       setError]       = useState('')
  const supabase = createClient()
  const router   = useRouter()

  useEffect(() => {
    // Sequenced, not parallel: firing the profiles query at the same time
    // as getUser() let it race the browser client's session hydration from
    // cookies — a query that leaves auth.uid() unresolved server-side gets
    // RLS-filtered to zero rows, and .single() turns "zero rows" into a
    // 406 rather than an empty result. getUser() does a real round-trip
    // that forces the session to be valid before we ever ask for the
    // profile, and filtering explicitly by id (rather than relying solely
    // on RLS with no filter at all) means a real "no profile" case fails
    // clearly instead of however PostgREST happens to react to an
    // unscoped query.
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setEmail(user.email || '')
      supabase.from('profiles').select('*').eq('id', user.id).single().then(({ data, error: fetchError }) => {
        if (fetchError) { setError(fetchError.message); return }
        setProfile(data)
        setDisplayName(data?.display_name || '')
      })
    })
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    setError('')
    setSaved(false)

    // display_name is the one profile column an authenticated user can
    // write directly (see supabase/migrations/004_lock_down_profile_columns.sql
    // — role/plan/stripe_subscription_id are locked down to service-role/
    // webhook writes only), so this is a plain client-side update, same as
    // the read above — no API route needed.
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim() || null })
      .eq('id', profile.id)

    if (updateError) {
      setError(updateError.message)
    } else {
      setSaved(true)
      // The header (app/(app)/layout.tsx) is a server component that reads
      // display_name once per navigation — a client-side update here has
      // no way to reach it on its own. router.refresh() re-runs the server
      // components for the current route (no full reload, state here is
      // preserved), same pattern SignOutButton already uses.
      router.refresh()
    }
    setSaving(false)
  }

  const isPro   = profile?.plan === 'pro'
  const isAdmin = !!profile?.role && profile.role !== 'user'

  return (
    <div className="max-w-lg">
      <PageHeader section="SETTINGS" />

      {/* Profile */}
      <div className="card mb-4">
        <div className="stat-label mb-3">Profile</div>

        {profile && (
          <div className="mb-5">
            <AvatarUpload
              userId={profile.id}
              currentUrl={profile.avatar_url}
              displayName={displayName || email}
              onUploaded={url => {
                setProfile((p: any) => ({ ...p, avatar_url: url }))
                router.refresh() // same reason as handleSave — refresh the header's server-fetched avatar
              }}
            />
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="label">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={e => { setDisplayName(e.target.value); setSaved(false) }}
              className="input"
              placeholder="e.g. Brandon"
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="text" value={email} disabled className="input opacity-60 cursor-not-allowed" />
          </div>
          {profile?.role && profile.role !== 'user' && (
            <div className="text-xs text-muted">
              Role: <span className="text-amber">{profile.role.replace('_', ' ')}</span>
            </div>
          )}
          {error && (
            <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded p-3">{error}</div>
          )}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving || !profile}
              className="text-[10px] tracking-widest uppercase border border-green text-green px-4 py-2 rounded hover:bg-green/10 transition-colors font-mono disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            {saved && <span className="text-xs text-green">✓ Saved</span>}
          </div>
        </form>
      </div>

      {/* Plan summary — full billing management lives on its own page.
          An admin-tier role (see lib/admin-auth.ts) already gets unlimited
          accounts regardless of profiles.plan (migration 015's
          check_account_limit trigger, and dashboard/page.tsx's own isAdmin
          check) — this card used to only ever read profile.plan directly,
          so an admin whose real billing plan is still 'free' (never
          actually subscribed) saw a "Free · 1 account max" badge that
          flatly contradicted their real access. Shown as a distinct
          "Admin" badge rather than relabeled as "Pro" — that would claim a
          real subscription that doesn't exist, which matters once you
          reach Billing (Manage Billing requires a real stripe_customer_id). */}
      <div className="card">
        <div className="stat-label mb-3">Plan</div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="text-xs tracking-widest uppercase px-3 py-1.5 rounded border font-semibold"
              style={isPro
                ? { borderColor: '#00ff88', color: '#00ff88', background: 'rgba(0,255,136,0.1)' }
                : isAdmin
                ? { borderColor: '#ffaa00', color: '#ffaa00', background: 'rgba(255,170,0,0.1)' }
                : { borderColor: '#1a2a40', color: '#5a7a90' }
              }
            >
              {isPro ? '✓ Pro' : isAdmin ? '✓ Admin' : 'Free'}
            </div>
            <span className="text-xs text-muted">
              {isPro ? 'Unlimited accounts · All features'
                : isAdmin ? 'Unlimited accounts · All features (via admin role)'
                : '1 account max'}
            </span>
          </div>
          <Link
            href="/settings/billing"
            className="text-[10px] tracking-widest uppercase border border-border text-muted px-3 py-2 rounded hover:border-blue/40 transition-colors"
          >
            {isPro ? 'Manage Billing' : isAdmin ? 'Billing Details' : 'Upgrade'} →
          </Link>
        </div>
      </div>

      {/* Cancel My Account — hidden until profile has loaded, since its
          "not scheduled" state would otherwise flash briefly even if the
          account actually is scheduled (see settings/page.tsx's own
          sequenced-fetch comment above on why profile starts null). */}
      {profile && (
        <CancelAccountSection
          scheduledDeletionAt={profile.scheduled_deletion_at ?? null}
          onChange={scheduledDeletionAt =>
            setProfile((p: any) => ({ ...p, scheduled_deletion_at: scheduledDeletionAt }))
          }
        />
      )}
    </div>
  )
}
