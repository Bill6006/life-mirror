// The evidence library's spans (P3 of the AI-generated Paths design, 2026-11-06). A card's claim rests on
// passages of its sources' abstracts, kept by reference and never by copy: the source (a DOI or a PubMed
// id), the passage's offset and length in the abstract as fetched and tidied, and a hash of the passage.
// No publisher's text enters the repository; the abstracts are cached outside git (library/.cache).
//
// node scripts/library-spans.mjs --check            every card's spans: each hash at its offset, and every
//                                                   number in the card's effect standing in a spanned passage
// node scripts/library-spans.mjs --locate <id> <field> <source> "<passage>" [--write]
//                                                   finds a passage in a source's abstract and prints its
//                                                   reference; --write adds it to the card
// node scripts/library-spans.mjs --sentence <id> <field> <source> <fragment ...> [--write]
//                                                   the one sentence holding every fragment (numbers, a few
//                                                   words), kept by reference: nothing is typed out or stored
// node scripts/library-spans.mjs --passages <id>    prints a card's spanned passages, for a reader's eyes only
//
// Free APIs, no key: Europe PMC first, then PubMed. Nothing here is personal.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const LIBRARY = 'src/library.json'
const CACHE = 'library/.cache/abstracts'
const UA = { 'User-Agent': 'life-mirror library spans (mailto:noreply@example.com)' }

/** An abstract tidied the one way every check reads it: tags out, entities decoded, white space single. */
export function tidy(text) {
  return String(text)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

export function hashOf(passage) {
  return createHash('sha256').update(passage, 'utf8').digest('hex').slice(0, 16)
}

// The words a second reader judges: a verdict holds this fingerprint, so a claim, effect or population
// changed after its reading no longer counts as read.
export function judgedOf(card) {
  return hashOf(JSON.stringify([card.claim, card.effect ?? null, card.population ?? null]))
}

const keyOf = (source) => source.replace(/[^a-z0-9.]+/gi, '_')

async function fromEuropePmc(source) {
  const q = source.startsWith('10.') ? `DOI:"${source}"` : `EXT_ID:${source} AND SRC:MED`
  const r = await fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(q)}&resultType=core&format=json&pageSize=1`, { headers: UA })
  if (!r.ok) return null
  const hit = (await r.json())?.resultList?.result?.[0]
  return hit?.abstractText ? tidy(hit.abstractText) : null
}

async function fromPubMed(source) {
  let pmid = source
  if (source.startsWith('10.')) {
    const s = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&term=${encodeURIComponent(`${source}[doi]`)}`, { headers: UA })
    if (!s.ok) return null
    pmid = (await s.json())?.esearchresult?.idlist?.[0]
    if (!pmid) return null
  }
  const r = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${encodeURIComponent(pmid)}&rettype=abstract&retmode=xml`, { headers: UA })
  if (!r.ok) return null
  const xml = await r.text()
  const parts = [...xml.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)].map((m) => m[1])
  return parts.length ? tidy(parts.join(' ')) : null
}

async function fromCrossref(source) {
  if (!source.startsWith('10.')) return null
  const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(source)}`, { headers: UA })
  if (!r.ok) return null
  const a = (await r.json())?.message?.abstract
  return a ? tidy(a.replace(/<jats:title>[^<]*<\/jats:title>/g, ' ')) : null
}

async function fromOpenAlex(source) {
  const id = source.startsWith('10.') ? `doi:${source}` : `pmid:${source}`
  const r = await fetch(`https://api.openalex.org/works/${encodeURIComponent(id)}?select=abstract_inverted_index`, { headers: UA })
  if (!r.ok) return null
  const inv = (await r.json())?.abstract_inverted_index
  if (!inv) return null
  const words = []
  for (const [word, places] of Object.entries(inv)) for (const k of places) words[k] = word
  return tidy(words.filter((w) => w !== undefined).join(' '))
}

/** The free providers, in the order they are asked; a span keeps which one its abstract came from. */
export const PROVIDERS = { europepmc: fromEuropePmc, pubmed: fromPubMed, crossref: fromCrossref, openalex: fromOpenAlex }

/** A source's abstract, tidied, and the provider it came from: from the cache, else fetched and cached. A span names its provider, so a later check reads the same text. Null when no free provider holds one. */
export async function abstractFrom(source, via) {
  const order = via ? [via] : Object.keys(PROVIDERS)
  for (const name of order) {
    const file = `${CACHE}/${name}/${keyOf(source)}.txt`
    if (existsSync(file)) return { text: readFileSync(file, 'utf8'), via: name }
    const text = await PROVIDERS[name]?.(source).catch(() => null)
    if (text) {
      mkdirSync(`${CACHE}/${name}`, { recursive: true })
      writeFileSync(file, text)
      return { text, via: name }
    }
  }
  return null
}

/** A source's abstract text alone, from the first provider holding one (or the one named). */
export async function abstractOf(source, via) {
  return (await abstractFrom(source, via))?.text ?? null
}

/** The numbers a text states: 0.74 and .74 alike, a percent as its number, a range's two ends. */
export function numbersIn(text) {
  return [...String(text).matchAll(/(?<![\w.])(\d*\.\d+|\d+)(?!\d)/g)].map((m) => Number(m[1])).filter((n) => Number.isFinite(n))
}

