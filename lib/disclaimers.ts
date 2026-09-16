// lib/disclaimers.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export interface Disclaimer {
  id: string
  slug: string
  label: string
  body: string
}

/** Active disclaimers, in display order — for the shared footer box every app page renders. */
export async function getActiveDisclaimers(supabase: SupabaseClient): Promise<Disclaimer[]> {
  const { data } = await supabase
    .from('disclaimers')
    .select('id, slug, label, body')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  return data || []
}
