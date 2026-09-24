// components/ResetAccountButton.tsx
// super_admin only — wipes an account's entries/payouts back to a clean
// slate, keeps the account shell. Same two-layer confirm shape as
// DeleteUserButton (type-to-confirm + native confirm()) even though this
// is less severe than a full delete — there's still no undo once the
// entries are gone, and it's destructive to a trader's real trading
// history, so it gets the same weight.
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ResetAccountButton({
  userId,
  accountId,
  accountLabel,
}: {
  userId: string
  accountId: string
  accountLabel: string
}) {
  const router = useRouter()
  const [confirmText, setConfirmText] = useState('')
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState('')

  async function handleReset() {
    if (confirmText !== 'RESET') return
    if (!confirm(`Wipe all entries and payouts for ${accountLabel}? The account itself (firm/size/config) is kept, but its trading history cannot be recovered afterward.`)) return

    setResetting(true)
    setError('')
    const res = await fetch(`/api/admin/users/${userId}/accounts/${accountId}/reset`, { method: 'POST' })
    const body = await res.json().catch(() => ({}))
    if (res.ok) {
      router.refresh()
      setConfirmText('')
    } else {
      setError(body.error || 'Reset failed.')
    }
    setResetting(false)
  }

  return (
    <div>
      <label className="label">
        Type <span className="text-white font-mono">RESET</span> to confirm
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          className="input"
          placeholder="RESET"
        />
        <button
          type="button"
          onClick={handleReset}
          disabled={confirmText !== 'RESET' || resetting}
          className="btn border-amber text-amber hover:bg-amber/10 disabled:opacity-30"
          style={{ width: 'auto', padding: '8px 16px' }}
        >
          {resetting ? 'Resetting…' : 'Reset Account'}
        </button>
      </div>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  )
}
