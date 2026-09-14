// app/(admin)/admin/firms/[firmId]/versions/[versionId]/sizes/[sizeId]/page.tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function EditFirmRuleSizePage({
  params,
}: {
  params: Promise<{ firmId: string; versionId: string; sizeId: string }>
}) {
  const { firmId, versionId, sizeId } = await params
  const supabase = await createClient()

  const { data: firm } = await supabase.from('firms').select('*').eq('id', firmId).single()
  const { data: version } = await supabase.from('firm_rule_versions').select('*').eq('id', versionId).single()
  const { data: size } = await supabase.from('firm_rule_sizes').select('*').eq('id', sizeId).single()
  if (!firm || !version || !size || size.firm_version_id !== versionId) notFound()

  if (size.effective_to) {
    return (
      <div className="card text-center py-12">
        <div className="text-dim text-sm">
          This row was superseded on {size.effective_to} — it can no longer be edited directly.
        </div>
        <Link
          href={`/admin/firms/${firmId}/versions/${versionId}`}
          className="text-amber text-xs hover:underline mt-2 block"
        >
          ← Back to sizes
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="text-xs text-dim tracking-widest mb-1">
        <Link href="/admin" className="hover:text-amber transition-colors">FIRMS</Link>
        <span className="mx-2">›</span>
        <Link href={`/admin/firms/${firmId}`} className="hover:text-amber transition-colors">{firm.name}</Link>
        <span className="mx-2">›</span>
        <Link href={`/admin/firms/${firmId}/versions/${versionId}`} className="hover:text-amber transition-colors">
          {version.version_label}
        </Link>
        <span className="mx-2">›</span>
        <span>Edit ${(size.account_size / 1000).toFixed(0)}K {size.drawdown_type === 'trailing_eod' ? 'EOD' : 'Intraday'}</span>
      </div>
      <h1 className="font-display text-3xl tracking-[3px] text-white mb-2">
        EDIT ${(size.account_size / 1000).toFixed(0)}K {size.drawdown_type === 'trailing_eod' ? 'EOD' : 'INTRADAY'}
      </h1>
      <p className="text-xs text-muted mb-6">
        This never overwrites history — saving closes the current row (effective {size.effective_from} →) at your
        chosen date and opens a new one with the edited numbers. Accounts created before that date keep using
        today's numbers unchanged.
      </p>

      <div className="card">
        <form action={`/api/admin/firm-rule-sizes/${size.id}/supersede`} method="POST" className="space-y-3">
          <input type="hidden" name="firm_id" value={firmId} />

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Drawdown Amount ($)</label>
              <input type="number" step="0.01" name="drawdown_amount" className="input" defaultValue={size.drawdown_amount} required />
            </div>
            <div>
              <label className="label">Daily Loss Limit ($, blank = none)</label>
              <input type="number" step="0.01" name="daily_loss_limit" className="input" defaultValue={size.daily_loss_limit ?? ''} />
            </div>
            <div>
              <label className="label">Optional DLL Opt-In ($, blank = firm offers no opt-in)</label>
              <input type="number" step="0.01" name="optional_daily_loss_limit" className="input" defaultValue={size.optional_daily_loss_limit ?? ''} />
            </div>
            <div>
              <label className="label">Scale DLL % (of peak balance once MLL locks; blank = no scaling DLL)</label>
              <input type="number" step="0.01" name="scale_dll_pct" className="input" defaultValue={size.scale_dll_pct ?? ''} />
            </div>
            <div>
              <label className="label">Safety Net Buffer ($)</label>
              <input type="number" step="0.01" name="safety_net_buffer" className="input" defaultValue={size.safety_net_buffer} />
            </div>
            <div>
              <label className="label">MLL Lock Buffer ($)</label>
              <input type="number" step="0.01" name="mll_lock_buffer" className="input" defaultValue={size.mll_lock_buffer} />
            </div>
            <div>
              <label className="label">Qualifying Day Min ($)</label>
              <input type="number" step="0.01" name="qualifying_day_min" className="input" defaultValue={size.qualifying_day_min} />
            </div>
            <div>
              <label className="label">Min Qualifying Days</label>
              <input type="number" name="min_qualifying_days" className="input" defaultValue={size.min_qualifying_days} />
            </div>
            <div>
              <label className="label">Max Contracts</label>
              <input type="number" name="max_contracts" className="input" defaultValue={size.max_contracts} required />
            </div>
            <div>
              <label className="label">Consistency Rule (%, 0 = none)</label>
              <input type="number" step="0.01" name="consistency_rule_pct" className="input" defaultValue={size.consistency_rule_pct} />
            </div>
            <div>
              <label className="label">Min Payout ($)</label>
              <input type="number" step="0.01" name="min_payout" className="input" defaultValue={size.min_payout} />
            </div>
            <div>
              <label className="label">Min Days Between Payouts (0 = any day, e.g. Tradeify Select Flex = 5)</label>
              <input type="number" name="min_days_between_payouts" className="input" defaultValue={size.min_days_between_payouts ?? 0} />
            </div>
            <div>
              <label className="label">Effective From (when this change takes effect)</label>
              <input
                type="date"
                name="effective_from"
                className="input"
                defaultValue={new Date().toISOString().slice(0, 10)}
                min={size.effective_from}
                required
              />
            </div>
          </div>
          <div>
            <label className="label">Payout Ladder (comma-separated $ amounts)</label>
            <input
              type="text"
              name="payout_ladder"
              className="input"
              defaultValue={(size.payout_ladder || []).join(',')}
            />
          </div>
          <div>
            <label className="label">Consistency Schedule (comma-separated %, blank = flat rate above, escalates by payout count)</label>
            <input
              type="text"
              name="consistency_schedule"
              className="input"
              defaultValue={(size.consistency_schedule || []).join(',')}
              placeholder="20,25,30"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Link
              href={`/admin/firms/${firmId}/versions/${versionId}`}
              className="btn-ghost"
              style={{ display: 'block', textAlign: 'center', padding: '10px 20px', width: 'auto' }}
            >
              Cancel
            </Link>
            <button type="submit" className="btn-primary" style={{ width: 'auto', padding: '10px 28px' }}>
              Save New Version →
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
