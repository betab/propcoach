'use client'
// app/(app)/settings/page.tsx
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function SettingsPage() {
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('profiles').select('*').single().then(({ data }) => setProfile(data))
  }, [])

  async function handleUpgrade(interval: 'monthly' | 'annual') {
    setLoading(true)
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
    setLoading(false)
  }

  return (
    <div className="max-w-lg">
      <h1 className="font-display text-3xl tracking-[3px] text-white mb-6">SETTINGS</h1>

      {/* Plan status */}
      <div className="card mb-4">
        <div className="stat-label mb-3">Current Plan</div>
        <div className="flex items-center gap-3 mb-4">
          <div
            className="text-xs tracking-widest uppercase px-3 py-1.5 rounded border font-semibold"
            style={profile?.plan === 'pro'
              ? { borderColor: '#00ff88', color: '#00ff88', background: 'rgba(0,255,136,0.1)' }
              : { borderColor: '#1a2a40', color: '#5a7a90' }
            }
          >
            {profile?.plan === 'pro' ? '✓ Pro' : 'Free'}
          </div>
          <span className="text-xs text-muted">
            {profile?.plan === 'pro' ? 'Unlimited accounts · All features' : '1 account max'}
          </span>
        </div>

        {profile?.plan !== 'pro' && (
          <div>
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

      {/* Profile */}
      <div className="card">
        <div className="stat-label mb-3">Account</div>
        <div className="text-xs text-muted space-y-1">
          <div>Display name: <span className="text-white">{profile?.display_name || '—'}</span></div>
          <div>Plan: <span className="text-white">{profile?.plan || 'free'}</span></div>
        </div>
      </div>
    </div>
  )
}
