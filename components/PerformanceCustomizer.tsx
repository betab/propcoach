'use client'
// components/PerformanceCustomizer.tsx
// Owns Performance Home's customizable-layout state (rail tile order, detail
// panel order, the "+ Add Metric" drawer) and persists it to
// profiles.performance_layout — a direct debounced client-side write, same
// low-stakes self-write idiom as DailyTargetSlider.tsx. Unlike that slider,
// nothing server-computed depends on the order itself (every possible
// metric's value is already pre-computed server-side and handed down as
// `railContent`/`detailContent`), so a successful save doesn't need
// router.refresh() — reordering is purely a client-side concern once the
// data exists.
//
// Renders PageHeader itself (a plain, server-safe component with no
// server-only logic — same reasoning that lets it be imported from any of
// the 'use client' pages already using it) so the header's "+ Add Metric"
// pill and the rail's own dashed tile can share one drawer's open state
// with the rail and detail grid beneath them.
import { useEffect, useRef, useState } from 'react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { createClient } from '@/lib/supabase/client'
import PageHeader from '@/components/PageHeader'
import { METRIC_BY_ID, METRIC_REGISTRY, type MetricId } from '@/lib/metric-registry'
import type { StatTile } from '@/lib/performance'

const SAVE_DEBOUNCE_MS = 400
const RAIL_HEIGHT = 512

