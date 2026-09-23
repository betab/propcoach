// components/OrbitalHero.tsx
// The orbital-command hero for Performance Home. Node positions are pure
// trig — no client JS needed, this stays a server component. The radar
// sweep and pulse glow are CSS-only animations (app/globals.css).
import Link from 'next/link'
import type { OrbGroup, PortfolioSummary, ArchiveSummary } from '@/lib/performance'
import type { FirmMeta } from '@/lib/firms/types'

const WIDTH  = 900
const HEIGHT = 520
const CENTER_X = WIDTH / 2
const CENTER_Y = HEIGHT / 2
const CORE_R  = 85
const INNER_R = 150
const OUTER_R = 230
const INNER_CAPACITY = 6

type NodeStatus = 'payout' | 'locking' | 'warning' | 'breach' | 'steady' | 'archive'

const STATUS_COLOR: Record<NodeStatus, string> = {
  payout:  '#00ff88',
  locking: '#7aa3d4',
  warning: '#ffaa00',
  breach:  '#ff4444',
  steady:  '#5a7a90',
  archive: '#3a6a90',
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * (Math.PI / 180)
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function layout(count: number): { x: number; y: number }[] {
  if (count === 0) return []
  if (count <= 4) {
    return Array.from({ length: count }, (_, i) =>
      polar(CENTER_X, CENTER_Y, INNER_R, (360 / count) * i)
    )
  }
  const innerCount = Math.min(INNER_CAPACITY, Math.ceil(count / 2))
  const outerCount  = count - innerCount
  const inner = Array.from({ length: innerCount }, (_, i) =>
    polar(CENTER_X, CENTER_Y, INNER_R, (360 / innerCount) * i)
  )
  const outer = Array.from({ length: outerCount }, (_, i) =>
    polar(CENTER_X, CENTER_Y, OUTER_R, (360 / outerCount) * i + 180 / outerCount)
  )
  return [...inner, ...outer]
}

function groupStatus(group: OrbGroup): NodeStatus {
  if (group.kind === 'individual') {
    const { account, metrics } = group.entry
    if (account.status === 'breached') return 'breach'
    if (!metrics.consistencyOk) return 'warning'
    if (metrics.payoutEligible) return 'payout'
    if (metrics.mllLockProgress >= 90) return 'locking'
    return 'steady'
  }
  return 'steady'
}

function groupLabel(group: OrbGroup, firmById: Map<string, FirmMeta>): string {
  if (group.kind === 'individual') {
    const { account } = group.entry
    return account.nickname || `${(account.size / 1000).toFixed(0)}K`
  }
  if (group.kind === 'consolidated') {
    const firmName = firmById.get(group.firmId)?.name ?? group.firmId.toUpperCase()
    return `${firmName} ${(group.size / 1000).toFixed(0)}K ×${group.members.length}`
  }
  return `+${group.members.length} other active`
}

function groupHref(group: OrbGroup): string | null {
  return group.kind === 'individual' ? `/account/${group.entry.account.id}` : null
}

function groupRingPct(group: OrbGroup): number {
  if (group.kind === 'individual') return group.entry.metrics.mllLockProgress
  const members = group.members
  return members.reduce((s, m) => s + m.metrics.mllLockProgress, 0) / members.length
}

function ringGradient(pct: number, color: string) {
  const clamped = Math.max(0, Math.min(100, pct))
  return `conic-gradient(${color} ${clamped}%, #1a2a40 ${clamped}%)`
}

export default function OrbitalHero({
  groups,
  portfolioSummary,
  archiveSummary,
  firms,
}: {
  groups:           OrbGroup[]
  portfolioSummary: PortfolioSummary
  archiveSummary:   ArchiveSummary
  firms:            FirmMeta[]
}) {
  const firmById = new Map(firms.map(f => [f.id, f]))
  const hasArchive = archiveSummary.total > 0
  const slotCount = groups.length + (hasArchive ? 1 : 0)
  const positions = layout(slotCount)

  const pnlColor = portfolioSummary.lifetimePnl >= 0 ? 'var(--green)' : 'var(--red)'
  const pnlSign  = portfolioSummary.lifetimePnl >= 0 ? '+' : '−'

  return (
    <div className="relative bg-black rounded-xl border border-border overflow-hidden" style={{ width: '100%', maxWidth: WIDTH, height: HEIGHT, margin: '0 auto' }}>
      {/* radar sweep */}
      <div
        className="orbital-spin absolute pointer-events-none"
        style={{
          left: CENTER_X - OUTER_R, top: CENTER_Y - OUTER_R,
          width: OUTER_R * 2, height: OUTER_R * 2, borderRadius: '50%',
          background: 'conic-gradient(from 0deg, rgba(0,255,136,0.16), transparent 35%)',
        }}
      />

      {/* ring guides */}
      <div
        className="absolute rounded-full border border-border/60 pointer-events-none"
        style={{ left: CENTER_X - INNER_R, top: CENTER_Y - INNER_R, width: INNER_R * 2, height: INNER_R * 2 }}
      />
      <div
        className="absolute rounded-full border border-border/40 pointer-events-none"
        style={{ left: CENTER_X - OUTER_R, top: CENTER_Y - OUTER_R, width: OUTER_R * 2, height: OUTER_R * 2 }}
      />

      {/* portfolio P&L core */}
      <div
        className="absolute flex flex-col items-center justify-center rounded-full border-2"
        style={{
          left: CENTER_X - CORE_R, top: CENTER_Y - CORE_R, width: CORE_R * 2, height: CORE_R * 2,
          background: 'radial-gradient(circle, #0d1420 0%, #080c11 80%)',
          borderColor: pnlColor,
        }}
      >
        <div className="text-[9px] tracking-[2px] uppercase text-dim">Lifetime P&L</div>
        <div className="font-display text-xl" style={{ color: pnlColor }}>
          {pnlSign}${Math.abs(portfolioSummary.lifetimePnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
        <div className="text-[10px] text-muted mt-0.5">{portfolioSummary.winRate}% win rate</div>
      </div>

      {/* orbs */}
      {groups.map((group, i) => {
        const pos    = positions[i]
        const status = groupStatus(group)
        const color  = STATUS_COLOR[status]
        const href   = groupHref(group)
        const ringPct = groupRingPct(group)
        const R = 40

        const content = (
          <div
            className={`absolute flex flex-col items-center justify-center rounded-full text-center ${status === 'payout' ? 'pulse-green' : ''}`}
            style={{
              left: pos.x - R, top: pos.y - R, width: R * 2, height: R * 2,
              background: ringGradient(ringPct, color),
              padding: 3,
            }}
          >
            <div
              className="flex flex-col items-center justify-center rounded-full bg-bg2 border"
              style={{ width: '100%', height: '100%', borderColor: color }}
            >
              <div className="text-[9px] leading-tight px-1 text-white truncate max-w-[68px]">{groupLabel(group, firmById)}</div>
            </div>
          </div>
        )

        return href ? (
          <Link key={i} href={href} className="cursor-pointer hover:opacity-90 transition-opacity" style={{ position: 'absolute', inset: 0 }}>
            {content}
          </Link>
        ) : (
          <div key={i}>{content}</div>
        )
      })}

      {/* aggregate archive orb */}
      {hasArchive && positions[groups.length] && (
        <Link
          href="/dashboard/archived"
          className="absolute flex flex-col items-center justify-center rounded-full bg-bg2 border text-center hover:opacity-90 transition-opacity"
          style={{
            left: positions[groups.length].x - 40, top: positions[groups.length].y - 40,
            width: 80, height: 80, borderColor: STATUS_COLOR.archive,
          }}
        >
          <div className="text-[9px] tracking-widest uppercase text-dim">Archive</div>
          <div className="font-display text-lg text-white">{archiveSummary.total}</div>
          <div className="text-[8px] text-muted">{archiveSummary.passed}P · {archiveSummary.breached}B</div>
        </Link>
      )}
    </div>
  )
}
