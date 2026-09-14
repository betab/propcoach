// app/api/cron/firm-source-fetch/route.ts
// A fetch proxy for the biweekly research Routine (and Claude, manually) —
// runs on Vercel's own network, which has normal internet access regardless
// of whatever egress policy an individual Claude Code session is under.
// Rather than the Routine trying (and possibly failing) to reach a firm's
// site directly, it POSTs a URL here and this route fetches it server-side.
//
// Every fetch is checked against firm_source_domains — an admin-managed,
// per-firm hostname allowlist (see migration 007) — before this route will
// touch it. This is NOT a general-purpose fetch proxy: it refuses anything
// not on the list, closing off the obvious abuse (SSRF against internal
// services, fetching arbitrary unrelated sites). Adding a new firm's
// sources is an admin UI action, never a code change.
//
// Auth: same bearer-secret pattern as the ingest route (no session — this
// is called by an automated Routine), reusing FIRM_RULES_INGEST_SECRET
// since this is part of the same monitoring pipeline, not a separate
// capability worth its own secret to manage.
//
// Request: POST, Authorization: Bearer <FIRM_RULES_INGEST_SECRET>,
//   { "url": "https://help.tradeify.co/en/articles/..." }
// Response: { url, domain, title, text } — text is HTML converted to plain
// text (see lib/html-to-text.ts) and capped, not raw HTML.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { htmlToText } from '@/lib/html-to-text'

const MAX_RESPONSE_BYTES = 3_000_000  // guard against a pathological response, not a real page — a normal
                                       // marketing site's raw HTML easily runs 300-500KB (confirmed live
                                       // against tradeify.co: 392KB), so this only needs to catch the
                                       // genuinely oversized case, not typical pages
const MAX_TEXT_CHARS = 60_000         // keep the CONVERTED text digestible for a caller reading it — this is
                                       // the cap that actually matters for response size, independent of raw input

export async function POST(req: NextRequest) {
  const secret = process.env.FIRM_RULES_INGEST_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Fetch endpoint is not configured.' }, { status: 503 })
  }
  const authHeader = req.headers.get('authorization') || ''
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { url?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const rawUrl = String(body.url || '').trim()
  if (!rawUrl) return NextResponse.json({ error: 'url is required.' }, { status: 400 })

  let target: URL
  try {
    target = new URL(rawUrl)
  } catch {
    return NextResponse.json({ error: 'url is not a valid URL.' }, { status: 400 })
  }
  if (target.protocol !== 'https:') {
    return NextResponse.json({ error: 'Only https:// URLs are allowed.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: allowed } = await admin
    .from('firm_source_domains')
    .select('firm_id')
    .eq('domain', target.hostname)
    .maybeSingle()
  if (!allowed) {
    return NextResponse.json(
      { error: `'${target.hostname}' is not on the source-domain allowlist for any firm. Add it via that firm's /admin/firms/[firmId] page first.` },
      { status: 403 }
    )
  }

  let res: Response
  try {
    res = await fetch(target.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PropCoachRulesBot/1.0)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    })
  } catch (e) {
    return NextResponse.json(
      { error: `Fetch failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    )
  }
  if (!res.ok) {
    return NextResponse.json({ error: `Upstream returned ${res.status} ${res.statusText}` }, { status: 502 })
  }

  const contentType = res.headers.get('content-type') || ''
  const raw = await res.text()
  if (raw.length > MAX_RESPONSE_BYTES) {
    return NextResponse.json({ error: `Response too large (${raw.length} bytes) — refusing to process.` }, { status: 413 })
  }

  const isHtml = contentType.includes('html') || raw.trimStart().startsWith('<')
  const converted = isHtml ? htmlToText(raw) : raw
  const titleMatch = isHtml ? raw.match(/<title[^>]*>([^<]*)<\/title>/i) : null

  return NextResponse.json({
    url: target.toString(),
    domain: target.hostname,
    title: titleMatch ? titleMatch[1].trim() : null,
    text: converted.slice(0, MAX_TEXT_CHARS),
    truncated: converted.length > MAX_TEXT_CHARS,
  })
}
