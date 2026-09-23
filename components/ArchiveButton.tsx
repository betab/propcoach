'use client'
// components/ArchiveButton.tsx
// Archives an account regardless of status (see app/api/accounts/[id]/archive/route.ts
// for why status no longer gates this). Now that it can hide a live active
// account, it needs a confirmation — but only a single confirm(), not
// DeleteUserButton.tsx's double-confirm: archiving is fully reversible via
// the Restore form on /dashboard/archived, unlike a permanent delete.
export default function ArchiveButton({
  accountId,
  label = '🗄 Archive',
  className = 'btn',
  title,
  confirmMessage = 'Archive this account? You can restore it anytime from Archived Accounts.',
}: {
  accountId:      string
  label?:         string
  className?:     string
  title?:         string
  confirmMessage?: string
}) {
  return (
    <form
      action={`/api/accounts/${accountId}/archive`}
      method="POST"
      onSubmit={e => { if (!confirm(confirmMessage)) e.preventDefault() }}
    >
      <input type="hidden" name="active" value="false" />
      <button type="submit" className={className} title={title}>{label}</button>
    </form>
  )
}
