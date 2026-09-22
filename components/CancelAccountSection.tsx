// components/CancelAccountSection.tsx
// Self-service account cancellation — Settings page only (see
// app/api/account/{cancel,reactivate}/route.ts for the actual logic).
// Two states: before scheduling (type CANCEL + a native confirm(), same
// two-layer gate as components/DeleteUserButton.tsx but scoped to self —
// "CANCEL" rather than re-typing an email, since this is the user acting
// on themselves, not an admin confirming someone else's identity) and
// after scheduling (persistent "scheduled for X, Undo" state).
'use client'

import { useState } from 'react'

export default function CancelAccountSection({
  scheduledDeletionAt,
  onChange,
}: {
  scheduledDeletionAt: string | null
  onChange: (scheduledDeletionAt: string | null) => void
}) {
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')

  async function handleCancel() {
    if (confirmText !== 'CANCEL') return
    if (
      !confirm(
        'This will cancel your billing subscription at the end of your current period and permanently delete all your accounts, entries, and payouts after a 14-day grace period. Continue?'
      )
    ) return

    setLoading(true)
    setError('')
    const res = await fetch('/api/account/cancel', { method: 'POST' })
    const body = await res.json().catch(() => ({}))
    if (res.ok) {
      onChange(body.scheduledDeletionAt)
      setConfirmText('')
    } else {
      setError(body.error || 'Failed to cancel account.')
    }
    setLoading(false)
  }

  async function handleReactivate() {
    setLoading(true)
    setError('')
    setWarning('')
    const res = await fetch('/api/account/reactivate', { method: 'POST' })
    const body = await res.json().catch(() => ({}))
    if (res.ok) {
      onChange(null)
      if (body.stripeWarning) setWarning(body.stripeWarning)
    } else {
      setError(body.error || 'Failed to reactivate account.')
    }
    setLoading(false)
  }

  if (scheduledDeletionAt) {
    const formatted = new Date(scheduledDeletionAt).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    })
    return (
      <div className="card mt-4 border-danger/40">
        <div className="stat-label mb-2 text-danger">Account Scheduled for Deletion</div>
        <p className="text-xs text-muted mb-3">
          Your account and all its data will be permanently deleted on <span className="text-white">{formatted}</span>.
        </p>
        {warning && <p className="text-xs text-amber mb-3">{warning}</p>}
        {error && <p className="text-xs text-danger mb-3">{error}</p>}
        <button
          type="button"
          onClick={handleReactivate}
          disabled={loading}
          className="btn border-green text-green hover:bg-green/10 disabled:opacity-50"
          style={{ width: 'auto', padding: '8px 16px' }}
        >
          {loading ? 'Restoring…' : 'Undo — Keep My Account'}
        </button>
      </div>
    )
  }

  return (
    <div className="card mt-4 border-danger/40">
      <div className="stat-label mb-2 text-danger">Danger Zone</div>
      <p className="text-xs text-muted mb-3">
        Cancel your account — this cancels your billing subscription at the end of your current period and
        permanently deletes all your accounts, entries, and payouts after a 14-day grace period. This cannot be
        undone after that.
      </p>
      <label className="label">Type CANCEL to confirm</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          className="input"
          placeholder="CANCEL"
        />
        <button
          type="button"
          onClick={handleCancel}
          disabled={confirmText !== 'CANCEL' || loading}
          className="btn border-danger text-danger hover:bg-danger/10 disabled:opacity-30"
          style={{ width: 'auto', padding: '8px 16px' }}
        >
          {loading ? 'Cancelling…' : 'Cancel My Account'}
        </button>
      </div>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  )
}
