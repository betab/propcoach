// components/PerformanceHeader.tsx
// The "PROPCOACH//X" title-bar pattern — built for Performance Home, meant
// to be reused on other page headers later (e.g. "PROPCOACH//ACCOUNTS"),
// per the plan file's note on rolling this out app-wide as a follow-up.
// Parametrized so this instance doesn't hardcode Performance Home's own
// copy into what should be a generic pattern. Server component — the
// cursor blink is a pure CSS animation (app/globals.css), no client JS.
export default function PerformanceHeader({
  section,
  legend,
  showAddMetric = false,
}: {
  section:        string  // e.g. 'PERFORMANCE' -> renders "PROPCOACH//PERFORMANCE"
  legend?:        React.ReactNode
  showAddMetric?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between flex-wrap gap-3 pb-5 border-b border-border">
      <div className="font-display text-2xl tracking-[3px] text-white">
        PROPCOACH<span className="text-muted">//</span><span className="text-green">{section}</span>
        <span className="inline-block w-[11px] h-[22px] bg-green ml-2 align-middle cursor-blink" aria-hidden="true" />
      </div>
      <div className="flex items-center gap-3">
        {legend}
        {showAddMetric && (
          <span className="text-[10px] tracking-widest uppercase border border-border text-green px-4 py-1.5 rounded-full">
            + Add Metric
          </span>
        )}
      </div>
    </div>
  )
}
