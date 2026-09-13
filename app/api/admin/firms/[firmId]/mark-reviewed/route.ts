// app/api/admin/firms/[firmId]/mark-reviewed/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCanEditRules } from '@/lib/admin-auth'

// The monthly-reminder ack — no research, just marks that a human looked at
// this firm's published rules and confirmed they still match what's stored.
export async function POST(req: NextRequest, { params }: { params: Promise<{ firmId: string }> }) {
  const { firmId } = await params
  const supabase = await createClient()
  const auth = await requireCanEditRules(supabase)
  if (auth.error) return auth.error

  const { error } = await supabase
    .from('firms')
    .update({ rules_last_verified_at: new Date().toISOString(), rules_last_verified_by: auth.user.id })
    .eq('id', firmId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.redirect(new URL(`/admin/firms/${firmId}`, req.url))
}
