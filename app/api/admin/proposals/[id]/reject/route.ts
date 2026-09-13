// app/api/admin/proposals/[id]/reject/route.ts
// Rejecting a proposal never touches firm_rule_sizes/versions/firms — it
// only records the decision, so nothing to compensate if this fails midway.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCanEditRules } from '@/lib/admin-auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const auth = await requireCanEditRules(supabase)
  if (auth.error) return auth.error

  const { data: proposal } = await supabase.from('firm_rule_change_proposals').select('status').eq('id', id).single()
  if (!proposal) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  if (proposal.status !== 'pending') {
    return NextResponse.json({ error: `Already ${proposal.status}.` }, { status: 400 })
  }

  const formData = await req.formData()
  const note = String(formData.get('review_note') || '').trim() || null

  const { error } = await supabase
    .from('firm_rule_change_proposals')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: auth.user.id, review_note: note })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.redirect(new URL('/admin/proposals', req.url))
}
