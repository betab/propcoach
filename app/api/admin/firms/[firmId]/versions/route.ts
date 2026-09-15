// app/api/admin/firms/[firmId]/versions/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCanEditRules } from '@/lib/admin-auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ firmId: string }> }) {
  const { firmId } = await params
  const supabase = await createClient()
  const auth = await requireCanEditRules(supabase)
  if (auth.error) return auth.error

  const formData = await req.formData()
  const versionKey = String(formData.get('version_key') || '').trim()
  const versionLabel = String(formData.get('version_label') || '').trim()
  const versionGroupRaw = String(formData.get('version_group') || '').trim()
  const versionGroup = versionGroupRaw === '' ? null : versionGroupRaw
  const isCurrent = formData.get('is_current') === 'on'

  if (!versionKey || !versionLabel) {
    return NextResponse.json({ error: 'Version key and label are required.' }, { status: 400 })
  }

  const { error } = await supabase.from('firm_rule_versions').insert({
    firm_id: firmId, version_key: versionKey, version_label: versionLabel, version_group: versionGroup, is_current: isCurrent,
    created_by: auth.user.id,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.redirect(new URL(`/admin/firms/${firmId}`, req.url))
}
