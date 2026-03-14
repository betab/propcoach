// app/api/entries/[id]/delete/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get the entry to find the account_id for redirect
  const { data: entry } = await supabase
    .from('entries')
    .select('account_id, user_id')
    .eq('id', params.id)
    .single()

  if (!entry || entry.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await supabase.from('entries').delete().eq('id', params.id)

  // Redirect back to history page
  return NextResponse.redirect(new URL(`/account/${entry.account_id}/history`, req.url))
}
