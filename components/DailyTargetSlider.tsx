'use client'
// components/DailyTargetSlider.tsx
// Adjusts an account's Daily Target coaching card up or down — the base
// target (see lib/firms/shared/coaching.ts) is computed server-side from
// account size and firm rules, this multiplier just scales it per the
// trader's own risk preference. Direct client-side Supabase write, same
// idiom as RulesEditor.tsx (a narrow, low-stakes self-write grant — see
// supabase/migrations/021_daily_target_multiplier.sql) — but unlike
// RulesEditor, the number this control changes is computed server-side in
// the parent page (buildCoaching() runs in account/[id]/page.tsx), so a
// successful save calls router.refresh() to recompute it, same pattern as
// settings/page.tsx's profile edits.
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const MULTIPLIER_MIN  = 0.5
const MULTIPLIER_MAX  = 2.0
const MULTIPLIER_STEP = 0.25
const SAVE_DEBOUNCE_MS = 400

function zoneLabel(v: number) {
  if (v <= 0.75) return 'Conservative'
  if (v <= 1.25) return 'Steady'
  return 'Aggressive'
}

export default function DailyTargetSlider({
  accountId,
  initialValue,
}: {
  accountId:    string
  initialValue: number
}) {
  const supabase = createClient()
  const router   = useRouter()

  const [value,   setValue]   = useState(initialValue)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  function handleChange(next: number) {
    setValue(next)
    setError('')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => commit(next), SAVE_DEBOUNCE_MS)
  }

  async function commit(next: number) {
    setSaving(true)
    const { error: updateError } = await supabase
      .from('accounts')
      .update({ daily_target_multiplier: next })
      .eq('id', accountId)

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }
    setSaving(false)
    router.refresh()
  }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[10px] tracking-widest uppercase text-dim">Daily Target Risk</div>
        <div className="text-xs text-muted">
          {saving ? 'Saving…' : (
            <>
              <span className="text-white font-semibold">{value.toFixed(2)}×</span> — {zoneLabel(value)}
            </>
          )}
        </div>
      </div>
      <input
        type="range"
        min={MULTIPLIER_MIN}
        max={MULTIPLIER_MAX}
        step={MULTIPLIER_STEP}
        value={value}
        onChange={e => handleChange(parseFloat(e.target.value))}
        className="w-full accent-green"
        aria-label="Daily target risk multiplier"
      />
      <div className="flex justify-between text-[9px] text-dim mt-0.5 tracking-wide">
        <span>Conservative</span>
        <span>Steady</span>
        <span>Aggressive</span>
      </div>
      {error && (
        <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded p-2 mt-2">{error}</div>
      )}
    </div>
  )
}
