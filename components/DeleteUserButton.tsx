// components/DeleteUserButton.tsx
// Admin-only — deletes a user (auth.users row) entirely. Cascades through
// profiles, accounts, entries, and payouts automatically via the existing
// FK constraints (see supabase/migrations/001_initial.sql) — one call, no
// separate cleanup needed. Irreversible, so this asks twice: a plain
// confirm(), then requires typing the account's own email back before the
// delete actually fires.
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DeleteUserButton({ userId, email }: { userId: string; email: string }) {
  const router = useRouter()
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function handleDelete() {
    if (confirmText !== email) return
    if (!confirm(`Permanently delete ${email} and all of their accounts, entries, and payouts? This cannot be undone.`)) return

    setDeleting(true)
    setError('')
    const res = await fetch(`/api/admin/users/${userId}/delete`, { method: 'POST' })
    if (res.ok) {
      router.push('/admin/users')
      router.refresh()
    } else {
      const body = await res.json().catch(() => ({}))
      setError(body.error || 'Delete failed.')
      setDeleting(false)
    }
  }

  return (
    <div>
      <label className="label">
        Type <span className="text-white font-mono">{email}</span> to confirm
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          className="input"
          placeholder={email}
        />
        <button
          type="button"
          onClick={handleDelete}
          disabled={confirmText !== email || deleting}
          className="btn border-danger text-danger hover:bg-danger/10 disabled:opacity-30"
          style={{ width: 'auto', padding: '8px 16px' }}
        >
          {deleting ? 'Deleting…' : 'Delete User'}
        </button>
      </div>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  )
}
