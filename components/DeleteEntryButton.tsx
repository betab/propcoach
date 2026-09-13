// components/DeleteEntryButton.tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function DeleteEntryButton({ entryId }: { entryId: string }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirm('Delete this entry?')) return
    setDeleting(true)
    const res = await fetch(`/api/entries/${entryId}/delete`, { method: 'POST' })
    if (res.ok) {
      router.refresh()
    } else {
      setDeleting(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      className="text-muted hover:text-danger transition-colors text-lg leading-none disabled:opacity-40"
    >
      ×
    </button>
  )
}
