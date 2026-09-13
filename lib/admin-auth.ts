// lib/admin-auth.ts
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Auth gate for admin mutation routes. Every route under app/api/admin/*
 * needs the same "logged in + at least full admin" check — unlike the
 * codebase's other API routes (each a one-off 401-if-no-user check), this
 * one also needs a profiles lookup, so it's worth sharing rather than
 * repeating six times.
 *
 * Returns { user } on success, or { error: <NextResponse> } to return
 * directly from the caller. Defense in depth alongside the can_edit_rules()
 * RLS policies (supabase/migrations/003_firm_rules_db.sql) — this gives a
 * clean 403/401 instead of a silent RLS rejection.
 */
export async function requireCanEditRules(supabase: SupabaseClient) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || (profile.role !== 'admin' && profile.role !== 'super_admin')) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { user }
}
