// lib/supabase/admin.ts
// Service-role client — bypasses RLS and the column-write lockdown from
// migration 004 entirely. Server-only; never import this into a client
// component. Currently used only for role management (PR6), where the
// caller (an already-verified super_admin) needs to write profiles.role,
// a column PR7's security fix deliberately made unwritable by the normal
// authenticated-user client.
import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
