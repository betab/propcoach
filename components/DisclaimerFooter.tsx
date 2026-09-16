// components/DisclaimerFooter.tsx
import type { Disclaimer } from '@/lib/disclaimers'

// Renders nothing when there are no active disclaimers — this box only
// exists once there's something to say. Each entry's id is what an
// asterisk elsewhere on the page (e.g. account/[id]/page.tsx's Payout stat)
// links to via #disclaimer-<slug>.
export default function DisclaimerFooter({ disclaimers }: { disclaimers: Disclaimer[] }) {
  if (disclaimers.length === 0) return null

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-8">
      <div className="border-t border-border pt-4 space-y-2">
        {disclaimers.map(d => (
          <p key={d.id} id={`disclaimer-${d.slug}`} className="text-[11px] text-dim leading-relaxed scroll-mt-20">
            <span className="text-muted">*</span> <span className="text-muted">{d.label}:</span> {d.body}
          </p>
        ))}
      </div>
    </div>
  )
}
