// components/PageHeader.tsx
// The "PROPCOACH//X" title-bar pattern (blinking cursor, same colors
// throughout) — built for Performance Home (as PerformanceHeader.tsx),
// this is that pattern generalized so every app page can share it. Server
// component — the cursor blink is a pure CSS animation (app/globals.css),
// no client JS. Admin pages deliberately don't use this — they keep their
// own amber "Admin Mode" chrome so editing live financial rule numbers
// stays visually unmistakable from normal app use (see CLAUDE.md).
export default function PageHeader({
  breadcrumb,
  section,
  badges,
  subtitle,
  actions,
  showAddMetric = false,
}: {
  breadcrumb?:    React.ReactNode
  section:        React.ReactNode  // usually a string, e.g. 'ACCOUNTS' -> "PROPCOACH//ACCOUNTS"; can be dynamic (an account nickname, etc.)
  badges?:        React.ReactNode  // rendered inline after the cursor — status/archived badges, etc.
  subtitle?:      React.ReactNode
  actions?:       React.ReactNode
  showAddMetric?: boolean
}) {
  return (
    <div className="flex items-start justify-between flex-wrap gap-3 pb-5 mb-6 border-b border-border">
      <div>
        {breadcrumb && <div className="text-xs text-dim tracking-widest mb-1">{breadcrumb}</div>}
        <div className="flex items-center flex-wrap gap-3">
          <div className="font-display text-2xl tracking-[3px] text-white">
            PROPCOACH<span className="text-muted">//</span><span className="text-green">{section}</span>
            <span className="inline-block w-[11px] h-[22px] bg-green ml-2 align-middle cursor-blink" aria-hidden="true" />
          </div>
          {badges}
        </div>
        {subtitle && <div className="text-xs text-muted mt-1.5">{subtitle}</div>}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        {actions}
        {showAddMetric && (
          <span className="text-[10px] tracking-widest uppercase border border-border bg-bg2 text-green px-4 py-1.5 rounded-full">
            + Add Metric
          </span>
        )}
      </div>
    </div>
  )
}
