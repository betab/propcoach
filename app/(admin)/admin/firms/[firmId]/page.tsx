// app/(admin)/admin/firms/[firmId]/page.tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

function fmt(n: number | string | null): string {
  if (n == null) return '—'
  return '$' + Number(n).toLocaleString()
}

export default async function AdminFirmDetailPage({ params }: { params: Promise<{ firmId: string }> }) {
  const { firmId } = await params
  const supabase = await createClient()

  const { data: firm } = await supabase.from('firms').select('*').eq('id', firmId).single()
  if (!firm) notFound()

  const { data: versions } = await supabase
    .from('firm_rule_versions')
    .select('*')
    .eq('firm_id', firmId)
    .order('version_key')

  const versionIds = (versions || []).map(v => v.id)
  const { data: sizes } = versionIds.length
    ? await supabase
        .from('firm_rule_sizes')
        .select('*')
        .in('firm_version_id', versionIds)
        .order('account_size', { ascending: true })
    : { data: [] as any[] }

  return (
    <div>
      <div className="text-xs text-dim tracking-widest mb-1">
        <Link href="/admin" className="hover:text-amber transition-colors">FIRMS</Link>
        <span className="mx-2">›</span>
        <span>{firm.name}</span>
      </div>
      <h1 className="font-display text-3xl tracking-[3px] text-white mb-6">{firm.name.toUpperCase()}</h1>

      {(versions || []).map(version => {
        const versionSizes = (sizes || []).filter(s => s.firm_version_id === version.id)
        // Currently-open rows first, then superseded history — newest first within each.
        const sorted = [...versionSizes].sort((a, b) => {
          if (!!a.effective_to !== !!b.effective_to) return a.effective_to ? 1 : -1
          return b.effective_from.localeCompare(a.effective_from)
        })

        return (
          <div key={version.id} className="card mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-display text-lg text-white">{version.version_label}</div>
              {!version.is_current && (
                <span className="text-[9px] px-1.5 py-0.5 rounded border border-dim text-dim normal-case">
                  not offered to new accounts
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-dim text-[10px] uppercase tracking-widest text-left">
                    <th className="pb-2 pr-4">Size</th>
                    <th className="pb-2 pr-4">Type</th>
                    <th className="pb-2 pr-4">Drawdown</th>
                    <th className="pb-2 pr-4">DLL</th>
                    <th className="pb-2 pr-4">Max Contracts</th>
                    <th className="pb-2 pr-4">Consistency</th>
                    <th className="pb-2 pr-4">Min Qual. Days</th>
                    <th className="pb-2 pr-4">Effective</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(s => (
                    <tr key={s.id} className={`border-t border-border/50 ${s.effective_to ? 'opacity-40' : ''}`}>
                      <td className="py-2 pr-4 text-white">${(s.account_size / 1000).toFixed(0)}K</td>
                      <td className="py-2 pr-4 text-muted">{s.drawdown_type === 'trailing_eod' ? 'EOD' : 'Intraday'}</td>
                      <td className="py-2 pr-4 text-muted">{fmt(s.drawdown_amount)}</td>
                      <td className="py-2 pr-4 text-muted">{fmt(s.daily_loss_limit)}</td>
                      <td className="py-2 pr-4 text-muted">{s.max_contracts}</td>
                      <td className="py-2 pr-4 text-muted">{Number(s.consistency_rule_pct)}%</td>
                      <td className="py-2 pr-4 text-muted">{s.min_qualifying_days}</td>
                      <td className="py-2 pr-4 text-dim whitespace-nowrap">
                        {s.effective_from}{s.effective_to ? ` → ${s.effective_to}` : ' →'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {(!versions || versions.length === 0) && (
        <div className="card text-center py-12">
          <div className="text-dim text-sm">No rule versions configured for this firm yet.</div>
        </div>
      )}
    </div>
  )
}
