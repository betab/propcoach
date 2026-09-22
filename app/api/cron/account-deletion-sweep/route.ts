// app/api/cron/account-deletion-sweep/route.ts
// Hard-deletes every profile whose grace period has elapsed (see
// supabase/migrations/020_account_deletion.sql and
// app/api/account/cancel/route.ts). Invoked by an externally-scheduled
// Routine (Claude Code Remote), same auth/invocation shape as
// firm-rules-ingest/firm-source-fetch — not Vercel Cron (no vercel.json
// exists in this repo). Once daily is plenty given a 14-day grace period.
//
// Auth: a shared secret, not a user session — this is called by a
// Routine, not a logged-in admin. Requires the
// ACCOUNT_DELETION_SWEEP_SECRET env var (not yet set anywhere — a manual
// Vercel step, same as SUPABASE_SERVICE_ROLE_KEY / FIRM_RULES_INGEST_SECRET
// were for earlier pipelines).
//
// Before hard-deleting a row with a still-attached stripe_subscription_id,
// this cancels that Stripe subscription IMMEDIATELY (not cancel_at_period_end,
// which the cancel route already set) — the 14-day grace period only
// bounds how long the user keeps the app, not how long Stripe's own
// billing period runs (an annual subscription cancelled on day 1 has
// ~351 days left). Without this, a user's account could be permanently
// deleted while Stripe keeps charging their card for a service they can
// no longer log into — the exact "billed AND deleted" failure the whole
// feature is designed to avoid, just at the other end of the pipeline.
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export async function POST(req: NextRequest) {
  const secret = process.env.ACCOUNT_DELETION_SWEEP_SECRET
  if (!secret) {
    // Fail closed — an unset secret must never silently accept every request.
    return NextResponse.json({ error: 'Sweep endpoint is not configured.' }, { status: 503 })
  }
  const authHeader = req.headers.get('authorization') || ''
  if (authHeader !== `Bearer ${secret}`) return unauthorized()

  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  const { data: rows, error: queryError } = await admin
    .from('profiles')
    .select('id, stripe_subscription_id')
    .not('scheduled_deletion_at', 'is', null)
    .lte('scheduled_deletion_at', nowIso)

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 })
  }

  const deletedIds: string[] = []
  const stripeCancelFailures: { id: string; error: string }[] = []
  const deleteFailures: { id: string; error: string }[] = []

  for (const row of rows || []) {
    if (row.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(row.stripe_subscription_id)
      } catch (e) {
        // Log and proceed — the data-deletion promise still gets honored
        // even if Stripe hiccups; a lingering subscription here is a
        // support/monitoring follow-up, not a reason to leave the
        // account (and its data) around indefinitely.
        stripeCancelFailures.push({ id: row.id, error: e instanceof Error ? e.message : 'Stripe error' })
      }
    }

    const { error } = await admin.auth.admin.deleteUser(row.id)
    if (error) {
      deleteFailures.push({ id: row.id, error: error.message })
    } else {
      deletedIds.push(row.id)
    }
  }

  return NextResponse.json({
    swept: (rows || []).length,
    deletedIds,
    stripeCancelFailures,
    deleteFailures,
  })
}
