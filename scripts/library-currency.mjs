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

// PubMed beside Crossref (P3, 2026-11-06): Crossref's corrections are its least complete category, so
// every source PubMed holds is asked for a retraction, an erratum or an expression of concern too.
const NOTICE = { RetractionIn: 'retraction', ErratumIn: 'correction', ExpressionOfConcernIn: 'concern', RetractionOf: 'retraction' }
const pause = () => new Promise((r) => setTimeout(r, 350))
async function pmidOf(s) {
  if (s.pmid) return s.pmid
  if (!s.doi) return null
  try {
    const r = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&term=${encodeURIComponent(`${s.doi}[doi]`)}`)
    await pause()
    return r.ok ? ((await r.json())?.esearchresult?.idlist?.[0] ?? null) : null
  } catch {
    return null
  }
}
for (const c of library) {
  if (c.status !== 'admitted') continue
  for (const s of c.sources) {
    const pmid = await pmidOf(s)
    if (!pmid) continue
    try {
      const r = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml`)
      await pause()
      if (!r.ok) continue
      const xml = await r.text()
      for (const m of xml.matchAll(/<CommentsCorrections RefType="(RetractionIn|ErratumIn|ExpressionOfConcernIn|RetractionOf)"/g)) {
        const kind = NOTICE[m[1]]
        if (!flags.some((f) => f.id === c.id && f.kind === kind && f.detail.includes(`PMID ${pmid}`))) flags.push({ id: c.id, kind, detail: `PubMed: PMID ${pmid} (${s.doi ?? 'no DOI'}) carries ${m[1]}` })
      }
    } catch {
      continue
    }
  }
}

writeFileSync('library/currency.json', JSON.stringify({ checkedOn: today.toISOString().slice(0, 10), flags }, null, 2) + '\n')
for (const f of flags) console.log(`library: ${f.kind} ${f.id}: ${f.detail}`)
console.log(`library: ${flags.length} flag(s) across ${library.filter((c) => c.status === 'admitted').length} admitted cards`)
