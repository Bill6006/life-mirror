// Writes CATALOGUE.md from src/catalogue.json so the document and the app can never disagree.
// `node scripts/catalogue-md.mjs` writes it; `--check` fails if the file is out of date.
import { readFileSync, writeFileSync } from 'node:fs'

const data = JSON.parse(readFileSync(new URL('../src/catalogue.json', import.meta.url), 'utf8'))
const readings = JSON.parse(readFileSync(new URL('../src/readings.json', import.meta.url), 'utf8'))
const readingName = (id) => readings.readings.find((r) => r.id === id)?.name ?? id

const WINDOW = { nextBlock: 'next block', evening: 'this evening', nextMorning: 'next morning', sevenDays: 'seven days' }
const NEED = { outdoors: 'outdoors', kit: 'kit', anotherPerson: 'another person', freeHour: 'a free hour', daylight: 'daylight', quiet: 'quiet' }
const COUNTER = { study: 'study', conversations: 'conversations', timeWithHer: 'time with her', faith: 'faith', finishing: 'finishing' }
const BLOCK = { morning: 'morning', afternoon: 'afternoon', evening: 'evening' }
const nameOf = new Map(data.moves.map((m) => [m.id, m.name]))
const STRENGTH = { strong: 'strong', moderate: 'moderate', weak: 'thin', practice: 'practice, untested' }

let md = '# Life Mirror — the catalogue of moves\n\n'
md += `${data.moves.length} moves across ${data.families.length} families. Every entry carries its source and how strong that evidence is, `
md += 'how long it takes, the effort to start, what it needs, which readings it should move and over what window, what it conflicts with, '
md += 'what it replaces, and what it counts toward. Generated from `src/catalogue.json` by `scripts/catalogue-md.mjs`; edit the JSON, not this file.\n\n'
md += 'Strength of evidence: **strong** (meta-analyses or several trials), **moderate** (a good trial or review), **thin** (a small study, or evidence for something adjacent), **practice** (common advice, untested).\n\n'
md += 'Nothing here is wired yet. Yellow names entries to cut or reword; Green wires the catalogue as it stands.\n\n'

for (const f of data.families) {
  const list = data.moves.filter((m) => m.family === f.id)
  md += `## ${f.name}\n\n`
  for (const m of list) {
    md += `### ${m.name}\n\n`
    md += `${m.what}\n\n`
    md += `- Source: ${m.source.who} (${m.source.year}). ${m.source.what}. Evidence: ${STRENGTH[m.source.strength]}.\n`
    md += `- Takes: ${m.minutes === 0 ? 'no time, a decision' : `${m.minutes} min`} · effort to start: ${m.effort} · needs: ${m.needs.length ? m.needs.map((n) => NEED[n]).join(', ') : 'nothing'}\n`
    md += `- Should move: ${m.targets.map((t) => `${readingName(t.reading)} ${t.direction === 'up' ? '↑' : '↓'} (${WINDOW[t.window]})`).join(', ')}\n`
    md += `- When: ${m.when.map((b) => BLOCK[b]).join(', ')}\n`
    if (m.conflicts.length) md += `- Not alongside: ${m.conflicts.map((id) => nameOf.get(id) ?? id).join('; ')}\n`
    if (m.replaces.length) md += `- Stands in for: ${m.replaces.join(', ')}\n`
    if (m.countsToward.length) md += `- Counts toward: ${m.countsToward.map((c) => COUNTER[c]).join(', ')}\n`
    md += '\n'
  }
}

const target = new URL('../CATALOGUE.md', import.meta.url)
if (process.argv.includes('--check')) {
  let current = ''
  try {
    current = readFileSync(target, 'utf8').replace(/\r\n/g, '\n')
  } catch {
    current = ''
  }
  if (current !== md) {
    console.error('CATALOGUE.md is out of date with src/catalogue.json. Run: npm run catalogue')
    process.exit(1)
  }
  console.log('CATALOGUE.md is in sync')
} else {
  writeFileSync(target, md)
  console.log(`CATALOGUE.md written: ${data.moves.length} moves`)
}
