// app/api/admin/disclaimers/[id]/route.ts
// Disclaimers aren't effective-dated/historical like firm_rule_sizes — a
// direct in-place UPDATE is correct here, there's no prior state worth
// preserving. Still verifies the update actually affected a row rather
// than trusting a silent success — see 016_firm_rule_sizes_update_policy.sql
// for why that check matters.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCanEditRules } from '@/lib/admin-auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const auth = await requireCanEditRules(supabase)
  if (auth.error) return auth.error

  const formData = await req.formData()
  const label = String(formData.get('label') || '').trim()
  const body = String(formData.get('body') || '').trim()
  const sortOrder = Number(formData.get('sort_order') || 0)
  const isActive = formData.get('is_active') === 'on'

  if (!label || !body) {
    return NextResponse.json({ error: 'Label and body are required.' }, { status: 400 })
  }

  const { data: updated, error } = await supabase
    .from('disclaimers')
    .update({ label, body, sort_order: sortOrder, is_active: isActive, updated_at: new Date().toISOString(), updated_by: auth.user.id })
    .eq('id', id)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'Update affected 0 rows — the disclaimer may not exist, or check RLS UPDATE policy on disclaimers.' }, { status: 400 })
  }

  return NextResponse.redirect(new URL('/admin/disclaimers', req.url))
}
