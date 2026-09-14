// app/api/admin/proposals/[id]/approve/route.ts
// Turns a pending proposal into real rule changes — see lib/admin-proposals.ts
// for the write logic and the payload contract each proposal_type expects.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCanEditRules } from '@/lib/admin-auth'
import { applyProposal, type ProposalRow } from '@/lib/admin-proposals'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const auth = await requireCanEditRules(supabase)
  if (auth.error) return auth.error

  const { data: proposal } = await supabase.from('firm_rule_change_proposals').select('*').eq('id', id).single()
  if (!proposal) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  if (proposal.status !== 'pending') {
    return NextResponse.json({ error: `Already ${proposal.status} — cannot approve again.` }, { status: 400 })
  }

  const formData = await req.formData()
  const effectiveFromRaw = String(formData.get('effective_from') || '').trim()
  const effectiveFrom = effectiveFromRaw || proposal.proposed_effective_from || new Date().toISOString().slice(0, 10)

  // Atomically claim this proposal before applying it — the .eq('status',
  // 'pending') here is a compare-and-swap: only the first of two racing
  // requests (a double-click, a retried request after a slow response)
  // flips status and proceeds. A loser gets 0 rows back and bails cleanly,
  // instead of both reaching applyProposal and colliding on e.g. a
  // duplicate firms.id insert — which is what happened before this fix,
  // surfaced as a raw "duplicate key value violates unique constraint
  // firms_pkey" instead of a clear "someone else already approved this."
  const { data: claimed, error: claimError } = await supabase
    .from('firm_rule_change_proposals')
    .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: auth.user.id })
    .eq('id', id)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle()
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 400 })
  if (!claimed) {
    return NextResponse.json(
      { error: 'This proposal was already reviewed by another request (approved or rejected) — refresh the page.' },
      { status: 409 }
    )
  }

  const { error } = await applyProposal(supabase, claimed as ProposalRow, effectiveFrom, auth.user.id)
  if (error) {
    // The status flip already claimed this proposal, but the actual data
    // write failed — revert to pending rather than leave it stuck
    // "approved" with nothing behind it, so it can be retried or rejected.
    await supabase
      .from('firm_rule_change_proposals')
      .update({ status: 'pending', reviewed_at: null, reviewed_by: null })
      .eq('id', id)
    return NextResponse.json({ error }, { status: 400 })
  }

  return NextResponse.redirect(new URL('/admin/proposals', req.url))
}
