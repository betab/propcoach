import { createServerClient } from '@supabase/ssr'
import { headers } from 'next/headers'

function parseCookies(cookieHeader: string) {
  if (!cookieHeader) return []
  return cookieHeader.split(';').map(cookie => {
    const [name, ...rest] = cookie.trim().split('=')
    return { name: name.trim(), value: rest.join('=').trim() }
  }).filter(c => c.name)
}

export async function createClient() {
  const headerStore = await headers()
  const cookieHeader = headerStore.get('cookie') || ''

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return parseCookies(cookieHeader)
        },
        setAll() {
          // Server components cannot set cookies — handled by proxy.ts
        },
      },
    }
  )
}