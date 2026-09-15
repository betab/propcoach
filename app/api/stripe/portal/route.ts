// app/api/stripe/portal/route.ts
// Opens Stripe's hosted customer portal for the authenticated user's own
// Stripe customer — lets them update their card, view invoices, switch
// plans, or cancel without a custom UI for any of it. Mirrors the checkout
// route's auth/customer-lookup shape; unlike checkout, there's no "create a
// customer" fallback here — a portal session requires an existing customer,
// and every Pro user already has one (checkout created it before they could
// have become Pro at all).
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('stripe_customer_id').eq('id', user.id).single()

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: 'No billing account found for this user yet.' }, { status: 400 })
  }

  const session = await stripe.billingPortal.sessions.create({
    customer:   profile.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
  })

  return NextResponse.json({ url: session.url })
}
