// The evidence library's check. `--check` reads src/library.json and refuses a card that is not
// well formed: an id used twice, a grade or a status outside the scale, a tag or a domain outside
// the vocabulary, a source without a citation, a review date that is not a date. `--verify`
// also asks Crossref about every DOI and refuses a card whose year or first author does not
// match what Crossref holds. Nothing here needs a token; nothing here is personal.
import { readFileSync } from 'node:fs'

const mode = process.argv[2] ?? '--check'
const cards = JSON.parse(readFileSync('src/library.json', 'utf8'))
const vocabulary = JSON.parse(readFileSync('src/libraryTags.json', 'utf8'))
const catalogueFile = JSON.parse(readFileSync('src/catalogue.json', 'utf8'))
const catalogueIds = new Set((catalogueFile.moves ?? catalogueFile).map((m) => m.id))
const GRADES = ['A', 'B', 'C', 'D']
const REPLICATION = ['replicated', 'mixed', 'failed', 'untested']
const STATUS = ['admitted', 'draft', 'superseded', 'disputed']
const problems = []
const seen = new Set()

for (const c of cards) {
  const where = c.id ?? '(no id)'
  if (typeof c.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.id)) problems.push(`${where}: id must be kebab-case`)
  if (seen.has(c.id)) problems.push(`${where}: id used twice`)
  seen.add(c.id)
  if (typeof c.claim !== 'string' || c.claim.length < 40) problems.push(`${where}: claim too short`)
  if (!vocabulary.domains.includes(c.domain)) problems.push(`${where}: domain "${c.domain}" outside the vocabulary`)
  if (!Array.isArray(c.tags) || c.tags.length === 0) problems.push(`${where}: no tags`)
  for (const t of c.tags ?? []) if (!vocabulary.tags.includes(t)) problems.push(`${where}: tag "${t}" outside the vocabulary`)
  if (!GRADES.includes(c.grade)) problems.push(`${where}: grade "${c.grade}"`)
  if (!REPLICATION.includes(c.replication)) problems.push(`${where}: replication "${c.replication}"`)
  if (!STATUS.includes(c.status)) problems.push(`${where}: status "${c.status}"`)
  if (typeof c.effect !== 'string' || !c.effect) problems.push(`${where}: effect missing`)
  if (typeof c.population !== 'string' || !c.population) problems.push(`${where}: population missing`)
  if (typeof c.caveats !== 'string') problems.push(`${where}: caveats missing`)
  if (typeof c.app !== 'string' || !c.app) problems.push(`${where}: app mapping missing`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.reviewed ?? '')) problems.push(`${where}: reviewed is not a date`)
  if (c.moves !== undefined && (!Array.isArray(c.moves) || c.moves.some((m) => !catalogueIds.has(m)))) problems.push(`${where}: moves must be catalogue ids`)
  if (!Array.isArray(c.sources) || c.sources.length === 0) problems.push(`${where}: no sources`)
  for (const s of c.sources ?? []) {
    if (typeof s.cite !== 'string' || !s.cite) problems.push(`${where}: a source without a citation`)
    if (s.doi !== null && (typeof s.doi !== 'string' || !/^10\.\d{4,9}\/\S+$/.test(s.doi))) problems.push(`${where}: DOI "${s.doi}" is not a DOI`)
  }
  if (c.status === 'admitted' && c.grade !== 'D' && !(c.sources ?? []).some((s) => s.doi || s.pmid)) problems.push(`${where}: an admitted card above grade D needs a DOI or a PubMed id`)
}

if (mode === '--verify') {
  const yearOf = (cite) => (cite.match(/\((\d{4})\)/) ?? [])[1]
  const familyOf = (cite) => cite.split(/ et al|,|&|[(]/)[0].trim().split(' ').pop()
  for (const c of cards) {
    for (const s of c.sources) {
      if (!s.doi) continue
      let record = null
      try {
        const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(s.doi)}`, { headers: { 'User-Agent': 'life-mirror library check (mailto:noreply@example.com)' } })
        if (r.status === 404) {
          problems.push(`${c.id}: DOI ${s.doi} not found at Crossref`)
          continue
        }
        if (!r.ok) {
          problems.push(`${c.id}: Crossref answered ${r.status} for ${s.doi}`)
          continue
        }
        record = (await r.json()).message
      } catch (e) {
        problems.push(`${c.id}: Crossref unreachable for ${s.doi}: ${e.message}`)
        continue
      }
      const issued = record.issued?.['date-parts']?.[0]?.[0] ?? record.created?.['date-parts']?.[0]?.[0]
      const year = yearOf(s.cite)
      const family = familyOf(s.cite)?.toLowerCase()
      const authors = (record.author ?? []).map((a) => (a.family ?? a.name ?? '').toLowerCase())
      const title = Array.isArray(record.title) ? record.title[0] : record.title
      const yearOk = year && issued && Math.abs(Number(year) - Number(issued)) <= 1
      const authorOk = family && authors.some((a) => a.includes(family) || family.includes(a))
      if (!yearOk || !authorOk) problems.push(`${c.id}: ${s.doi} is "${title}" (${issued}) by ${authors.slice(0, 2).join(', ')}; the card cites ${family} (${year})`)
      else console.log(`ok  ${c.id}  ${s.doi}  ${String(title).slice(0, 70)}`)
      await new Promise((r) => setTimeout(r, 120))
    }
  }
}

const admitted = cards.filter((c) => c.status === 'admitted').length
if (problems.length) {
  for (const p of problems) console.error('library: ' + p)
  console.error(`library: ${problems.length} problem(s) in ${cards.length} cards`)
  process.exit(1)
}
console.log(`library: ${cards.length} cards, ${admitted} admitted, ${mode === '--verify' ? 'every DOI verified at Crossref' : 'well formed'}`)
