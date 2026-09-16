// app/(admin)/admin/disclaimers/[id]/page.tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function EditDisclaimerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: disclaimer } = await supabase.from('disclaimers').select('*').eq('id', id).single()
  if (!disclaimer) notFound()

  return (
    <div className="max-w-2xl">
      <div className="text-xs text-dim tracking-widest mb-1">
        <Link href="/admin/disclaimers" className="hover:text-amber transition-colors">DISCLAIMERS</Link>
        <span className="mx-2">›</span>
        <span>Edit {disclaimer.label}</span>
      </div>
      <h1 className="font-display text-3xl tracking-[3px] text-white mb-2">EDIT DISCLAIMER</h1>
      <p className="text-xs text-muted mb-6">Slug <code className="text-dim">#{disclaimer.slug}</code> can't be changed — it's what field asterisks link to.</p>

      <div className="card">
        <form action={`/api/admin/disclaimers/${disclaimer.id}`} method="POST" className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Label</label>
              <input type="text" name="label" className="input" defaultValue={disclaimer.label} required />
            </div>
            <div>
              <label className="label">Sort Order (lower shows first)</label>
              <input type="number" name="sort_order" className="input" defaultValue={disclaimer.sort_order} />
            </div>
          </div>
          <div>
            <label className="label">Body</label>
            <textarea name="body" className="input" rows={4} defaultValue={disclaimer.body} required />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" name="is_active" defaultChecked={disclaimer.is_active} />
            Active (shown in the app footer)
          </label>

          <div className="flex gap-3 pt-2">
            <Link
              href="/admin/disclaimers"
              className="btn-ghost"
              style={{ display: 'block', textAlign: 'center', padding: '10px 20px', width: 'auto' }}
            >
              Cancel
            </Link>
            <button type="submit" className="btn-primary" style={{ width: 'auto', padding: '10px 28px' }}>
              Save →
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
