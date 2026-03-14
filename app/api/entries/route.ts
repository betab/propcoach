// app/api/entries/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { account_id, date, closing_balance, contracts, notes } = body

  if (!account_id || !date || closing_balance == null) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Verify account belongs to user
  const { data: account } = await supabase
    .from('accounts').select('id, size, user_id').eq('id', account_id).single()
  if (!account || account.user_id !== user.id) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  // Compute P&L from previous closing balance
  const { data: prevEntry } = await supabase
    .from('entries')
    .select('closing_balance')
    .eq('account_id', account_id)
    .lt('date', date)
    .order('date', { ascending: false })
    .limit(1)
    .single()

  const prevBalance = prevEntry?.closing_balance ?? account.size
  const pnl = closing_balance - prevBalance

  const { data, error } = await supabase.from('entries').insert({
    account_id,
    user_id:  user.id,
    date,
    closing_balance,
    pnl,
    contracts: contracts || 0,
    notes:     notes || '',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
