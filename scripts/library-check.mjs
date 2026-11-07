// The evidence library's check. `--check` reads src/library.json and refuses a card that is not
// well formed: an id used twice, a grade or a status outside the scale, a tag or a domain outside
// the vocabulary, a source without a citation, a review date that is not a date. `--verify`
// also asks Crossref about every DOI and refuses a card whose year or first author does not
// match what Crossref holds. Nothing here needs a token; nothing here is personal.
import { readFileSync } from 'node:fs'
import { judgedOf } from './library-spans.mjs'

// The second version's closed lists (P3), read from the file the app reads too.
const FIELDS = JSON.parse(readFileSync('src/libraryFields.json', 'utf8'))
const mode = process.argv[2] ?? '--check'
// LIBRARY_FILE reads a copy instead, so a test can run the check on a changed library (P3).
const cards = JSON.parse(readFileSync(process.env.LIBRARY_FILE ?? 'src/library.json', 'utf8'))
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
  if (c.size !== undefined && c.size !== 'medium' && c.size !== 'large') problems.push(`${where}: size "${c.size}" is neither medium nor large`)
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
  // The second version's fields (P3, 2026-11-06), each optional, each from its closed list.
  const closed = { origin: FIELDS.origin, design: FIELDS.design, outcomeDistance: FIELDS.outcomeDistance, comparator: FIELDS.comparator, heterogeneity: FIELDS.heterogeneity, biasRisk: FIELDS.biasRisk }
  for (const [field, list] of Object.entries(closed)) if (c[field] !== undefined && !list.includes(c[field])) problems.push(`${where}: ${field} "${c[field]}" outside its list`)
  for (const field of ['n', 'k']) if (c[field] !== undefined && !(Number.isInteger(c[field]) && c[field] > 0)) problems.push(`${where}: ${field} must be a whole number`)
  if (c.origin === 'indirect' && !c.mismatch) problems.push(`${where}: an indirect claim names how the studies differ (mismatch)`)
  for (const s of c.spans ?? []) {
    if (!FIELDS.spanFields.includes(s.field) || typeof s.source !== 'string' || !Number.isInteger(s.at) || !Number.isInteger(s.length) || s.length < 20 || !/^[0-9a-f]{16}$/.test(s.hash ?? '') || !['europepmc', 'pubmed', 'crossref', 'openalex'].includes(s.via)) problems.push(`${where}: a span is a field, a source, the provider its abstract came from, an offset, a length of twenty or more and a hash`)
    else if (!(c.sources ?? []).some((x) => x.doi === s.source || x.pmid === s.source)) problems.push(`${where}: a span's source ${s.source} is none of the card's sources`)
  }
  if (c.support !== undefined && (!FIELDS.verdicts.includes(c.support.verdict) || typeof c.support.run !== 'string' || !c.support.run)) problems.push(`${where}: a reader's verdict names its run and is supports, partly or doesNot`)
  // A card drafted through the second version is admitted only with spans and a reader other than its drafter saying it supports.
  if (c.drafted !== undefined) {
    if (typeof c.drafted.run !== 'string' || !c.drafted.run) problems.push(`${where}: drafted names its run`)
    if (c.status === 'admitted' && !(c.spans?.length && c.support?.verdict === 'supports' && c.support.run !== c.drafted.run)) problems.push(`${where}: admitted without spans and a reader other than its drafter saying it supports`)
    if (c.status === 'admitted' && c.support?.read !== judgedOf(c)) problems.push(`${where}: admitted, but its claim, effect or population is not the wording its reader judged`)
    if (!c.design || !c.origin) problems.push(`${where}: a card drafted through the second version records its design and its origin`)
  }
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
      // A card drafted through the second version (P3) names its source's title too, matched word for word on its first six words.
      const words = (t) => String(t ?? '').toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
      const titleOk = !c.drafted || words(s.cite).join(' ').includes(words(title).slice(0, 6).join(' '))
      if (!yearOk || !authorOk || !titleOk) problems.push(`${c.id}: ${s.doi} is "${title}" (${issued}) by ${authors.slice(0, 2).join(', ')}; the card cites ${family} (${year})${titleOk ? '' : ', under another title'}`)
      else console.log(`ok  ${c.id}  ${s.doi}  ${String(title).slice(0, 70)}`)
      await new Promise((r) => setTimeout(r, 120))
    }
    // A source with a PubMed id and no DOI is asked at PubMed, the year and the first author (P3).
    for (const s of c.sources) {
      if (s.doi || !s.pmid) continue
      try {
        const r = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${encodeURIComponent(s.pmid)}`)
        const doc = r.ok ? (await r.json())?.result?.[s.pmid] : null
        if (!doc || doc.error) {
          problems.push(`${c.id}: PMID ${s.pmid} not found at PubMed`)
          continue
        }
        const year = yearOf(s.cite)
        const family = familyOf(s.cite)?.toLowerCase()
        const first = String(doc.sortfirstauthor ?? doc.authors?.[0]?.name ?? '').toLowerCase()
        const pubYear = String(doc.pubdate ?? '').slice(0, 4)
        if (!(year && Math.abs(Number(year) - Number(pubYear)) <= 1 && family && first.includes(family))) problems.push(`${c.id}: PMID ${s.pmid} is ${first} (${pubYear}); the card cites ${family} (${year})`)
        else console.log(`ok  ${c.id}  PMID ${s.pmid}  ${String(doc.title).slice(0, 70)}`)
      } catch (e) {
        problems.push(`${c.id}: PubMed unreachable for ${s.pmid}: ${e.message}`)
      }
      await new Promise((r) => setTimeout(r, 350))
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
