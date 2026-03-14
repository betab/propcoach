// app/api/accounts/[id]/payout/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: account } = await supabase
    .from('accounts').select('*').eq('id', params.id).eq('user_id', user.id).single()
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Increment payout count and record payout
  const [, payoutResult] = await Promise.all([
    supabase.from('accounts').update({ payout_count: account.payout_count + 1 }).eq('id', params.id),
    supabase.from('payouts').insert({ account_id: params.id, user_id: user.id, amount: null }),
  ])

  return NextResponse.redirect(new URL(`/account/${params.id}`, req.url))
}
