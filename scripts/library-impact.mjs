// The evidence library's impact map (P3 of the AI-generated Paths design, 2026-11-06): every card, and
// the Path elements that rest on it: a Path that cites it, a Path's decision record that cites it, a
// method that cites it, a move it speaks for. With --notices, every flag the currency check raised
// (library/currency.json), each with the elements it touches, as the weekly issue's text. A notice
// changes no claim by itself: a reading comes first.
//
// node scripts/library-impact.mjs              writes library/.cache/impact.json (outside git) and prints a summary
// node scripts/library-impact.mjs --notices    prints the notices in Markdown; nothing when there are none
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const cards = JSON.parse(readFileSync('src/library.json', 'utf8'))
const catalogue = JSON.parse(readFileSync('src/catalogue.json', 'utf8'))
const methods = existsSync('src/methods.json') ? JSON.parse(readFileSync('src/methods.json', 'utf8')) : { methods: [], blocked: [] }

/** Card id to the elements that cite it, each named path:<id>, path:<id>/decision:<id>, method:<id> or move:<id>. */
export function impactMap() {
  const map = new Map(cards.map((c) => [c.id, new Set((c.moves ?? []).map((m) => `move:${m}`))]))
  const add = (id, element) => (map.get(id) ?? map.set(id, new Set()).get(id)).add(element)
  for (const p of catalogue.paths) {
    for (const id of p.cards ?? []) add(id, `path:${p.id}`)
    for (const d of p.decisions ?? []) for (const id of d.cards ?? []) add(id, `path:${p.id}/decision:${d.id}`)
  }
  for (const m of methods.methods ?? []) for (const id of m.cards ?? []) add(id, `method:${m.id}`)
  for (const b of methods.blocked ?? []) if (b.card) add(b.card, `blocked:${b.id}`)
  return Object.fromEntries([...map.entries()].map(([id, set]) => [id, [...set].sort()]))
}

const map = impactMap()
if (process.argv[2] === '--notices') {
  const currency = existsSync('library/currency.json') ? JSON.parse(readFileSync('library/currency.json', 'utf8')) : { flags: [] }
  const flags = (currency.flags ?? []).filter((f) => f.kind !== 'stale')
  if (flags.length) {
    const lines = [`Evidence notices, checked ${currency.checkedOn ?? 'today'}: ${flags.length}. Each needs a reading before any claim changes.`, '']
    for (const f of flags) lines.push(`- **${f.kind}**, card \`${f.id}\`: ${f.detail}. Rests on it: ${(map[f.id] ?? []).join(', ') || 'nothing in the app'}.`)
    console.log(lines.join('\n'))
  }
} else {
  mkdirSync('library/.cache', { recursive: true })
  writeFileSync('library/.cache/impact.json', `${JSON.stringify(map, null, 2)}\n`)
  const cited = Object.values(map).filter((x) => x.length).length
  console.log(`impact: ${Object.keys(map).length} cards, ${cited} with something in the app resting on them`)
}
