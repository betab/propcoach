'use client'
// app/(app)/settings/billing/page.tsx
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function BillingPage() {
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const supabase = createClient()
  const searchParams = useSearchParams()
  const justUpgraded = searchParams.get('success') === 'true'

  useEffect(() => {
    // See settings/page.tsx for why this waits on getUser() first and
    // filters explicitly by id instead of relying solely on RLS with no
    // filter — firing an RLS-scoped query in parallel with getUser() can
    // race the browser client's session hydration and come back 406.
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('*').eq('id', user.id).single().then(({ data }) => setProfile(data))
    })
  }, [])

  async function handleUpgrade(interval: 'monthly' | 'annual') {
    setLoading(true)
    setError('')
    const priceId = interval === 'monthly'
      ? process.env.NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID
      : process.env.NEXT_PUBLIC_STRIPE_PRO_ANNUAL_PRICE_ID

    const res  = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId }),
    })
    const data = await res.json()
    if (data.url) window.location.href = data.url
    else { setError(data.error || 'Something went wrong.'); setLoading(false) }
  }

  // Opens Stripe's hosted customer portal — cancel, swap plans, update card,
  // view invoices. The webhook (app/api/stripe/webhook/route.ts) is what
  // actually reflects any change made there back into profiles.plan; this
  // route only starts the portal session.
  async function handleManageBilling() {
    setLoading(true)
    setError('')
    const res = await fetch('/api/stripe/portal', { method: 'POST' })
    const data = await res.json()
    if (data.url) window.location.href = data.url
    else { setError(data.error || 'Something went wrong.'); setLoading(false) }
  }

  const isPro   = profile?.plan === 'pro'
  const isAdmin = !!profile?.role && profile.role !== 'user'

  return (
    <div className="max-w-lg">
      <div className="text-xs text-dim tracking-widest mb-1">
        <Link href="/settings" className="hover:text-green transition-colors">SETTINGS</Link>
        <span className="mx-2">›</span>
        <span>BILLING</span>
      </div>
      <h1 className="font-display text-3xl tracking-[3px] text-white mb-6">BILLING</h1>

      {justUpgraded && (
        <div className="text-xs text-green bg-green/10 border border-green/30 rounded p-3 mb-4">
          ✓ You're on Pro — unlimited accounts and every firm are unlocked now.
        </div>
      )}

      <div className="card mb-4">
        <div className="stat-label mb-3">Current Plan</div>
        <div className="flex items-center gap-3 mb-4">
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

        {error && (
          <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded p-3 mb-4">{error}</div>
        )}

        {isPro ? (
          <div>
            <p className="text-xs text-muted mb-3">
              Manage your subscription — update your card, view invoices, or cancel — through Stripe's secure
              billing portal.
            </p>
            <button
              onClick={handleManageBilling}
              disabled={loading}
              className="text-[10px] tracking-widest uppercase border border-blue text-blue px-4 py-2 rounded hover:bg-blue/10 transition-colors font-mono"
            >
              {loading ? 'Redirecting…' : 'Manage Billing →'}
            </button>
          </div>
        ) : (
          <div>
            {isAdmin && (
              // No real Stripe customer exists for an admin who hasn't
              // actually subscribed — the portal button above requires
              // stripe_customer_id and would 400 ("No billing account
              // found for this user yet.") if shown here instead. Full
              // access is already granted by the admin role itself
              // (migration 015's check_account_limit trigger), no
              // subscription needed — this is informational only, the
              // upgrade cards below still work if they want a real one too.
              <p className="text-xs text-muted mb-4">
                Your admin role already grants unlimited accounts and every feature — no subscription needed.
                Upgrading below is optional (e.g. to test the paid flow); your admin access stays either way.
              </p>
            )}
            <div className="text-xs text-dim tracking-widest uppercase mb-3">Upgrade to Pro</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-bg2 border border-border rounded p-4">
                <div className="text-xs text-muted mb-1 tracking-widest uppercase">Monthly</div>
                <div className="font-display text-2xl text-white tracking-wide mb-1">$12<span className="text-sm text-muted">/mo</span></div>
                <ul className="text-xs text-muted space-y-1 mb-3">
                  <li>✓ Unlimited accounts</li>
                  <li>✓ All prop firms</li>
                  <li>✓ CSV export</li>
                </ul>
                <button
                  onClick={() => handleUpgrade('monthly')}
                  disabled={loading}
                  className="w-full text-[10px] tracking-widest uppercase border border-green text-green py-2 rounded hover:bg-green/10 transition-colors font-mono"
                >
                  {loading ? 'Redirecting…' : 'Upgrade Monthly'}
                </button>
              </div>
              <div className="bg-bg2 border border-green/30 rounded p-4 relative">
                <div className="absolute -top-2 left-3 text-[9px] tracking-widest uppercase bg-amber text-bg px-2 py-0.5 rounded font-semibold">
                  Best Value
                </div>
                <div className="text-xs text-muted mb-1 tracking-widest uppercase">Annual</div>
                <div className="font-display text-2xl text-white tracking-wide mb-1">$99<span className="text-sm text-muted">/yr</span></div>
                <div className="text-[10px] text-green mb-2">Save $45/year</div>
                <ul className="text-xs text-muted space-y-1 mb-3">
                  <li>✓ Everything in monthly</li>
                  <li>✓ Priority support</li>
                </ul>
                <button
                  onClick={() => handleUpgrade('annual')}
                  disabled={loading}
                  className="w-full text-[10px] tracking-widest uppercase bg-green text-bg py-2 rounded hover:bg-green/80 transition-colors font-mono font-semibold"
                >
                  {loading ? 'Redirecting…' : 'Upgrade Annual'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
