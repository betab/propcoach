// lib/import/csv.ts
// Minimal RFC4180-ish CSV parser: quoted fields (embedded commas/newlines,
// escaped "" quotes), \n and \r\n line endings. No external dependency —
// broker/platform export files here are one account's daily or trade
// history, small enough that a hand-rolled parser is simpler than adding
// a library for it.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  const pushField = () => { row.push(field); field = '' }
  const pushRow = () => {
    pushField()
    if (row.length > 1 || row[0] !== '') rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else { inQuotes = false }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') { inQuotes = true }
    else if (char === ',') { pushField() }
    else if (char === '\n') { pushRow() }
    else if (char === '\r') { if (text[i + 1] === '\n') i++; pushRow() }
    else { field += char }
  }
  if (field !== '' || row.length > 0) pushRow()

  return rows
}
