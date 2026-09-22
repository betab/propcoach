'use client'
// components/DailyTargetSlider.tsx
// Adjusts an account's risk posture — scales both the Daily Target and Stop
// Trading If Down coaching cards together (see lib/firms/shared/coaching.ts,
// both computed server-side from account size/firm rules and this
// multiplier). Direct client-side Supabase write, same idiom as
// RulesEditor.tsx (a narrow, low-stakes self-write grant — see
// supabase/migrations/021_daily_target_multiplier.sql) — but unlike
// RulesEditor, the numbers this control changes are computed server-side in
// the parent page (buildCoaching() runs in account/[id]/page.tsx), so a
// successful save calls router.refresh() to recompute them, same pattern as
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
  consistencyBreachMultiplier,
}: {
  accountId:                     string
  initialValue:                  number
  // The multiplier value at which the raw target would first exceed the
  // live consistency ceiling (see getConsistencyBreachMultiplier in
  // lib/firms/shared/coaching.ts) — uncapped, so it can land outside the
  // slider's own 0.5x-2.0x range. null = no reachable breach to mark (no
  // active consistency rule yet, or no profit logged yet).
  consistencyBreachMultiplier?:  number | null
}) {
  const supabase = createClient()
  const router   = useRouter()

  const [value,   setValue]   = useState(initialValue)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  // Only mark a breach point that's actually reachable somewhere on the
  // visible track (<= MULTIPLIER_MAX) — a breach point past 2.0x means
  // nothing the slider can select would cross it, so there's nothing
  // useful to show. A breach point at/before MULTIPLIER_MIN clamps to 0%,
  // which correctly shades the entire track — the whole range is already
  // past it.
  const showBreach = consistencyBreachMultiplier != null && consistencyBreachMultiplier <= MULTIPLIER_MAX
  const breachPct  = showBreach
    ? Math.max(0, ((Math.min(consistencyBreachMultiplier!, MULTIPLIER_MAX) - MULTIPLIER_MIN) / (MULTIPLIER_MAX - MULTIPLIER_MIN)) * 100)
    : null

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
        <div className="text-[10px] tracking-widest uppercase text-dim">Risk Level — Target &amp; Stop</div>
        <div className="text-xs text-muted">
          {saving ? 'Saving…' : (
            <>
              <span className="text-white font-semibold">{value.toFixed(2)}×</span> — {zoneLabel(value)}
            </>
          )}
        </div>
      </div>
      <div className="relative h-5 flex items-center">
        {/* Breach shading — the portion of the track beyond the point where
            the raw target would exceed today's live consistency ceiling.
            A separate absolutely-positioned layer rather than styling the
            native track's own fill, since browsers render range-input fill
            differently and this needs to look the same everywhere. */}
        {breachPct != null && (
          <div
            className="absolute h-1.5 rounded-r bg-danger/25 pointer-events-none"
            style={{ left: `${breachPct}%`, right: 0 }}
          />
        )}
        <input
          type="range"
          min={MULTIPLIER_MIN}
          max={MULTIPLIER_MAX}
          step={MULTIPLIER_STEP}
          value={value}
          onChange={e => handleChange(parseFloat(e.target.value))}
          className="relative w-full accent-green"
          aria-label="Daily target risk multiplier"
        />
        {breachPct != null && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-danger pointer-events-none"
            style={{ left: `calc(${breachPct}% - 1px)` }}
            title={`Beyond ${consistencyBreachMultiplier!.toFixed(2)}×, your target would exceed today's consistency-safe ceiling`}
          />
        )}
      </div>
      <div className="flex justify-between text-[9px] text-dim mt-0.5 tracking-wide">
        <span>Conservative</span>
        <span>Steady</span>
        <span>Aggressive</span>
      </div>
      {breachPct != null && (
        <div className="text-[10px] text-danger/90 mt-1">
          ⚠ Past {consistencyBreachMultiplier!.toFixed(2)}× your target would exceed today's consistency-safe
          ceiling (auto-capped either way — see the Consistency card below for the exact number).
        </div>
      )}
      {error && (
        <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded p-2 mt-2">{error}</div>
      )}
    </div>
  )
}
