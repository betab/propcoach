// app/api/admin/firms/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCanEditRules } from '@/lib/admin-auth'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const auth = await requireCanEditRules(supabase)
  if (auth.error) return auth.error

  const formData = await req.formData()
  const id = String(formData.get('id') || '').trim().toLowerCase()
  const name = String(formData.get('name') || '').trim()
  const logoUrl = String(formData.get('logo_url') || '').trim()
  const isActive = formData.get('is_active') === 'on'
  const comingSoon = formData.get('coming_soon') === 'on'

  if (!id || !name) {
    return NextResponse.json({ error: 'Firm id and name are required.' }, { status: 400 })
  }
  if (!/^[a-z0-9_-]+$/.test(id)) {
    return NextResponse.json({ error: 'Firm id may only contain lowercase letters, numbers, - and _.' }, { status: 400 })
  }

  const { error } = await supabase.from('firms').insert({
    id, name, logo_url: logoUrl || null, is_active: isActive, coming_soon: comingSoon,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.redirect(new URL(`/admin/firms/${id}`, req.url))
}
