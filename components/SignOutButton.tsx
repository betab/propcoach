// components/SignOutButton.tsx
'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function SignOutButton() {
  const router = useRouter()

  async function handleSignOut() {
    // Note: No await here, per strict architecture rules for the browser client
    const supabase = createClient()
    
    const { error } = await supabase.auth.signOut()
    
    if (error) {
      console.error('Error signing out:', error.message)
      return
    }

    // Refresh the router to clear server component cache, then redirect
    router.refresh()
    router.push('/login')
  }

  return (
    <button 
      onClick={handleSignOut} 
      className="btn-ghost text-xs px-3 py-1.5 rounded transition-colors"
    >
      Sign Out
    </button>
  )
}