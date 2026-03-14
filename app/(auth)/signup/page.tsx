'use client'
// app/(auth)/signup/page.tsx
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [name, setName]         = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { display_name: name } }
    })
    if (error) { setError(error.message); setLoading(false); return }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl tracking-[4px] text-green">PROPCOACH</h1>
          <p className="text-muted text-xs tracking-widest mt-2">PROP TRADING ACCOUNT MANAGER</p>
        </div>

        <div className="card">
          <h2 className="text-xs text-dim tracking-[3px] uppercase mb-6">Create Account</h2>
          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="label">Display Name</label>
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                className="input" placeholder="Your name" required
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="input" placeholder="you@example.com" required
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="input" placeholder="Min. 8 characters" minLength={8} required
              />
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Creating account…' : 'Get Started Free →'}
            </button>
          </form>
          <p className="text-xs text-muted text-center mt-4">
            Free plan includes 1 account.{' '}
            <Link href="/login" className="text-green hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
