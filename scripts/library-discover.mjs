// The library builder, step one: discovery. For each topic in library/topics.json, ask three
// free sources for reviews, meta-analyses and well-cited trials: Europe PMC (no key, no budget),
// OpenAlex (a small free daily budget; one request per topic), and Semantic Scholar (throttled
// without a key; S2_API_KEY, when set, is a free key that lifts it). A source that refuses is
// left alone for the rest of the run. A paper is kept only when it carries most of the topic's
// own words, has an abstract, is a review, a meta-analysis or a trial (or is cited five hundred
// times), and is not already in the library. Ordered by relevance before citations. No personal
// data anywhere. Usage: node scripts/library-discover.mjs [--max-per-topic 6] [--topics N]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const option = (name, fallback) => (args.includes(name) ? Number(args[args.indexOf(name) + 1]) : fallback)
const maxPerTopic = option('--max-per-topic', 6)
// `--topics N` takes the first N topics only, for a quick local run.
const topics = JSON.parse(readFileSync('library/topics.json', 'utf8')).topics.slice(0, option('--topics', Infinity))
const library = JSON.parse(readFileSync('src/library.json', 'utf8'))
const known = new Set(library.flatMap((c) => c.sources.map((s) => (s.doi ?? '').toLowerCase())).filter(Boolean))
const MAILTO = 'library-builder@life-mirror.invalid'
const HEADERS = { 'User-Agent': `life-mirror library builder (https://github.com/Bill6006/life-mirror; mailto:${MAILTO})`, accept: 'application/json' }
const REVIEW_WORDS = /meta-analy|systematic review|review|randomi[sz]ed|trial|cohort|longitudinal|replication/i
const refusing = new Set()

const pause = (ms) => new Promise((r) => setTimeout(r, ms))

async function getJson(url, extraHeaders = {}) {
  const host = new URL(url).host
  if (refusing.has(host)) return null
  for (let attempt = 0; attempt < 2; attempt++) {
    let r
    try {
      r = await fetch(url, { headers: { ...HEADERS, ...extraHeaders } })
    } catch (e) {
      console.log(`  ${host}: ${e.message}`)
      return null
    }
    if (r.status === 429) {
      const body = await r.text().catch(() => '')
      if (/budget|Insufficient/i.test(body) || attempt === 1) {
        console.log(`  ${host} refused (429); leaving it alone for this run`)
        refusing.add(host)
        return null
      }
      await pause(5000)
      continue
    }
    if (r.status >= 500) {
      await pause(3000)
      continue
    }
    if (!r.ok) {
      console.log(`  ${host} answered ${r.status}`)
      return null
    }
    return r.json()
  }
  return null
}

/** OpenAlex: inverted abstracts back into text. */
function abstractOf(inverted) {
  if (!inverted || typeof inverted !== 'object') return null
  const words = []
  for (const [word, positions] of Object.entries(inverted)) for (const p of positions) words[p] = word
  return words.filter(Boolean).join(' ')
}

const cleanDoi = (d) =>
  String(d ?? '')
    .replace(/^https?:\/\/doi\.org\//, '')
    .toLowerCase() || null

async function europePmc(query, limit) {
  // Europe PMC matches loosely; its own words joined with AND, ranked by relevance, keep it on the topic.
  const terms = keyWords(query)
    .map((w) => `"${w}"`)
    .join(' AND ')
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(terms || query)}&format=json&pageSize=${limit * 3}&resultType=core`
  const j = await getJson(url)
  return (j?.resultList?.result ?? []).map((r) => ({
    doi: cleanDoi(r.doi),
    title: r.title ?? '',
    year: r.pubYear ? Number(r.pubYear) : null,
    citations: r.citedByCount ?? 0,
    authors: String(r.authorString ?? '')
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean)
      .slice(0, 3),
    venue: r.journalInfo?.journal?.title ?? null,
    abstract: r.abstractText ?? null,
    types: r.pubTypeList?.pubType ?? [],
    from: 'europepmc',
  }))
}

async function openAlex(query, limit) {
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&filter=type:article|review,from_publication_date:2000-01-01,cited_by_count:>30&per-page=${limit * 2}&mailto=${MAILTO}&select=id,doi,title,publication_year,cited_by_count,authorships,abstract_inverted_index,primary_location`
  const j = await getJson(url)
  return (j?.results ?? []).map((w) => ({
    doi: cleanDoi(w.doi),
    title: w.title ?? '',
    year: w.publication_year ?? null,
    citations: w.cited_by_count ?? 0,
    authors: (w.authorships ?? []).slice(0, 3).map((a) => a.author?.display_name).filter(Boolean),
    venue: w.primary_location?.source?.display_name ?? null,
    abstract: abstractOf(w.abstract_inverted_index),
    types: [],
    from: 'openalex',
  }))
}

