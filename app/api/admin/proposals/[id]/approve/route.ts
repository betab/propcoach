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

  const { error } = await applyProposal(supabase, proposal as ProposalRow, effectiveFrom, auth.user.id)
  if (error) return NextResponse.json({ error }, { status: 400 })

  const { error: markError } = await supabase
    .from('firm_rule_change_proposals')
    .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: auth.user.id })
    .eq('id', id)
  if (markError) return NextResponse.json({ error: markError.message }, { status: 400 })

  return NextResponse.redirect(new URL('/admin/proposals', req.url))
}
