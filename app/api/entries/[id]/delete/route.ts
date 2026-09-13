// app/api/entries/[id]/delete/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get the entry to confirm ownership
  const { data: entry } = await supabase
    .from('entries')
    .select('account_id, user_id')
    .eq('id', id)
    .single()

  if (!entry || entry.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await supabase.from('entries').delete().eq('id', id)

  return NextResponse.json({ success: true })
}
