// app/(admin)/admin/disclaimers/page.tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function AdminDisclaimersPage() {
  const supabase = await createClient()

  const { data: disclaimers } = await supabase
    .from('disclaimers')
    .select('*')
    .order('sort_order', { ascending: true })

  return (
    <div>
      <h1 className="font-display text-3xl tracking-[3px] text-white mb-2">DISCLAIMERS</h1>
      <p className="text-xs text-muted mb-6">
        Each one renders as a footnote at the bottom of every app page, with an asterisk next to the field it
        qualifies. Inactive disclaimers are hidden from the app but kept here for reference.
      </p>

      <div className="card mb-4">
        <div className="stat-label mb-3">All Disclaimers</div>
        {disclaimers && disclaimers.length > 0 ? (
          <div className="space-y-3">
            {disclaimers.map(d => (
              <div key={d.id} className={`border-t border-border/50 pt-3 first:border-t-0 first:pt-0 ${d.is_active ? '' : 'opacity-40'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm text-white">
                      {d.label} <span className="text-dim text-xs">#{d.slug}</span>
                      {!d.is_active && <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded border border-dim text-dim uppercase tracking-wide">inactive</span>}
                    </div>
                    <div className="text-xs text-muted mt-1">{d.body}</div>
                  </div>
                  <Link
                    href={`/admin/disclaimers/${d.id}`}
                    className="text-[10px] tracking-widest uppercase text-blue hover:underline shrink-0"
                  >
                    Edit
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-dim">No disclaimers yet.</div>
        )}
      </div>

      <div className="card">
        <div className="stat-label mb-3">Add a Disclaimer</div>
        <form action="/api/admin/disclaimers" method="POST" className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Slug (lowercase, hyphens only — becomes a page anchor)</label>
              <input type="text" name="slug" className="input" placeholder="payout-eligibility" required />
            </div>
            <div>
              <label className="label">Label</label>
              <input type="text" name="label" className="input" placeholder="Payout Eligibility" required />
            </div>
            <div>
              <label className="label">Sort Order (lower shows first)</label>
              <input type="number" name="sort_order" className="input" defaultValue={0} />
            </div>
          </div>
          <div>
            <label className="label">Body</label>
            <textarea name="body" className="input" rows={3} required />
          </div>
          <button type="submit" className="btn border-amber text-amber hover:bg-amber/10">
            + Add Disclaimer
          </button>
        </form>
      </div>
    </div>
  )
}
