// lib/html-to-text.ts
// Minimal, dependency-free HTML-to-readable-text conversion for the
// fetch-proxy route (app/api/cron/firm-source-fetch) — good enough to pull
// rule numbers and prose out of a firm's rules/FAQ page without shipping a
// full HTML parser. Not meant to be a faithful renderer: strips markup,
// decodes the common entities, collapses whitespace.
export function htmlToText(html: string): string {
  let text = html
    // Drop non-content elements entirely, including their contents.
    .replace(/<(script|style|noscript|svg|head)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    // Block-level boundaries become newlines so paragraphs/table rows don't
    // run together once tags are stripped.
    .replace(/<\/(p|div|li|tr|h[1-6]|br|section|article)\s*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    // Everything else: strip the tag, keep the text between them.
    .replace(/<[^>]+>/g, ' ')

  const entities: Record<string, string> = {
    '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>',
    '&quot;': '"', '&#39;': "'", '&apos;': "'", '&mdash;': '—', '&ndash;': '–',
  }
  text = text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
  for (const [entity, char] of Object.entries(entities)) {
    text = text.split(entity).join(char)
  }

  return text
    .split('\n').map(line => line.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n')
    .replace(/\n{3,}/g, '\n\n')
}
