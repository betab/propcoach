// app/api/admin/firms/[firmId]/source-domains/route.ts
// Adds a hostname to a firm's source-domain allowlist — see migration
// 007_firm_source_domains.sql and app/api/cron/firm-source-fetch/route.ts,
// which is the only thing that actually reads this table at fetch time.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCanEditRules } from '@/lib/admin-auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ firmId: string }> }) {
  const { firmId } = await params
  const supabase = await createClient()
  const auth = await requireCanEditRules(supabase)
  if (auth.error) return auth.error

  const formData = await req.formData()
  // Store the bare hostname regardless of what the admin pasted in (a full
  // URL, a domain with a trailing slash, etc.) — the fetch route compares
  // against target.hostname, which never has a scheme or path.
  const raw = String(formData.get('domain') || '').trim()
  let domain = raw
  try {
    domain = raw.includes('://') ? new URL(raw).hostname : new URL(`https://${raw}`).hostname
  } catch {
    return NextResponse.json({ error: 'Not a valid domain.' }, { status: 400 })
  }
  if (!domain) return NextResponse.json({ error: 'Domain is required.' }, { status: 400 })

  const { error } = await supabase.from('firm_source_domains').insert({
    firm_id: firmId, domain, created_by: auth.user.id,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.redirect(new URL(`/admin/firms/${firmId}`, req.url))
}