// A 2×2 dot-grid grip icon — inline SVG rather than a Unicode glyph
// (Braille-pattern chars render as tofu boxes in this app's fonts). Light
// grey (muted token) and only 4 dots — 6 in a taller 2×3 grid ran tall
// enough to overlap a 2-line-wrapped tile label (e.g. "Payouts to Date").
function GripIcon({ color = '#5a7a90' }: { color?: string }) {
  return (
    <svg width="8" height="10" viewBox="0 0 8 10" style={{ cursor: 'grab', flexShrink: 0 }} aria-hidden="true">
      {[2, 8].map(y => (
        <g key={y}>
          <circle cx="2" cy={y} r="1.5" fill={color} />
          <circle cx="6" cy={y} r="1.5" fill={color} />
        </g>
      ))}
    </svg>
  )
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Remove ${label}`}
      className="absolute top-2 right-2 text-dim hover:text-danger transition-colors text-xs leading-none"
    >
      ×
    </button>
  )
}

function SortableRailTile({ id, tile, onRemove }: { id: MetricId; tile: StatTile; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 10 : undefined }}
      className="relative bg-bg2 border border-border rounded-lg pl-2 pr-6 py-3 flex items-start gap-2"
    >
      <span {...attributes} {...listeners}><GripIcon /></span>
      <div className="flex-1 min-w-0">
        <div className="stat-label">{tile.label}</div>
        <div className="stat-value" style={tile.color ? { color: tile.color } : undefined}>{tile.value}</div>
      </div>
      <RemoveButton onClick={onRemove} label={tile.label} />
    </div>
  )
}

function SortableDetailCard({ id, node, onRemove }: { id: MetricId; node: React.ReactNode; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const label = METRIC_BY_ID.get(id)?.label ?? id
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 10 : undefined }}
      className="relative"
    >
      <span {...attributes} {...listeners} className="absolute top-3 left-3 z-10"><GripIcon /></span>
      <RemoveButton onClick={onRemove} label={label} />
      {node}
    </div>
  )
}

function MetricDrawer({
  open, onClose, available, onAdd,
}: {
  open:      boolean
  onClose:   () => void
  available: { rail: MetricId[]; detail: MetricId[] }
  onAdd:     (id: MetricId, category: 'rail' | 'detail') => void
}) {
  if (!open) return null

  const railDefs   = available.rail.map(id => METRIC_BY_ID.get(id)!).filter(Boolean)
  const detailDefs = available.detail.map(id => METRIC_BY_ID.get(id)!).filter(Boolean)

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} aria-hidden="true" />
      <div className="fixed top-0 right-0 h-full w-full sm:w-[420px] bg-bg2 border-l border-border shadow-2xl z-50 overflow-y-auto p-7">
        <div className="flex items-center justify-between mb-1.5">
          <div className="font-display text-xl tracking-[3px] text-white">ADD METRIC</div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-7 h-7 border border-border rounded flex items-center justify-center text-muted hover:text-white transition-colors">×</button>
        </div>
        <p className="text-xs text-muted mb-7 leading-relaxed">
          Pick what shows up on your Performance Home. Rail tiles are compact numbers in the HUD rail; Signal panels are the charts below the orbital view. Drag anything already added to reorder it.
        </p>

        <div className="text-[9px] tracking-widest uppercase text-dim mb-3 pb-2 border-b border-border">HUD Rail Tiles</div>
        <div className="flex flex-col gap-2.5 mb-8">
          {railDefs.length === 0 ? (
            <div className="text-xs text-dim">Everything&apos;s already on your rail.</div>
          ) : railDefs.map(def => (
            <div key={def.id} className="bg-bg3 border border-border rounded-lg px-4 py-3 flex items-center gap-3">
              <span className="w-1.5 self-stretch rounded-full flex-shrink-0" style={{ background: def.color }} />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-white mb-0.5">{def.label}</div>
                <div className="text-[10px] text-muted leading-snug">{def.description}</div>
              </div>
              <button
                type="button"
                onClick={() => onAdd(def.id, 'rail')}
                className="text-[10px] tracking-widest uppercase border border-green text-green px-3 py-1.5 rounded-full hover:bg-green/10 transition-colors whitespace-nowrap flex-shrink-0"
              >
                + Add
              </button>
            </div>
          ))}
        </div>

        <div className="text-[9px] tracking-widest uppercase text-dim mb-3 pb-2 border-b border-border">Signal Detail Panels</div>
        <div className="flex flex-col gap-2.5">
          {detailDefs.length === 0 ? (
            <div className="text-xs text-dim">Everything&apos;s already in your Signal Detail row.</div>
          ) : detailDefs.map(def => (
            <div key={def.id} className="bg-bg3 border border-border rounded-lg px-4 py-3 flex items-center gap-3">
              <span className="w-1.5 self-stretch rounded-full flex-shrink-0" style={{ background: def.color }} />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-white mb-0.5">{def.label}</div>
                <div className="text-[10px] text-muted leading-snug">{def.description}</div>
              </div>
              <button
                type="button"
                onClick={() => onAdd(def.id, 'detail')}
                className="text-[10px] tracking-widest uppercase border border-green text-green px-3 py-1.5 rounded-full hover:bg-green/10 transition-colors whitespace-nowrap flex-shrink-0"
              >
                + Add
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

export default function PerformanceCustomizer({
  userId,
  initialRailOrder,
  initialDetailOrder,
  railContent,
  detailContent,
  heroSlot,
  legendSlot,
}: {
  userId:              string
  initialRailOrder:    MetricId[]
  initialDetailOrder:  MetricId[]
  railContent:         Partial<Record<MetricId, StatTile>>
  detailContent:       Partial<Record<MetricId, React.ReactNode>>
  heroSlot:            React.ReactNode
  legendSlot:          React.ReactNode
}) {
  const supabase = createClient()
  const [railOrder, setRailOrder]     = useState<MetricId[]>(initialRailOrder)
  const [detailOrder, setDetailOrder] = useState<MetricId[]>(initialDetailOrder)
  const [drawerOpen, setDrawerOpen]   = useState(false)

  const [saveError, setSaveError] = useState('')
  const isFirstRender = useRef(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  useEffect(() => {
    // Skip the write on mount — railOrder/detailOrder already reflect
    // whatever's in the DB (or the registry defaults, if never customized).
    // Only a real interaction (drag, add, remove) should ever write.
    if (isFirstRender.current) { isFirstRender.current = false; return }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const { error } = await supabase
        .from('profiles')
        .update({ performance_layout: { rail: railOrder, detail: detailOrder } })
        .eq('id', userId)
      // Layout state already lives in this component either way — a failed
      // save just means it won't persist across a reload, so this is a
      // visible-but-non-blocking notice, not a rollback.
      setSaveError(error ? "Couldn't save your layout — it'll reset next time you load this page." : '')
    }, SAVE_DEBOUNCE_MS)
  }, [railOrder, detailOrder, supabase, userId])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  function handleRailDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    setRailOrder(order => {
      const oldIndex = order.indexOf(active.id as MetricId)
      const newIndex = order.indexOf(over.id as MetricId)
      return arrayMove(order, oldIndex, newIndex)
    })
  }

  function handleDetailDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    setDetailOrder(order => {
      const oldIndex = order.indexOf(active.id as MetricId)
      const newIndex = order.indexOf(over.id as MetricId)
      return arrayMove(order, oldIndex, newIndex)
    })
  }

  function addMetric(id: MetricId, category: 'rail' | 'detail') {
    if (category === 'rail') setRailOrder(order => order.includes(id) ? order : [...order, id])
    else setDetailOrder(order => order.includes(id) ? order : [...order, id])
  }

  const availableRail   = METRIC_REGISTRY.filter(m => m.category === 'rail' && !railOrder.includes(m.id)).map(m => m.id)
  const availableDetail = METRIC_REGISTRY.filter(m => m.category === 'detail' && !detailOrder.includes(m.id)).map(m => m.id)

  const railTiles   = railOrder.filter(id => railContent[id])
  const detailTiles = detailOrder.filter(id => detailContent[id])

  return (
    <div>
      <PageHeader
        section="PERFORMANCE"
        actions={
          <>
            {legendSlot}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="text-[10px] tracking-widest uppercase border border-border bg-bg2 text-green px-4 py-1.5 rounded-full hover:bg-green/10 transition-colors"
            >
              + Add Metric
            </button>
          </>
        }
      />

      {saveError && (
        <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded p-2 mb-4">{saveError}</div>
      )}

      <div className="flex gap-5 flex-wrap lg:flex-nowrap">
        <div className="relative w-[172px] shrink-0">
          <DndContext id="rail-dnd" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleRailDragEnd}>
            <div className="overflow-y-auto pr-1 pt-6" style={{ height: RAIL_HEIGHT }}>
              <SortableContext items={railTiles} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-3.5">
                  {railTiles.length === 0 && (
                    <div className="text-[10px] text-dim text-center py-4">No rail tiles yet.</div>
                  )}
                  {railTiles.map(id => (
                    <SortableRailTile key={id} id={id} tile={railContent[id]!} onRemove={() => setRailOrder(o => o.filter(x => x !== id))} />
                  ))}
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(true)}
                    className="border border-dashed border-border rounded-lg px-4 py-3 text-center text-[10px] tracking-widest uppercase text-dim hover:text-green hover:border-green/40 transition-colors"
                  >
                    + Add Metric
                  </button>
                </div>
              </SortableContext>
            </div>
          </DndContext>
          <div
            className="pointer-events-none absolute bottom-0 left-0 right-1 h-10"
            style={{ background: 'linear-gradient(transparent, #080c11)' }}
          />
        </div>

        <div className="flex-1 min-w-0">{heroSlot}</div>
      </div>

      <div className="mt-4">
        <div className="text-[10px] text-dim tracking-[3px] uppercase pt-4 mb-4 border-t border-border">The Signal — Detail</div>
        <DndContext id="detail-dnd" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDetailDragEnd}>
          <SortableContext items={detailTiles} strategy={rectSortingStrategy}>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {detailTiles.length === 0 && (
                <div className="text-xs text-dim col-span-full text-center py-8">No Signal Detail panels yet — click + Add Metric.</div>
              )}
              {detailTiles.map(id => (
                <SortableDetailCard key={id} id={id} node={detailContent[id]} onRemove={() => setDetailOrder(o => o.filter(x => x !== id))} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <MetricDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        available={{ rail: availableRail, detail: availableDetail }}
        onAdd={addMetric}
      />
    </div>
  )
}
