'use client'
// components/RulesEditor.tsx
// One reusable "reminders to myself" card — used for the global list
// (profiles.trading_rules, shown on the dashboard and every account page)
// and the optional per-account list (accounts.rules). Plain newline-
// separated text: view mode renders each non-blank line as a bulleted
// reminder, edit mode is just a textarea. Saves via a direct client-side
// update — both columns are in the narrow self-write grant added alongside
// them (see supabase/migrations/013_rules.sql), same pattern as
// settings/page.tsx's display name.
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function RulesEditor({
  title,
  table,
  rowId,
  initialValue,
  placeholder,
  emptyHint,
}: {
  title: string
  table: 'profiles' | 'accounts'
  rowId: string
  initialValue: string | null
  placeholder: string
  emptyHint: string
}) {
  const supabase = createClient()
  const column = table === 'profiles' ? 'trading_rules' : 'rules'

  const [value, setValue] = useState(initialValue || '')
  const [draft, setDraft] = useState(initialValue || '')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const lines = value.split('\n').map(l => l.trim()).filter(Boolean)

  function startEditing() {
    setDraft(value)
    setError('')
    setEditing(true)
  }

  function cancelEditing() {
    setDraft(value)
    setError('')
    setEditing(false)
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    const { error: updateError } = await supabase
      .from(table)
      .update({ [column]: draft.trim() || null })
      .eq('id', rowId)

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }
    setValue(draft)
    setEditing(false)
    setSaving(false)
  }

  return (
    <div className="card mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="stat-label">{title}</div>
        {!editing && (
          <button
            type="button"
            onClick={startEditing}
            className="text-[10px] tracking-widest uppercase text-blue hover:underline"
          >
            ✏️ Edit
          </button>
        )}
      </div>

      {editing ? (
        <div>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            className="input"
            rows={4}
            placeholder={placeholder}
          />
          <div className="text-[10px] text-dim mt-1">One rule per line.</div>
          {error && (
            <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded p-2 mt-2">{error}</div>
          )}
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="text-[10px] tracking-widest uppercase border border-green text-green px-3 py-1.5 rounded hover:bg-green/10 transition-colors font-mono disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={cancelEditing}
              disabled={saving}
              className="btn-ghost text-xs px-3 py-1.5 rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : lines.length > 0 ? (
        <ul className="space-y-1.5">
          {lines.map((line, i) => (
            <li key={i} className="text-sm text-muted flex items-start gap-2">
              <span className="text-green mt-0.5 shrink-0">•</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-xs text-dim">{emptyHint}</div>
      )}
    </div>
  )
}
