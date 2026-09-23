// app/api/accounts/[id]/payout/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: account } = await supabase
    .from('accounts').select('*').eq('id', id).eq('user_id', user.id).single()
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Amount is optional — a trader recording the payout quickly without the
  // exact figure yet shouldn't be blocked. Anything that isn't a valid
  // non-negative number (blank, non-numeric, negative) is stored as null,
  // same as before this field existed. Number('') is 0, not NaN, so a
  // blank/whitespace-only field is checked explicitly rather than left to
  // fall through Number() — otherwise leaving the field empty would
  // silently record a misleading $0.00 payout instead of "not recorded."
  const formData = await req.formData()
  const amountInput = formData.get('amount')
  const amountTrimmed = typeof amountInput === 'string' ? amountInput.trim() : ''
  const amountNum = amountTrimmed === '' ? NaN : Number(amountTrimmed)
  const amount = Number.isFinite(amountNum) && amountNum >= 0 ? amountNum : null

  // Increment payout count and record payout
  const [, payoutResult] = await Promise.all([
    supabase.from('accounts').update({ payout_count: account.payout_count + 1 }).eq('id', id),
    supabase.from('payouts').insert({ account_id: id, user_id: user.id, amount }),
  ])

  return NextResponse.redirect(new URL(`/account/${id}`, req.url))
}
