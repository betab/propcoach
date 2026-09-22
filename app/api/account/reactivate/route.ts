// app/api/account/reactivate/route.ts
// Undo for POST /api/account/cancel. Clears scheduled_deletion_at first —
// the higher-stakes half, saving the account — via the service-role
// client, always. Un-cancelling Stripe (resuming auto-renewal) is
// best-effort after that: if it fails, the account is already saved, so
// this reports a warning rather than failing the whole reactivation — the
// existing billing portal (app/api/stripe/portal) is the fallback
// correction path.
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_subscription_id, scheduled_deletion_at')
    .eq('id', user.id)
    .single()
  if (!profile?.scheduled_deletion_at) {
    return NextResponse.json({ error: 'Account is not scheduled for deletion.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ scheduled_deletion_at: null })
    .eq('id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let stripeWarning: string | null = null
  if (profile.stripe_subscription_id) {
    try {
      await stripe.subscriptions.update(profile.stripe_subscription_id, { cancel_at_period_end: false })
    } catch (e) {
      stripeWarning = `Your account was restored, but we couldn't resume automatic billing renewal (${
        e instanceof Error ? e.message : 'Stripe error'
      }). Please check Settings → Billing.`
    }
  }

  return NextResponse.json({ reactivated: true, stripeWarning })
}
