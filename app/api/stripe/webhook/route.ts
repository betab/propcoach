// app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })

export async function POST(req: NextRequest) {
  const body      = await req.text()
  const signature = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // A webhook call from Stripe carries no user session/cookies at all, so
  // the normal cookie-bound client (@/lib/supabase/server) runs every query
  // here as an unauthenticated request — RLS's "auth.uid() = id" row-owner
  // policy on profiles then matches zero rows, and every .update() below
  // silently succeeds with 0 rows changed. That's a real, previously-shipped
  // bug (flagged but deliberately deferred in
  // supabase/migrations/004_lock_down_profile_columns.sql's own comment):
  // plan/stripe_subscription_id never actually got written by checkout
  // completing or a subscription being cancelled/updated. Needs the
  // service-role client, which bypasses RLS entirely, same as the other
  // privileged server-to-server writes in this codebase (role management,
  // the rule-monitoring ingest route).
  const supabase = createAdminClient()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId  = session.metadata?.supabase_user_id
      if (userId && session.subscription) {
        await supabase.from('profiles').update({
          plan: 'pro',
          stripe_subscription_id: session.subscription as string,
        }).eq('id', userId)
      }
      break
    }

    case 'customer.subscription.deleted': {
      const sub      = event.data.object as Stripe.Subscription
      const customer = sub.customer as string
      await supabase.from('profiles').update({ plan: 'free', stripe_subscription_id: null })
        .eq('stripe_customer_id', customer)
      break
    }

    case 'customer.subscription.updated': {
      const sub    = event.data.object as Stripe.Subscription
      const active = sub.status === 'active' || sub.status === 'trialing'
      await supabase.from('profiles').update({ plan: active ? 'pro' : 'free' })
        .eq('stripe_customer_id', sub.customer as string)
      break
    }
  }

  return NextResponse.json({ received: true })
}
