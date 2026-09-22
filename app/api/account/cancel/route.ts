// app/api/account/cancel/route.ts
// Self-service "Cancel My Account" — the user's own account, always. Auth
// is the plain per-request pattern (getUser(), same as
// app/api/entries/[id]/delete/route.ts), never the admin/requireSuperAdmin
// pattern, since this can only ever act on the caller's own id.
//
// Order of operations matters: cancel Stripe FIRST, and only schedule
// deletion if that succeeds. Never end up "deleted but still billed" —
// see supabase/migrations/020_account_deletion.sql for why
// scheduled_deletion_at is a service-role-only write even though this
// route's own auth is the normal user client.
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeScheduledDeletionAt } from '@/lib/account-deletion'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, stripe_subscription_id, scheduled_deletion_at')
    .eq('id', user.id)
    .single()
  if (!profile) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })

  // Losing the only account able to grant/revoke admin roles (only
  // super_admin can do this — see lib/admin-auth.ts) with no in-app
  // recovery path is the one case worth blocking here. A plain admin/
  // admin_readonly, or a super_admin when others exist, can self-cancel
  // like anyone else.
  if (profile.role === 'super_admin') {
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'super_admin')
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'You are the only super_admin. Promote another admin on the Team page first, or ask them to remove your account.' },
        { status: 403 }
      )
    }
  }

  if (profile.scheduled_deletion_at) {
    return NextResponse.json({ error: 'Account is already scheduled for deletion.' }, { status: 409 })
  }

  // Branch on stripe_subscription_id, not profiles.plan — a past_due/
  // unpaid subscription can leave plan='free' (customer.subscription.
  // updated sets plan from status) while stripe_subscription_id is still
  // populated (only customer.subscription.deleted nulls it). Branching on
  // plan could skip cancelling a real, still-active subscription.
  if (profile.stripe_subscription_id) {
    try {
      await stripe.subscriptions.update(profile.stripe_subscription_id, { cancel_at_period_end: true })
    } catch (e) {
      return NextResponse.json(
        { error: `Could not cancel billing: ${e instanceof Error ? e.message : 'Stripe error'}` },
        { status: 502 }
      )
    }
  }

  const scheduledDeletionAt = computeScheduledDeletionAt()
  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ scheduled_deletion_at: scheduledDeletionAt })
    .eq('id', user.id)

  if (error) {
    // Billing cancellation (if any) already went through at this point —
    // surface clearly rather than silently leaving "cancelled but not
    // scheduled."
    return NextResponse.json(
      { error: `Billing was cancelled, but scheduling deletion failed: ${error.message}. Please contact support.` },
      { status: 500 }
    )
  }

  return NextResponse.json({ scheduledDeletionAt })
}