async function semanticScholar(query, limit) {
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit * 2}&fields=title,year,citationCount,externalIds,abstract,authors,venue,publicationTypes,tldr`
  const j = await getJson(url, process.env.S2_API_KEY ? { 'x-api-key': process.env.S2_API_KEY } : {})
  return (j?.data ?? []).map((p) => ({
    doi: cleanDoi(p.externalIds?.DOI),
    title: p.title ?? '',
    year: p.year ?? null,
    citations: p.citationCount ?? 0,
    authors: (p.authors ?? []).slice(0, 3).map((a) => a.name).filter(Boolean),
    venue: p.venue || null,
    abstract: p.abstract ?? null,
    types: p.publicationTypes ?? [],
    tldr: p.tldr?.text ?? null,
    from: 'semanticscholar',
  }))
}

/** The query's own words, the ones that carry it, for a relevance check on what comes back. */
function keyWords(query) {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 5 && !/^(meta-analy|systematic|review|randomi|trial|cohort|longitudinal|experiment|adults|healthy|effect|outcomes?)/.test(w))
}

/** How many of the topic's own words the paper carries in its title and abstract; most of them, or it is not about the topic. */
function hits(query, w) {
  const words = [...new Set(keyWords(query).map((k) => k.replace(/s$/, '')))]
  const text = `${w.title} ${w.abstract ?? ''}`.toLowerCase()
  return { hits: words.filter((k) => text.includes(k)).length, needed: Math.min(3, words.length) }
}

const candidates = []
const seen = new Set()
for (const t of topics) {
  const found = [...(await europePmc(t.query, maxPerTopic)), ...(await openAlex(t.query, maxPerTopic)), ...(await semanticScholar(t.query, maxPerTopic))]
  // Relevance first, then the kind of paper, then how much it is cited; never citations alone, which favours the famous over the pertinent.
  const scored = found
    .filter((w) => w.doi && w.abstract && !known.has(w.doi))
    .map((w) => ({ w, ...hits(t.query, w), reviewish: REVIEW_WORDS.test(w.title) || (w.types ?? []).some((x) => /review|meta-analysis|trial/i.test(x)) }))
    .filter((x) => x.hits >= x.needed && (x.reviewish || x.w.citations >= 500))
    .sort((a, b) => b.hits - a.hits || Number(b.reviewish) - Number(a.reviewish) || b.w.citations - a.w.citations)
  let kept = 0
  for (const { w } of scored) {
    if (kept >= maxPerTopic) break
    if (seen.has(w.doi)) continue
    seen.add(w.doi)
    kept++
    candidates.push({ topic: t.query, tags: t.tags, domain: t.domain, ...w })
  }
  console.log(`  ${t.query}: ${kept} kept of ${found.length}`)
  await pause(1200)
}
candidates.sort((a, b) => b.citations - a.citations)

mkdirSync('library', { recursive: true })
writeFileSync('library/candidates.json', JSON.stringify({ discoveredOn: new Date().toISOString().slice(0, 10), topics: topics.length, sourcesRefused: [...refusing], candidates }, null, 2) + '\n')
console.log(`library: ${candidates.length} candidates from ${topics.length} topics, none already in the library${refusing.size ? `; refused by ${[...refusing].join(', ')}` : ''}`)
