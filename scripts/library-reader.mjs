// The evidence library's second reader (P3 of the AI-generated Paths design, 2026-11-06). A drafted claim
// is laid out beside its spanned passages for a reading run that did not draft it; that run marks each
// supports, partly or does not, with a reason in a line; the verdict is kept on the card. A card drafted
// through this pipeline is admitted only with "supports" from a run other than its drafter's. The layout
// holds the abstracts' passages, so it is written outside git (library/.cache/reader).
//
// node scripts/library-reader.mjs --prepare <batch> <id ...>              lays the claims out for a reader
// node scripts/library-reader.mjs --apply <verdicts.json> <batch.json>    keeps each verdict on its card
// node scripts/library-reader.mjs --admit <id ...>                          admits each card whose reader said supports
//
// Each laid-out claim carries the fingerprint of the words read (judgedOf); a verdict is kept only while
// the card still holds those words, and a card is admitted only on the words its reader judged.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { abstractOf, judgedOf } from './library-spans.mjs'

// LIBRARY_FILE works on a copy instead, so a test can run the reader on a changed library.
const LIBRARY = process.env.LIBRARY_FILE ?? 'src/library.json'
const OUT = 'library/.cache/reader'
const VERDICTS = ['supports', 'partly', 'doesNot']
const load = () => JSON.parse(readFileSync(LIBRARY, 'utf8'))
const save = (cards) => writeFileSync(LIBRARY, `${JSON.stringify(cards, null, 2)}\n`)

async function prepare(batch, ids) {
  if (!ids.length) throw new Error('name the cards to lay out: an empty list would lay out nothing on purpose')
  const cards = load()
  const out = []
  for (const id of ids) {
    const c = cards.find((x) => x.id === id)
    if (!c) throw new Error(`no card ${id}`)
    const passages = []
    for (const s of c.spans ?? []) {
      const text = await abstractOf(s.source, s.via)
      passages.push({ field: s.field, source: s.source, text: text ? text.slice(s.at, s.at + s.length) : null })
    }
    out.push({ id, read: judgedOf(c), claim: c.claim, effect: c.effect, population: c.population, caveats: c.caveats, origin: c.origin ?? null, mismatch: c.mismatch ?? null, sources: c.sources.map((s) => s.cite), drafted: c.drafted ?? null, passages })
  }
  mkdirSync(OUT, { recursive: true })
  const file = `${OUT}/${batch}.json`
  writeFileSync(file, `${JSON.stringify({ instructions: 'For each claim: does what its passages say support the claim, its effect and its population as written? Mark supports, partly or doesNot, with the reason in one line. Judge only from the passages shown; say partly when the claim says more than they do.', claims: out }, null, 2)}\n`)
  console.log(`reader: ${out.length} claims laid out in ${file}`)
}

function apply(file, batchFile) {
  const { run, verdicts } = JSON.parse(readFileSync(file, 'utf8'))
  if (typeof run !== 'string' || !run) throw new Error('the verdicts must name the reading run')
  if (!batchFile) throw new Error('name the batch the reader was given: a verdict counts only for the words laid out')
  const laid = new Map(JSON.parse(readFileSync(batchFile, 'utf8')).claims.map((c) => [c.id, c]))
  const cards = load()
  const problems = []
  for (const v of verdicts) {
    const c = cards.find((x) => x.id === v.id)
    const read = laid.get(v.id)?.read ?? (laid.has(v.id) ? judgedOf(laid.get(v.id)) : undefined)
    if (!c) problems.push(`${v.id}: no such card`)
    else if (read === undefined) problems.push(`${v.id}: not in the batch the reader was given`)
    else if (read !== judgedOf(c)) problems.push(`${v.id}: its claim, effect or population changed after it was laid out`)
    else if (!VERDICTS.includes(v.verdict)) problems.push(`${v.id}: verdict "${v.verdict}"`)
    else if (c.drafted?.run === run) problems.push(`${v.id}: read by the run that drafted it`)
    else if (typeof v.why !== 'string' || !v.why.trim() || v.why.split(/\s+/).length > 40) problems.push(`${v.id}: a reason in one line`)
    else c.support = { reader: 'claude', run, verdict: v.verdict, why: v.why.trim(), at: new Date().toISOString().slice(0, 10), read }
  }
  if (problems.length) throw new Error(`reader: refused, every reason:\n  ${problems.join('\n  ')}`)
  save(cards)
  console.log(`reader: ${verdicts.length} verdicts kept`)
}

function admit(ids) {
  if (!ids.length) throw new Error('name the cards to admit')
  const cards = load()
  const problems = []
  for (const id of ids) {
    const c = cards.find((x) => x.id === id)
    if (!c) problems.push(`${id}: no such card`)
    else if (!c.spans?.length) problems.push(`${id}: no spans`)
    else if (c.support?.verdict !== 'supports') problems.push(`${id}: its reader said ${c.support?.verdict ?? 'nothing yet'}`)
    else if (c.support.run === c.drafted?.run) problems.push(`${id}: read by its drafter`)
    else if (c.support.read !== judgedOf(c)) problems.push(`${id}: its claim, effect or population changed after its reading`)
  }
  if (problems.length) throw new Error(`reader: nothing admitted, every reason:\n  ${problems.join('\n  ')}`)
  for (const id of ids) cards.find((x) => x.id === id).status = 'admitted'
  save(cards)
  console.log(`reader: ${ids.length} cards admitted`)
}

const [mode, ...args] = process.argv.slice(2)
if (mode === '--prepare') await prepare(args[0], args.slice(1))
else if (mode === '--apply') apply(args[0], args[1])
else if (mode === '--admit') admit(args)
else {
  console.error('usage: --prepare <batch> <id ...> | --apply <verdicts.json> | --admit <id ...>')
  process.exit(2)
}
