// app/api/accounts/[id]/archive/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const active = formData.get('active')
  if (active !== 'true' && active !== 'false') {
    return NextResponse.json({ error: 'Invalid active value' }, { status: 400 })
  }

  const { data: account } = await supabase
    .from('accounts').select('id, status').eq('id', id).eq('user_id', user.id).single()
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Archiving (active -> inactive) is only ever offered once an account is
  // no longer active (breached/passed) — the UI only renders the Archive
  // button in that state (account/[id]/page.tsx). Enforced here too since
  // this is a plain form POST, not something RLS alone gates.
  if (active === 'false' && account.status === 'active') {
    return NextResponse.json({ error: 'Cannot archive an active account' }, { status: 400 })
  }

  await supabase.from('accounts').update({ is_active: active === 'true' }).eq('id', id)

  // Land wherever the account now actually shows: unarchiving puts it back
  // on the main dashboard, archiving puts it on the archived list.
  return NextResponse.redirect(new URL(active === 'true' ? '/dashboard' : '/dashboard/archived', req.url))
}
