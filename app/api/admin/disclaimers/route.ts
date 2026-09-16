// app/api/admin/disclaimers/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCanEditRules } from '@/lib/admin-auth'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const auth = await requireCanEditRules(supabase)
  if (auth.error) return auth.error

  const formData = await req.formData()
  const slug = String(formData.get('slug') || '').trim()
  const label = String(formData.get('label') || '').trim()
  const body = String(formData.get('body') || '').trim()
  const sortOrder = Number(formData.get('sort_order') || 0)

  if (!slug || !label || !body) {
    return NextResponse.json({ error: 'Slug, label, and body are required.' }, { status: 400 })
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: 'Slug must be lowercase letters, numbers, and hyphens only (it becomes a page anchor).' }, { status: 400 })
  }

  const { error } = await supabase.from('disclaimers').insert({
    slug, label, body, sort_order: sortOrder, updated_by: auth.user.id,
  })
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `A disclaimer with slug '${slug}' already exists.` }, { status: 400 })
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.redirect(new URL('/admin/disclaimers', req.url))
}
