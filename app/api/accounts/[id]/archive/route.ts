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
    .from('accounts').select('id').eq('id', id).eq('user_id', user.id).single()
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Archiving is allowed regardless of status. Originally restricted to
  // breached/passed accounts, but 'passed' doesn't mean "done" the way
  // 'breached' does — a funded account can keep earning payouts
  // indefinitely, so status shouldn't gate whether the trader can retire
  // it. The client-side confirm() in ArchiveButton.tsx is the guard
  // against accidentally hiding a still-active account, not this route.
  await supabase.from('accounts').update({ is_active: active === 'true' }).eq('id', id)

  // Land wherever the account now actually shows: unarchiving puts it back
  // on the main dashboard, archiving puts it on the archived list.
  return NextResponse.redirect(new URL(active === 'true' ? '/dashboard' : '/dashboard/archived', req.url))
}
