// app/(admin)/admin/proposals/page.tsx
// The review queue for detected rule changes — nothing here ever auto-
// applies (see supabase/migrations/003_firm_rules_db.sql); a full admin has
// to explicitly approve or reject each row. Mutating forms are shown to
// every admin tier that reaches this page (same as the firms detail page) —
// requireCanEditRules on the routes is the real gate for admin_readonly,
// which gets a 403 rather than a hidden button.
import { createClient } from '@/lib/supabase/server'

const TYPE_LABEL: Record<string, string> = {
  update_existing: 'Update existing rule',
  new_size: 'New account size',
  new_version: 'New rule version',
  new_firm: 'New firm',
}

const CONFIDENCE_STYLE: Record<string, string> = {
  high: 'border-green text-green',
  medium: 'border-amber text-amber',
  low: 'border-danger text-danger',
}

function renderValue(v: unknown): string {
  if (v == null) return '—'
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function fieldLabel(col: string): string {
  return col.replace(/_/g, ' ')
}

export default async function AdminProposalsPage() {
  const supabase = await createClient()

  const [{ data: pending }, { data: reviewed }, { data: firms }] = await Promise.all([
    supabase.from('firm_rule_change_proposals').select('*').eq('status', 'pending').order('detected_at', { ascending: false }),
    supabase.from('firm_rule_change_proposals').select('*').neq('status', 'pending').order('reviewed_at', { ascending: false }).limit(10),
    supabase.from('firms').select('id, name'),
  ])

  const firmName = new Map((firms || []).map(f => [f.id, f.name]))
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl tracking-[3px] text-white">PROPOSALS</h1>
        <p className="text-xs text-muted mt-1">
          {(pending || []).length} pending change{(pending || []).length === 1 ? '' : 's'} awaiting review
        </p>
      </div>

      {(pending || []).length === 0 && (
        <div className="card text-center py-12 mb-6">
          <div className="text-dim text-sm">No pending proposals. Nothing detected needs review right now.</div>
        </div>
      )}

      <div className="space-y-4 mb-8">
        {(pending || []).map(p => {
          const diffEntries = Object.entries(p.field_diffs || {})
          return (
            <div key={p.id} className="card border-amber/30">
              <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
                <div>
                  <div className="font-display text-lg text-white">{firmName.get(p.firm_id) || p.firm_id}</div>
                  <div className="text-xs text-muted">{TYPE_LABEL[p.proposal_type] || p.proposal_type}</div>
                </div>
                {p.confidence && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border normal-case shrink-0 ${CONFIDENCE_STYLE[p.confidence] || 'border-dim text-dim'}`}>
                    {p.confidence} confidence
                  </span>
                )}
              </div>

              {diffEntries.length > 0 && (
                <div className="overflow-x-auto mb-3">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-dim text-[10px] uppercase tracking-widest text-left">
                        <th className="pb-2 pr-4">Field</th>
                        <th className="pb-2 pr-4">Current</th>
                        <th className="pb-2">Proposed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diffEntries.map(([col, diff]) => (
                        <tr key={col} className="border-t border-border/50">
                          <td className="py-2 pr-4 text-muted capitalize">{fieldLabel(col)}</td>
                          <td className="py-2 pr-4 text-dim">{renderValue((diff as any).old)}</td>
                          <td className="py-2 text-white">{renderValue((diff as any).new)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {p.proposed_data && (
                <div className="mb-3">
                  <div className="text-[10px] uppercase tracking-widest text-dim mb-1">Proposed data</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <tbody>
                        {Object.entries(p.proposed_data).map(([k, v]) => (
                          <tr key={k} className="border-t border-border/50">
                            <td className="py-1.5 pr-4 text-muted capitalize whitespace-nowrap">{fieldLabel(k)}</td>
                            <td className="py-1.5 text-white break-all">{renderValue(v)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {(p.source_url || p.source_excerpt) && (
                <div className="mb-3 text-xs">
                  {p.source_url && (
                    <a href={p.source_url} target="_blank" rel="noreferrer" className="text-blue hover:underline break-all">
                      {p.source_url}
                    </a>
                  )}
                  {p.source_excerpt && (
                    <blockquote className="mt-1 pl-3 border-l-2 border-border text-dim italic">"{p.source_excerpt}"</blockquote>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-end gap-3 pt-3 border-t border-border/50">
                <form action={`/api/admin/proposals/${p.id}/approve`} method="POST" className="flex items-end gap-2">
                  <div>
                    <label className="label">Effective from</label>
                    <input
                      type="date"
                      name="effective_from"
                      defaultValue={p.proposed_effective_from || today}
                      className="input"
                      style={{ padding: '4px 8px', width: 'auto' }}
                      required
                    />
                  </div>
                  <button type="submit" className="btn border-green text-green hover:bg-green/10">
                    ✓ Approve
                  </button>
                </form>
                <form action={`/api/admin/proposals/${p.id}/reject`} method="POST" className="flex items-end gap-2 flex-1 min-w-[220px]">
                  <input
                    type="text"
                    name="review_note"
                    placeholder="Reason (optional)"
                    className="input"
                    style={{ padding: '4px 8px' }}
                  />
                  <button type="submit" className="btn border-danger text-danger hover:bg-danger/10">
                    ✕ Reject
                  </button>
                </form>
              </div>
            </div>
          )
        })}
      </div>

      {(reviewed || []).length > 0 && (
        <div>
          <div className="stat-label mb-3">Recently Reviewed</div>
          <div className="card">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-dim text-[10px] uppercase tracking-widest text-left">
                    <th className="pb-2 pr-4">Firm</th>
                    <th className="pb-2 pr-4">Type</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">Reviewed</th>
                    <th className="pb-2">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {(reviewed || []).map(p => (
                    <tr key={p.id} className="border-t border-border/50">
                      <td className="py-2 pr-4 text-white">{firmName.get(p.firm_id) || p.firm_id}</td>
                      <td className="py-2 pr-4 text-muted">{TYPE_LABEL[p.proposal_type] || p.proposal_type}</td>
                      <td className="py-2 pr-4">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border normal-case ${p.status === 'approved' ? 'border-green text-green' : 'border-danger text-danger'}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-dim whitespace-nowrap">{p.reviewed_at ? p.reviewed_at.slice(0, 10) : '—'}</td>
                      <td className="py-2 text-dim">{p.review_note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
