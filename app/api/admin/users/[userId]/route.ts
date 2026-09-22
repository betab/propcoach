// app/api/admin/users/[userId]/route.ts
// super_admin only — edits profile fields a user can't self-edit (plan;
// display_name they could already self-edit, included here for one
// convenient support form). Uses the service-role client: migration 004
// deliberately made plan unwritable by the normal authenticated-user
// client, same reasoning as role.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/admin-auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const supabase = await createClient()
  const auth = await requireSuperAdmin(supabase)
  if (auth.error) return auth.error

  const formData = await req.formData()
  const displayName = String(formData.get('display_name') || '').trim()
  const plan = String(formData.get('plan') || '')
  if (plan !== 'free' && plan !== 'pro') {
    return NextResponse.json({ error: 'Invalid plan.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ display_name: displayName || null, plan })
    .eq('id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.redirect(new URL(`/admin/users/${userId}`, req.url))
}
