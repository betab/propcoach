// app/api/admin/firms/[firmId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCanEditRules } from '@/lib/admin-auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ firmId: string }> }) {
  const { firmId } = await params
  const supabase = await createClient()
  const auth = await requireCanEditRules(supabase)
  if (auth.error) return auth.error

  const formData = await req.formData()
  const name = String(formData.get('name') || '').trim()
  const logoUrl = String(formData.get('logo_url') || '').trim()
  const isActive = formData.get('is_active') === 'on'
  const comingSoon = formData.get('coming_soon') === 'on'

  if (!name) {
    return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('firms')
    .update({ name, logo_url: logoUrl || null, is_active: isActive, coming_soon: comingSoon })
    .eq('id', firmId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.redirect(new URL(`/admin/firms/${firmId}`, req.url))
}
