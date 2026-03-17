'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    window.location.href = '/dashboard'
  }

  return (
    <div className='min-h-screen flex items-center justify-center px-4'>
      <div className='w-full max-w-sm'>
        <div className='text-center mb-8'>
          <h1 className='font-display text-4xl tracking-[4px] text-green'>PROPCOACH</h1>
          <p className='text-muted text-xs tracking-widest mt-2'>PROP TRADING ACCOUNT MANAGER</p>
        </div>
        <div className='card'>
          <h2 className='text-xs text-dim tracking-[3px] uppercase mb-6'>Sign In</h2>
          <form onSubmit={handleLogin} className='space-y-4'>
            <div>
              <label className='label'>Email</label>
              <input type='email' value={email} onChange={e => setEmail(e.target.value)} className='input' placeholder='you@example.com' required />
            </div>
            <div>
              <label className='label'>Password</label>
              <input type='password' value={password} onChange={e => setPassword(e.target.value)} className='input' placeholder='password' required />
            </div>
            {error && <p className='text-xs text-danger'>{error}</p>}
            <button type='submit' className='btn-primary' disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</button>
          </form>
          <p className='text-xs text-muted text-center mt-4'>No account? <Link href='/signup' className='text-green hover:underline'>Create one free</Link></p>
        </div>
      </div>
    </div>
  )
}