// The library builder, step two: drafts. Each candidate with an abstract goes to a model on
// Workers AI, through an API token scoped to Workers AI alone (it can touch nothing else), and
// comes back as a draft claim card in the library's shape, status "draft", grade proposed and
// never trusted: a person admits a card by moving it into src/library.json in a pull request.
// Without CF_ACCOUNT_ID and CF_AI_TOKEN the step writes the candidates through unchanged, so
// the pull request still carries what was found. Usage: node scripts/library-draft.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const account = process.env.CF_ACCOUNT_ID
const token = process.env.CF_AI_TOKEN
const model = process.env.CF_AI_MODEL || '@cf/openai/gpt-oss-120b'
const found = JSON.parse(readFileSync('library/candidates.json', 'utf8'))
const vocabulary = JSON.parse(readFileSync('src/libraryTags.json', 'utf8'))
const today = new Date().toISOString().slice(0, 10)

const SYSTEM = `You write claim cards for an evidence library. From one paper's title, abstract and metadata, write ONE card as JSON with exactly these fields:
id (kebab-case, from the claim), claim (one testable sentence in plain words, what the study shows, hedged as the evidence warrants), domain (one of: ${vocabulary.domains.join(', ')}), tags (from this list only: ${vocabulary.tags.join(', ')}), grade (A: several meta-analyses or large replicated trials; B: one meta-analysis or several trials; C: one trial or strong observational work; D: theory, a book or small studies), replication (replicated, mixed, failed, untested), effect (the size as reported, with n where given), population (who was studied), caveats (what it does not show), app (one sentence on what it means for a daily-habits app that offers one small move at a time, tracks study steps with cues, and reads mood, energy, focus, stress, sleep and loneliness).
Rules: never overstate; if the abstract reports no effect size say so; a single study is grade C at most; prefer "associated with" for observational work; no names of people; JSON only.`

async function draft(c) {
  const user = `Title: ${c.title}\nYear: ${c.year}\nAuthors: ${c.authors.join(', ')}\nVenue: ${c.venue ?? ''}\nCitations: ${c.citations}\nDOI: ${c.doi}\nAbstract: ${c.abstract}`
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }], max_tokens: 900, temperature: 0.2 }),
  })
  if (!r.ok) throw new Error(`Workers AI answered ${r.status}`)
  const j = await r.json()
  const text = typeof j.result?.response === 'string' ? j.result.response : JSON.stringify(j.result ?? '')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  const card = JSON.parse(text.slice(start, end + 1))
  return {
    id: String(card.id ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    claim: String(card.claim ?? ''),
    domain: vocabulary.domains.includes(card.domain) ? card.domain : c.domain,
    tags: [...new Set([...(Array.isArray(card.tags) ? card.tags.filter((t) => vocabulary.tags.includes(t)) : []), ...c.tags])],
    grade: ['A', 'B', 'C', 'D'].includes(card.grade) ? card.grade : 'D',
    replication: ['replicated', 'mixed', 'failed', 'untested'].includes(card.replication) ? card.replication : 'untested',
    effect: String(card.effect ?? ''),
    population: String(card.population ?? ''),
    sources: [{ cite: `${c.authors.join(', ')} (${c.year}). ${c.title}. ${c.venue ?? ''}`.trim(), doi: c.doi }],
    caveats: String(card.caveats ?? ''),
    app: String(card.app ?? ''),
    reviewed: today,
    status: 'draft',
    draftedFrom: { topic: c.topic, model, citations: c.citations },
  }
}

const drafts = []
const skipped = []
if (!account || !token) {
  console.log('library: no Workers AI token in the environment; writing the candidates through as drafts to read by hand')
  for (const c of found.candidates) drafts.push({ id: null, status: 'candidate', sources: [{ cite: `${c.authors.join(', ')} (${c.year}). ${c.title}. ${c.venue ?? ''}`, doi: c.doi }], tags: c.tags, domain: c.domain, abstract: c.abstract, tldr: c.tldr ?? null, citations: c.citations, topic: c.topic })
} else {
  for (const c of found.candidates) {
    if (!c.abstract) {
      skipped.push({ doi: c.doi, why: 'no abstract' })
      continue
    }
    try {
      const d = await draft(c)
      if (d && d.id && d.claim.length >= 40) drafts.push(d)
      else skipped.push({ doi: c.doi, why: 'the model returned no card' })
    } catch (e) {
      skipped.push({ doi: c.doi, why: e.message })
    }
    await new Promise((r) => setTimeout(r, 300))
  }
}
writeFileSync('library/drafts.json', JSON.stringify({ draftedOn: today, model: account && token ? model : null, drafts, skipped }, null, 2) + '\n')
console.log(`library: ${drafts.length} drafts, ${skipped.length} skipped`)
