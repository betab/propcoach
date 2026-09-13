// app/api/admin/team/[userId]/role/route.ts
// super_admin only — the sole route that can change profiles.role. Uses the
// service-role client because migration 004 correctly made role unwritable
// by any normal authenticated user, super_admin included; the privilege
// check here (not RLS) is what makes this safe.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const VALID_ROLES = ['user', 'admin_readonly', 'admin', 'super_admin']

export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: myProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!myProfile || myProfile.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden — only super_admin can change roles.' }, { status: 403 })
  }

  const formData = await req.formData()
  const role = String(formData.get('role') || '')
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ role }).eq('id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.redirect(new URL('/admin/team', req.url))
}
