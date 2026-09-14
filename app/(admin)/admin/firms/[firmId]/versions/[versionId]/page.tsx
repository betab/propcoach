// app/(admin)/admin/firms/[firmId]/versions/[versionId]/page.tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

function fmt(n: number | string | null): string {
  if (n == null) return '—'
  return '$' + Number(n).toLocaleString()
}

export default async function AdminVersionSizesPage({
  params,
}: {
  params: Promise<{ firmId: string; versionId: string }>
}) {
  const { firmId, versionId } = await params
  const supabase = await createClient()

  const { data: firm } = await supabase.from('firms').select('*').eq('id', firmId).single()
  const { data: version } = await supabase.from('firm_rule_versions').select('*').eq('id', versionId).single()
  if (!firm || !version || version.firm_id !== firmId) notFound()

  const { data: sizes } = await supabase
    .from('firm_rule_sizes')
    .select('*')
    .eq('firm_version_id', versionId)
    .order('account_size', { ascending: true })

  const sorted = [...(sizes || [])].sort((a, b) => {
    if (!!a.effective_to !== !!b.effective_to) return a.effective_to ? 1 : -1
    return b.effective_from.localeCompare(a.effective_from)
  })

  return (
    <div>
      <div className="text-xs text-dim tracking-widest mb-1">
        <Link href="/admin" className="hover:text-amber transition-colors">FIRMS</Link>
        <span className="mx-2">›</span>
        <Link href={`/admin/firms/${firmId}`} className="hover:text-amber transition-colors">{firm.name}</Link>
        <span className="mx-2">›</span>
        <span>{version.version_label}</span>
      </div>
      <h1 className="font-display text-3xl tracking-[3px] text-white mb-6">{version.version_label.toUpperCase()}</h1>

      <div className="card mb-4">
        <div className="stat-label mb-3">Sizes</div>
        {sorted.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-dim text-[10px] uppercase tracking-widest text-left">
                  <th className="pb-2 pr-4">Size</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Drawdown</th>
                  <th className="pb-2 pr-4">DLL</th>
                  <th className="pb-2 pr-4">Opt-in DLL</th>
                  <th className="pb-2 pr-4">Max Contracts</th>
                  <th className="pb-2 pr-4">Consistency</th>
                  <th className="pb-2 pr-4">Min Qual. Days</th>
                  <th className="pb-2 pr-4">Effective</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(s => (
                  <tr key={s.id} className={`border-t border-border/50 ${s.effective_to ? 'opacity-40' : ''}`}>
                    <td className="py-2 pr-4 text-white">${(s.account_size / 1000).toFixed(0)}K</td>
                    <td className="py-2 pr-4 text-muted">{s.drawdown_type === 'trailing_eod' ? 'EOD' : 'Intraday'}</td>
                    <td className="py-2 pr-4 text-muted">{fmt(s.drawdown_amount)}</td>
                    <td className="py-2 pr-4 text-muted">{fmt(s.daily_loss_limit)}</td>
                    <td className="py-2 pr-4 text-muted">{fmt(s.optional_daily_loss_limit)}</td>
                    <td className="py-2 pr-4 text-muted">{s.max_contracts}</td>
                    <td className="py-2 pr-4 text-muted">{Number(s.consistency_rule_pct)}%</td>
                    <td className="py-2 pr-4 text-muted">{s.min_qualifying_days}</td>
                    <td className="py-2 pr-4 text-dim whitespace-nowrap">
                      {s.effective_from}{s.effective_to ? ` → ${s.effective_to}` : ' →'}
                    </td>
                    <td className="py-2">
                      {!s.effective_to && (
                        <Link
                          href={`/admin/firms/${firmId}/versions/${versionId}/sizes/${s.id}`}
                          className="text-[10px] tracking-widest uppercase text-blue hover:underline"
                        >
                          Edit
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-xs text-dim">No sizes configured yet.</div>
        )}
      </div>

      <div className="card">
        <div className="stat-label mb-3">Add a Size</div>
        <form action="/api/admin/firm-rule-sizes" method="POST" className="space-y-3">
          <input type="hidden" name="firm_id" value={firmId} />
          <input type="hidden" name="firm_version_id" value={versionId} />

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Account Size ($)</label>
              <input type="number" name="account_size" className="input" placeholder="50000" required />
            </div>
            <div>
              <label className="label">Drawdown Type</label>
              <select name="drawdown_type" className="input" required defaultValue="trailing_eod">
                <option value="trailing_eod">EOD Trailing</option>
                <option value="trailing_intraday">Intraday Trailing</option>
                <option value="static">Static</option>
              </select>
            </div>
            <div>
              <label className="label">Drawdown Amount ($)</label>
              <input type="number" step="0.01" name="drawdown_amount" className="input" placeholder="2500" required />
            </div>
            <div>
              <label className="label">Daily Loss Limit ($, blank = none)</label>
              <input type="number" step="0.01" name="daily_loss_limit" className="input" placeholder="1000" />
            </div>
            <div>
              <label className="label">Optional DLL Opt-In ($, blank = firm offers no opt-in)</label>
              <input type="number" step="0.01" name="optional_daily_loss_limit" className="input" placeholder="1200" />
            </div>
            <div>
              <label className="label">Safety Net Buffer ($)</label>
              <input type="number" step="0.01" name="safety_net_buffer" className="input" defaultValue={100} />
            </div>
            <div>
              <label className="label">MLL Lock Buffer ($)</label>
              <input type="number" step="0.01" name="mll_lock_buffer" className="input" defaultValue={100} />
            </div>
            <div>
              <label className="label">Qualifying Day Min ($)</label>
              <input type="number" step="0.01" name="qualifying_day_min" className="input" placeholder="250" />
            </div>
            <div>
              <label className="label">Min Qualifying Days</label>
              <input type="number" name="min_qualifying_days" className="input" defaultValue={0} />
            </div>
            <div>
              <label className="label">Max Contracts</label>
              <input type="number" name="max_contracts" className="input" placeholder="4" required />
            </div>
            <div>
              <label className="label">Consistency Rule (%, 0 = none)</label>
              <input type="number" step="0.01" name="consistency_rule_pct" className="input" placeholder="50" />
            </div>
            <div>
              <label className="label">Min Payout ($)</label>
              <input type="number" step="0.01" name="min_payout" className="input" placeholder="500" />
            </div>
            <div>
              <label className="label">Effective From</label>
              <input type="date" name="effective_from" className="input" defaultValue={new Date().toISOString().slice(0, 10)} required />
            </div>
          </div>
          <div>
            <label className="label">Payout Ladder (comma-separated $ amounts)</label>
            <input type="text" name="payout_ladder" className="input" placeholder="1000,1250,1500,1500,1750,2000" />
          </div>

          <button type="submit" className="btn border-amber text-amber hover:bg-amber/10">
            + Add Size
          </button>
        </form>
      </div>
    </div>
  )
}
