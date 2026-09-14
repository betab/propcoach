// app/(admin)/admin/firms/[firmId]/page.tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

function fmt(n: number | string | null): string {
  if (n == null) return '—'
  return '$' + Number(n).toLocaleString()
}

function timeAgo(iso: string | null) {
  if (!iso) return 'never'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

export default async function AdminFirmDetailPage({ params }: { params: Promise<{ firmId: string }> }) {
  const { firmId } = await params
  const supabase = await createClient()

  const { data: firm } = await supabase.from('firms').select('*').eq('id', firmId).single()
  if (!firm) notFound()

  const { data: sourceDomains } = await supabase
    .from('firm_source_domains').select('*').eq('firm_id', firmId).order('domain')

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
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="text-xs text-dim tracking-widest mb-1">
            <Link href="/admin" className="hover:text-amber transition-colors">FIRMS</Link>
            <span className="mx-2">›</span>
            <span>{firm.name}</span>
          </div>
          <h1 className="font-display text-3xl tracking-[3px] text-white">{firm.name.toUpperCase()}</h1>
          <p className="text-xs text-muted mt-1">
            {firm.is_active ? 'Active' : firm.coming_soon ? 'Coming soon' : 'Inactive'} · Rules verified {timeAgo(firm.rules_last_verified_at)}
          </p>
        </div>
        <form action={`/api/admin/firms/${firm.id}/mark-reviewed`} method="POST">
          <button type="submit" className="btn border-green text-green hover:bg-green/10">
            ✓ Mark Rules Reviewed
          </button>
        </form>
      </div>

      {/* Metadata edit */}
      <div className="card mb-4">
        <div className="stat-label mb-3">Firm Details</div>
        <form action={`/api/admin/firms/${firm.id}`} method="POST" className="space-y-3">
          <div>
            <label className="label">Name</label>
            <input type="text" name="name" defaultValue={firm.name} className="input" required />
          </div>
          <div>
            <label className="label">Logo URL</label>
            <input type="text" name="logo_url" defaultValue={firm.logo_url || ''} className="input" />
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" name="coming_soon" defaultChecked={firm.coming_soon} className="accent-amber" />
              Coming soon
            </label>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" name="is_active" defaultChecked={firm.is_active} className="accent-green" />
              Active (visible to users)
            </label>
          </div>
          <button type="submit" className="btn border-blue text-blue hover:bg-blue/10">
            Save Details
          </button>
        </form>
      </div>

      {/* Source domains — the allowlist the fetch-proxy endpoint checks
          before pulling anything from this firm's site on the research
          Routine's behalf (app/api/cron/firm-source-fetch). Adding a
          domain here is the entire "onboard a new firm's site" step. */}
      <div className="card mb-4">
        <div className="stat-label mb-3">Source Domains</div>
        <p className="text-xs text-muted mb-3">
          Hostnames the rule-research fetch proxy is allowed to pull from for this firm. Exact match only —
          add each subdomain you need (e.g. both <code>tradeify.co</code> and <code>help.tradeify.co</code>).
        </p>
        {(sourceDomains || []).length > 0 ? (
          <ul className="space-y-2 mb-4">
            {(sourceDomains || []).map(d => (
              <li key={d.id} className="flex items-center justify-between text-xs">
                <span className="text-white font-mono">{d.domain}</span>
                <form action={`/api/admin/firms/${firm.id}/source-domains/${d.id}/delete`} method="POST">
                  <button type="submit" className="text-[10px] tracking-widest uppercase text-danger hover:underline">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-xs text-dim mb-4">No source domains configured — the fetch proxy will refuse everything for this firm.</div>
        )}
        <form action={`/api/admin/firms/${firm.id}/source-domains`} method="POST" className="flex gap-2">
          <input type="text" name="domain" className="input" placeholder="e.g. help.tradeify.co" required />
          <button type="submit" className="btn border-amber text-amber hover:bg-amber/10" style={{ width: 'auto', padding: '8px 16px' }}>
            + Add
          </button>
        </form>
      </div>

      {(versions || []).map(version => {
        const versionSizes = (sizes || []).filter(s => s.firm_version_id === version.id)
        const sorted = [...versionSizes].sort((a, b) => {
          if (!!a.effective_to !== !!b.effective_to) return a.effective_to ? 1 : -1
          return b.effective_from.localeCompare(a.effective_from)
        })

        return (
          <div key={version.id} className="card mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="font-display text-lg text-white">{version.version_label}</div>
                {!version.is_current && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded border border-dim text-dim normal-case">
                    not offered to new accounts
                  </span>
                )}
              </div>
              <Link
                href={`/admin/firms/${firm.id}/versions/${version.id}`}
                className="text-[10px] tracking-widest uppercase text-amber hover:underline"
              >
                Manage Sizes →
              </Link>
            </div>
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
                      <th className="pb-2 pr-4">Scale DLL</th>
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
                        <td className="py-2 pr-4 text-muted">{fmt(s.optional_daily_loss_limit)}</td>
                        <td className="py-2 pr-4 text-muted">{s.scale_dll_pct ? `${Number(s.scale_dll_pct)}%` : '—'}</td>
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
            ) : (
              <div className="text-xs text-dim">No sizes configured yet for this version.</div>
            )}
          </div>
        )
      })}

      {(!versions || versions.length === 0) && (
        <div className="card text-center py-8 mb-4">
          <div className="text-dim text-sm">No rule versions configured for this firm yet.</div>
        </div>
      )}

      {/* Add version */}
      <div className="card">
        <div className="stat-label mb-3">Add a Rule Version</div>
        <form action={`/api/admin/firms/${firm.id}/versions`} method="POST" className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Version Key</label>
              <input type="text" name="version_key" className="input" placeholder="e.g. legacy" required />
            </div>
            <div>
              <label className="label">Version Label</label>
              <input type="text" name="version_label" className="input" placeholder="e.g. Legacy (pre-March 2026)" required />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" name="is_current" defaultChecked className="accent-green" />
            Offer this version to new accounts
          </label>
          <button type="submit" className="btn border-amber text-amber hover:bg-amber/10">
            + Add Version
          </button>
        </form>
      </div>
    </div>
  )
}
