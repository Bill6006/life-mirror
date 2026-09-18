// The library builder, step three: currency. Every admitted card's DOIs are asked at Crossref
// for a retraction, correction or later version; every card unreviewed for eighteen months is
// listed as stale. Writes library/currency.json and prints the flags. Free API, no key.
// Usage: node scripts/library-currency.mjs
import { writeFileSync, readFileSync } from 'node:fs'

const library = JSON.parse(readFileSync('src/library.json', 'utf8'))
const today = new Date()
const STALE_MONTHS = 18
const flags = []

function monthsSince(day) {
  const d = new Date(day)
  return (today.getFullYear() - d.getFullYear()) * 12 + (today.getMonth() - d.getMonth())
}

for (const c of library) {
  if (c.status !== 'admitted') continue
  if (monthsSince(c.reviewed) >= STALE_MONTHS) flags.push({ id: c.id, kind: 'stale', detail: `last reviewed ${c.reviewed}` })
  for (const s of c.sources) {
    if (!s.doi) continue
    let record = null
    try {
      const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(s.doi)}`, { headers: { 'User-Agent': 'life-mirror library builder (https://github.com/Bill6006/life-mirror)' } })
      if (r.status === 404) {
        flags.push({ id: c.id, kind: 'missing', detail: `${s.doi} not found at Crossref` })
        continue
      }
      if (!r.ok) continue
      record = (await r.json()).message
    } catch {
      continue
    }
    for (const u of record['update-to'] ?? []) flags.push({ id: c.id, kind: 'updated', detail: `${s.doi} is an update (${u.type}) to ${u.DOI}` })
    for (const u of record.updated_by ?? record['updated-by'] ?? []) flags.push({ id: c.id, kind: u.type === 'retraction' ? 'retraction' : 'correction', detail: `${s.doi} has ${u.type ?? 'an update'}: ${u.DOI ?? ''}` })
    const relation = record.relation ?? {}
    for (const key of Object.keys(relation)) if (/retract/i.test(key)) flags.push({ id: c.id, kind: 'retraction', detail: `${s.doi}: ${key}` })
    await new Promise((r) => setTimeout(r, 120))
  }
}

writeFileSync('library/currency.json', JSON.stringify({ checkedOn: today.toISOString().slice(0, 10), flags }, null, 2) + '\n')
for (const f of flags) console.log(`library: ${f.kind} ${f.id}: ${f.detail}`)
console.log(`library: ${flags.length} flag(s) across ${library.filter((c) => c.status === 'admitted').length} admitted cards`)
