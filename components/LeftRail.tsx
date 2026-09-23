// components/LeftRail.tsx
// Vertical HUD stat rail for Performance Home — scrollable when the tile
// count exceeds the fixed height, with a bottom fade so the cut-off is
// legible rather than an abrupt clip. Reuses the global thin scrollbar
// (app/globals.css) — no dedicated scrollbar styling needed here.
export interface StatTile {
  label: string
  value: string
  color?: string
}

export default function LeftRail({
  tiles,
  height = 512,
}: {
  tiles:   StatTile[]
  height?: number
}) {
  return (
    <div className="relative w-[172px] shrink-0">
      <div className="overflow-y-auto pr-1 pt-6" style={{ height }}>
        <div className="flex flex-col gap-3.5">
          {tiles.map((tile, i) => (
            <div key={i} className="bg-bg2 border border-border rounded-lg px-4 py-3">
              <div className="stat-label">{tile.label}</div>
              <div className="stat-value" style={tile.color ? { color: tile.color } : undefined}>
                {tile.value}
              </div>
            </div>
          ))}
          <div className="border border-dashed border-border rounded-lg px-4 py-3 text-center text-[10px] tracking-widest uppercase text-dim">
            + Add Metric
          </div>
        </div>
      </div>
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-1 h-10"
        style={{ background: 'linear-gradient(transparent, #080c11)' }}
      />
    </div>
  )
}
