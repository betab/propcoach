// app/api/admin/firms/[firmId]/source-domains/[domainId]/delete/route.ts
// Removes a hostname from a firm's source-domain allowlist.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCanEditRules } from '@/lib/admin-auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ firmId: string; domainId: string }> }) {
  const { firmId, domainId } = await params
  const supabase = await createClient()
  const auth = await requireCanEditRules(supabase)
  if (auth.error) return auth.error

  const { error } = await supabase.from('firm_source_domains').delete().eq('id', domainId).eq('firm_id', firmId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.redirect(new URL(`/admin/firms/${firmId}`, req.url))
}
