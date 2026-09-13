// app/(admin)/admin/firms/new/page.tsx
import Link from 'next/link'

export default function NewFirmPage() {
  return (
    <div className="max-w-lg">
      <div className="text-xs text-dim tracking-widest mb-1">
        <Link href="/admin" className="hover:text-amber transition-colors">FIRMS</Link>
        <span className="mx-2">›</span>
        <span>Add Firm</span>
      </div>
      <h1 className="font-display text-3xl tracking-[3px] text-white mb-6">ADD FIRM</h1>

      <div className="card">
        <form action="/api/admin/firms" method="POST" className="space-y-4">
          <div>
            <label className="label">Firm ID</label>
            <input type="text" name="id" className="input" placeholder="e.g. tradeify" required pattern="[a-z0-9_-]+" />
            <p className="text-[10px] text-dim mt-1">Lowercase letters, numbers, - and _ only. Cannot be changed later.</p>
          </div>
          <div>
            <label className="label">Name</label>
            <input type="text" name="name" className="input" placeholder="e.g. Tradeify" required />
          </div>
          <div>
            <label className="label">Logo URL (optional)</label>
            <input type="text" name="logo_url" className="input" placeholder="/logos/tradeify.svg" />
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" name="coming_soon" defaultChecked className="accent-amber" />
              Coming soon
            </label>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" name="is_active" className="accent-green" />
              Active (visible to users)
            </label>
          </div>
          <p className="text-[10px] text-dim">
            New firms typically stay "coming soon" and inactive until their rules are fully entered and verified.
          </p>

          <div className="flex gap-3 pt-2">
            <Link href="/admin" className="btn-ghost" style={{ width: 'auto', padding: '10px 20px' }}>Cancel</Link>
            <button type="submit" className="btn-primary">Create Firm →</button>
          </div>
        </form>
      </div>
    </div>
  )
}
