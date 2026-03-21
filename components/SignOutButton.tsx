\"use client\"
import { createClient } from \"@/lib/supabase/client\"
import { useRouter } from \"next/navigation\"

export default function SignOutButton() {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push(\"/login\")
  }

  return (
    <button onClick={handleSignOut} className=\"btn text-xs\">
      Sign Out
    </button>
  )
}
