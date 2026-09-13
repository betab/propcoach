// app/(admin)/admin/page.tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

function timeAgo(iso: string | null) {
  if (!iso) return 'never'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

export default async function AdminOverviewPage() {
  const supabase = await createClient()

  const { data: firms } = await supabase.from('firms').select('*').order('name')

  const { data: pendingProposals } = await supabase
    .from('firm_rule_change_proposals')
    .select('firm_id')
    .eq('status', 'pending')

  const pendingCountByFirm = new Map<string, number>()
  for (const p of pendingProposals || []) {
    pendingCountByFirm.set(p.firm_id, (pendingCountByFirm.get(p.firm_id) || 0) + 1)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl tracking-[3px] text-white">FIRMS</h1>
        <p className="text-xs text-muted mt-1">{firms?.length || 0} firms registered</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(firms || []).map(firm => {
          const pending = pendingCountByFirm.get(firm.id) || 0
          return (
            <Link key={firm.id} href={`/admin/firms/${firm.id}`} className="block">
              <div className="card hover:border-amber/40 transition-colors cursor-pointer">
                <div className="flex items-start justify-between mb-2">
                  <div className="font-display text-xl tracking-wide text-white">{firm.name}</div>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded border normal-case tracking-wide shrink-0 ${
                      firm.is_active
                        ? 'border-green text-green bg-green/10'
                        : firm.coming_soon
                        ? 'border-amber text-amber bg-amber/10'
                        : 'border-dim text-dim bg-dim/10'
                    }`}
                  >
                    {firm.is_active ? 'active' : firm.coming_soon ? 'coming soon' : 'inactive'}
                  </span>
                </div>
                <div className="text-xs text-muted">Rules verified: {timeAgo(firm.rules_last_verified_at)}</div>
                {pending > 0 && (
                  <div className="text-xs text-amber mt-1">⚠ {pending} pending change{pending === 1 ? '' : 's'}</div>
                )}
              </div>
            </Link>
          )
        })}
      </div>

      {(!firms || firms.length === 0) && (
        <div className="card text-center py-12">
          <div className="text-dim text-sm">No firms registered yet.</div>
        </div>
      )}
    </div>
  )
}