/** Each number of a card's effect that stands in none of its spanned passages. */
export function ungrounded(effect, passages) {
  const there = new Set(passages.flatMap(numbersIn).map((n) => n.toFixed(4)))
  return [...new Set(numbersIn(effect).map((n) => n.toFixed(4)))].filter((n) => !there.has(n)).map(Number)
}

async function check() {
  const cards = JSON.parse(readFileSync(LIBRARY, 'utf8'))
  const problems = []
  let spans = 0
  for (const c of cards) {
    if (!c.spans?.length) continue
    const passages = []
    for (const s of c.spans) {
      spans++
      const text = await abstractOf(s.source, s.via)
      if (!text) {
        problems.push(`${c.id}: no abstract found for ${s.source}${s.via ? ` at ${s.via}` : ''}`)
        continue
      }
      const passage = text.slice(s.at, s.at + s.length)
      if (passage.length !== s.length || hashOf(passage) !== s.hash) problems.push(`${c.id}: the ${s.field} span at ${s.at} in ${s.source} no longer matches its passage`)
      else passages.push(passage)
    }
    const missing = ungrounded(c.effect, passages)
    if (missing.length) problems.push(`${c.id}: numbers in its effect that no spanned passage states: ${missing.join(', ')}`)
  }
  if (problems.length) {
    console.error(`spans: ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n  ${problems.join('\n  ')}`)
    process.exit(1)
  }
  console.log(`spans: ${spans} spans on ${cards.filter((c) => c.spans?.length).length} cards, every hash in place and every effect number grounded`)
}

async function locate(id, field, source, quote, write) {
  const found = await abstractFrom(source)
  if (!found) throw new Error(`no abstract found for ${source}`)
  const { text, via } = found
  const wanted = tidy(quote)
  const at = text.indexOf(wanted)
  if (at === -1) throw new Error(`the passage is not in the abstract of ${source} as fetched`)
  if (text.indexOf(wanted, at + 1) !== -1) throw new Error('the passage appears more than once: give a longer one')
  const span = { field, source, via, at, length: wanted.length, hash: hashOf(wanted) }
  if (write) {
    const cards = JSON.parse(readFileSync(LIBRARY, 'utf8'))
    const card = cards.find((c) => c.id === id)
    if (!card) throw new Error(`no card ${id}`)
    card.spans = [...(card.spans ?? []).filter((s) => !(s.source === span.source && s.at === span.at)), span]
    writeFileSync(LIBRARY, `${JSON.stringify(cards, null, 2)}\n`)
  }
  console.log(JSON.stringify(span))
}

/** The sentences of an abstract as tidied, each with its offset. */
export function sentencesOf(text) {
  // A sentence ends at a stop followed by space and a capital or a bracket: a decimal such as 0.74 never ends one.
  const out = []
  let start = 0
  for (const m of text.matchAll(/(?<=[.!?])\s+(?=[A-Z(\[])/g)) {
    out.push({ at: start, text: text.slice(start, m.index) })
    start = m.index + m[0].length
  }
  if (start < text.length) out.push({ at: start, text: text.slice(start) })
  return out.filter((s) => s.text.trim().length > 0)
}

/** The one sentence of a source's abstract that holds every fragment, kept by reference: no passage is typed or stored. */
async function sentence(id, field, source, fragments, write) {
  const found = await abstractFrom(source)
  if (!found) throw new Error(`no abstract found for ${source}`)
  const { text, via } = found
  const hits = sentencesOf(text).filter((s) => fragments.every((f) => s.text.includes(f)))
  if (hits.length !== 1) throw new Error(`${hits.length} sentences of ${source} hold ${fragments.map((f) => `“${f}”`).join(' and ')}: give fragments that pick out one`)
  const span = { field, source, via, at: hits[0].at, length: hits[0].text.length, hash: hashOf(text.slice(hits[0].at, hits[0].at + hits[0].text.length)) }
  if (span.length < 20) throw new Error('that sentence is too short to carry a claim')
  if (write) {
    const cards = JSON.parse(readFileSync(LIBRARY, 'utf8'))
    const card = cards.find((c) => c.id === id)
    if (!card) throw new Error(`no card ${id}`)
    card.spans = [...(card.spans ?? []).filter((s) => !(s.source === span.source && s.at === span.at)), span]
    writeFileSync(LIBRARY, `${JSON.stringify(cards, null, 2)}\n`)
  }
  console.log(JSON.stringify(span))
}

async function passagesOf(id) {
  const cards = JSON.parse(readFileSync(LIBRARY, 'utf8'))
  const card = cards.find((c) => c.id === id)
  if (!card) throw new Error(`no card ${id}`)
  for (const s of card.spans ?? []) {
    const text = await abstractOf(s.source, s.via)
    console.log(`[${s.field}] ${s.source} @${s.at}: ${text ? text.slice(s.at, s.at + s.length) : '(no abstract)'}`)
  }
}

const [mode, ...args] = process.argv.slice(2)
// Run as a script, not when another script imports abstractOf.
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('library-spans.mjs')) {
  if (mode === '--check') await check()
  else if (mode === '--locate') await locate(args[0], args[1], args[2], args[3], args.includes('--write'))
  else if (mode === '--passages') await passagesOf(args[0])
  else if (mode === '--sentence') await sentence(args[0], args[1], args[2], args.slice(3).filter((a) => a !== '--write'), args.includes('--write'))
  else {
    console.error('usage: --check | --locate <id> <field> <source> "<passage>" [--write] | --sentence <id> <field> <source> <fragment ...> [--write] | --passages <id>')
    process.exit(2)
  }
}
