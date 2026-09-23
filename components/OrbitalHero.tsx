// components/OrbitalHero.tsx
// The orbital-command hero for Performance Home. Fully fluid: the scene's
// aspect ratio is locked via CSS (aspect-ratio, matching the approved
// mockup's own ~1180:560 proportions) and every ring/node position is a
// percentage of the container, not a fixed pixel box — so it actually
// fills the space next to LeftRail instead of sitting in a fixed-size box
// with empty gutters around it. No client JS needed: aspect-ratio is a
// pure CSS layout primitive, so this stays a server component.
//
// The math: a point at "radius" R (in %-of-width units) and angle θ sits
// at dx% = R·cosθ (already %-of-width, correct as-is) and
// dy% = R·sinθ·ASPECT_RATIO (converted to %-of-height, since the
// container's height is width/ASPECT_RATIO — see polar() below). Sizing
// individual circular elements (rings, core, nodes) is simpler: giving
// each one `width: X%` + `aspectRatio: '1 / 1'` makes its own rendered
// height match its rendered width automatically, regardless of the outer
// container's own aspect ratio.
import Link from 'next/link'
import type { OrbGroup, PortfolioSummary, ArchiveSummary } from '@/lib/performance'
import type { FirmMeta } from '@/lib/firms/types'

const ASPECT_W = 1180
const ASPECT_H = 560
const ASPECT_RATIO = ASPECT_W / ASPECT_H

const CORE_R_PCT  = 8   // % of container width
const INNER_R_PCT = 13
const OUTER_R_PCT = 21
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

function polar(rPct: number, angleDeg: number) {
  const rad = (angleDeg - 90) * (Math.PI / 180)
  return {
    leftPct: 50 + rPct * Math.cos(rad),
    topPct:  50 + rPct * Math.sin(rad) * ASPECT_RATIO,
  }
}

function layout(count: number): { leftPct: number; topPct: number }[] {
  if (count === 0) return []
  if (count <= 4) {
    return Array.from({ length: count }, (_, i) => polar(INNER_R_PCT, (360 / count) * i))
  }
  const innerCount = Math.min(INNER_CAPACITY, Math.ceil(count / 2))
  const outerCount  = count - innerCount
  const inner = Array.from({ length: innerCount }, (_, i) => polar(INNER_R_PCT, (360 / innerCount) * i))
  const outer = Array.from({ length: outerCount }, (_, i) => polar(OUTER_R_PCT, (360 / outerCount) * i + 180 / outerCount))
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

// Circular element helper — width:X% + aspect-ratio:1 makes the rendered
// height match the rendered width regardless of the container's own ratio.
function circleStyle(widthPct: number, leftPct: number, topPct: number): React.CSSProperties {
  return {
    position: 'absolute',
    width: `${widthPct}%`,
    aspectRatio: '1 / 1',
    left: `${leftPct}%`,
    top: `${topPct}%`,
    transform: 'translate(-50%, -50%)',
  }
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
    <div
      className="relative bg-black rounded-xl border border-border overflow-hidden w-full"
      style={{ aspectRatio: `${ASPECT_W} / ${ASPECT_H}` }}
    >
      {/* radar sweep */}
      <div
        className="orbital-spin absolute pointer-events-none"
        style={circleStyle(OUTER_R_PCT * 2, 50, 50)}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{ background: 'conic-gradient(from 0deg, rgba(0,255,136,0.16), transparent 35%)' }}
        />
      </div>

      {/* ring guides */}
      <div className="rounded-full border border-border/60 pointer-events-none" style={circleStyle(INNER_R_PCT * 2, 50, 50)} />
      <div className="rounded-full border border-border/40 pointer-events-none" style={circleStyle(OUTER_R_PCT * 2, 50, 50)} />

      {/* portfolio P&L core — a slow ambient heartbeat glow, colored to
          match the border (green/red by P&L sign), same pulse mechanism
          individual payout-ready orbs use (see .pulse-green in globals.css),
          just slower and tied to the portfolio's own sign rather than a
          single account's payout eligibility. */}
      <div
        className={`flex flex-col items-center justify-center rounded-full border-2 ${
          portfolioSummary.lifetimePnl >= 0 ? 'pulse-core-green' : 'pulse-core-danger'
        }`}
        style={{
          ...circleStyle(CORE_R_PCT * 2, 50, 50),
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
              left: `${pos.leftPct}%`, top: `${pos.topPct}%`, transform: 'translate(-50%, -50%)',
              width: R * 2, height: R * 2,
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
            left: `${positions[groups.length].leftPct}%`, top: `${positions[groups.length].topPct}%`, transform: 'translate(-50%, -50%)',
            width: 80, height: 80, borderColor: STATUS_COLOR.archive,
          }}
        >
          <div className="text-[9px] tracking-widest uppercase text-dim">Archive</div>
          <div className="font-display text-lg text-white">{archiveSummary.total}</div>
          <div className="text-[8px] text-muted">{archiveSummary.passed}P · {archiveSummary.breached}B</div>
        </Link>
      )}

      <div className="absolute bottom-2 right-3 text-[9px] text-dim tracking-wide max-w-[240px] text-right leading-tight pointer-events-none">
        Ring = consistency %. Glow = account state. Archive orb is every past account, combined. Tap any orb to open it.
      </div>
    </div>
  )
}
