// Writes CATALOGUE.md from src/catalogue.json so the document and the app can never disagree.
// `node scripts/catalogue-md.mjs` writes it; `--check` fails if the file is out of date.
import { readFileSync, writeFileSync } from 'node:fs'

const data = JSON.parse(readFileSync(new URL('../src/catalogue.json', import.meta.url), 'utf8'))
const readings = JSON.parse(readFileSync(new URL('../src/readings.json', import.meta.url), 'utf8'))
const readingName = (id) => readings.readings.find((r) => r.id === id)?.name ?? id
const library = JSON.parse(readFileSync(new URL('../src/library.json', import.meta.url), 'utf8'))
const cardOf = new Map(library.map((c) => [c.id, c]))
const GRADE = { A: 'strong evidence', B: 'good evidence', C: 'some evidence', D: 'thin evidence' }
const SETTING = { recurring: 'a recurring place', errand: 'an errand', group: 'a group', oneToOne: 'one to one', remote: 'a call or a message', solo: 'on your own' }
const ADVANCE = { counts: 'moves by the rule', 'counts or a date': 'moves by the rule, or when you say you have a date', declared: 'moves only when you declare it' }

const WINDOW = { nextBlock: 'next block', laterToday: 'later that day', evening: 'this evening', nextMorning: 'next morning', sevenDays: 'seven days' }
const NEED = { outdoors: 'outdoors', kit: 'kit', anotherPerson: 'another person', freeHour: 'a free hour', daylight: 'daylight', quiet: 'quiet' }
const COUNTER = { study: 'study', conversations: 'conversations', timeWithHer: 'time with her', faith: 'faith', finishing: 'finishing' }
const BLOCK = { morning: 'morning', afternoon: 'afternoon', evening: 'evening' }
const TAG = { outdoors: 'outdoors', withPeople: 'with people', short: 'short', lowEffort: 'low effort', pleasure: 'pleasure', mastery: 'mastery', connection: 'connection' }
const EFFECT = { 0: 'no change, until the record says', 0.1: 'a tenth', 0.2: 'a fifth', 0.3: 'a third', 0.4: 'four tenths', 0.5: 'half' }
const SETUP = {
  lateness: 'a setup for chronic lateness',
  friction: 'removes a step before a move, for good',
  appointment: 'closes an avoided task, for good',
  default: 'a default that holds without reminders',
}
const NECESSITY = { food: 'food', teeth: 'teeth', shower: 'the shower' }
const nameOf = new Map(data.moves.map((m) => [m.id, m.name]))
const STRENGTH = { strong: 'strong', moderate: 'moderate', weak: 'thin', practice: 'practice, untested' }
const proposed = data.moves.filter((m) => m.status === 'proposed')

const source = (s) => `${s.who} (${s.year}). ${s.what}. Evidence: ${STRENGTH[s.strength]}.`
const arrow = (d) => (d === 'up' ? '↑' : '↓')

let md = '# Life Mirror — the catalogue of moves\n\n'
md += `${data.moves.length} moves across ${data.families.length} families, ${proposed.length} of them proposed and not yet wired. Every entry carries its source and how strong that evidence is, `
md += 'how long it takes, the effort to start, what being given it costs, its learned tags, its starting belief, what it needs, which readings it should move and over what window, what it conflicts with, '
md += 'what it replaces, and what it counts toward. Generated from `src/catalogue.json` by `scripts/catalogue-md.mjs`; edit the JSON, not this file.\n\n'
md += 'Strength of evidence: **strong** (meta-analyses or several trials), **moderate** (a good trial or review), **thin** (a small study, or evidence for something adjacent), **practice** (common advice, untested).\n\n'
md += 'Proposed entries, tags, beliefs and trades are content to read and veto. Yellow names what to cut or reword; Green wires it. Until then nothing here changes what is offered.\n\n'

// The paths (Parts 23 and 26): each stage with its reps, the rule, what is counted and never counted, what is left out, and the evidence.
md += '## Paths\n\n'
md += 'Two paths, each a staged curriculum of reps, for you to read and veto. Nothing here is wired or offered until Green; the reps marked proposed join the candidates only then.\n\n'
for (const p of data.paths) {
  md += `### ${p.name}\n\n${p.what}\n\n`
  for (const st of p.stages) {
    md += `#### Stage ${st.n} · ${st.name}\n\n${st.what}\n\n- Not progress: ${st.notProgress}\n- How it moves: ${ADVANCE[st.advance ?? 'counts']}\n`
    const reps = data.moves.filter((m) => m.path?.[p.id]?.stage === st.n)
    for (const m of reps) {
      const place = m.path[p.id]
      const bits = [place.advances ? 'moves the stage' : 'moves no stage']
      if (m.settings?.length) bits.push(`where: ${m.settings.map((k) => SETTING[k]).join(', ')}`)
      if (m.channel) bits.push(`channel: ${m.channel}`)
      if (m.status === 'proposed') bits.push('proposed')
      md += `- **${m.name}** (${bits.join(' · ')}). Attention on: ${m.cue} Drop: ${m.crutch} ${m.doneWhen}${m.guardrail ? ` ${m.guardrail}` : ''}\n`
    }
    for (const a of (p.acts ?? []).filter((x) => x.stage === st.n)) {
      const questions = a.questions ? ` The questions: ${a.questions.map((q, i) => `(${i + 1}) ${q.text}${q.helpOnYes ? ' A yes shows the help.' : ''}`).join(' ')}` : ''
      md += `- **${a.name}.** ${a.what}${questions}${a.help ? ` The help the app shows itself: ${a.help}` : ''} Source: ${source(a.source)}\n`
    }
    md += '\n'
  }
  md += `#### How a stage is reached\n\n${p.rule.note}\n\n`
  for (const src of p.rule.sources) md += `- Source: ${source(src)}\n`
  md += '\nKinds of setting:\n\n'
  for (const [k, v] of Object.entries(p.settingKinds)) md += `- ${SETTING[k]}: ${v}\n`
  md += '\n'
  for (const ch of p.channels ?? []) md += `#### Channel: ${ch.name}\n\n${ch.what}\n\n`
  md += `#### Counted, and never counted\n\n${p.counted}\n\nNever counted, stored or asked: ${p.neverCounted.join('; ')}.\n\n`
  md += '#### Left out, and why\n\n'
  for (const e of p.excluded) md += `- ${e.what}: ${e.why}\n`
  md += '\n'
  if (p.parents) md += `#### For a parent\n\n${p.parents}\n\n`
  md += '#### The evidence\n\nClaim cards, each source verified at Crossref: drafts until Green, and the disputed ones are never cited.\n\n'
  for (const id of p.cards) {
    const c = cardOf.get(id)
    if (!c) continue
    md += `- **${GRADE[c.grade]}** (${c.status === 'disputed' ? 'disputed, never cited' : c.status === 'draft' ? 'draft, admitted at Green' : 'admitted'}). ${c.claim} ${c.sources.map((x) => x.cite).join(' ')}\n`
  }
  md += '\n'
}

md += '## Learned tags and their starting beliefs\n\n'
md += 'From Phase 10 the app estimates each tag’s effect from your record, starting from these. No more learned tags than these.\n\n'
for (const t of data.learnedTags) {
  md += `### ${t.name}\n\n${t.what}\n\n- Starting belief: ${t.prior.note}.\n- Source: ${source(t.source)}\n\n`
}

md += '## Filter tags\n\nThese only select. They are never learned.\n\n'
for (const t of data.filterTags) md += `- **${t.name}.** ${t.what}\n`
md += '\n'

for (const f of data.families) {
  const list = data.moves.filter((m) => m.family === f.id)
  md += `## ${f.name}\n\n`
  if (f.id === 'money') md += `${data.proposals.money.note}\n\n`
  if (f.id === 'charisma') md += `${data.proposals.charisma.note}\n\n`
  for (const m of list) {
    md += `### ${m.name}\n\n`
    const status = []
    if (m.status === 'proposed') status.push('Proposed: read and veto; joins the candidates at Green')
    if (m.parked) status.push('Parked: shown here, never offered')
    if (m.ladder) status.push(`rung ${m.ladder.rung} of the participation ladder`)
    if (m.setup) status.push(m.setup.kind === 'necessity' ? `a setup whose target is a necessity: ${NECESSITY[m.setup.necessity]}` : SETUP[m.setup.kind])
    if (m.passive) status.push('proposed as a passive item')
    for (const p of data.paths) if (m.path?.[p.id]) status.push(`${p.name} path, stage ${m.path[p.id].stage}, ${m.path[p.id].advances ? 'moves the stage' : 'moves no stage'}`)
    if (status.length) md += `_${status.join(' · ')}_\n\n`
    md += `${m.what}\n\n`
    md += `- Source: ${source(m.source)}\n`
    md += `- Takes: ${m.minutes === 0 ? 'no time, a decision' : `${m.minutes} min`}${m.span ? ` (done after ${m.span} min)` : ''} · effort to start: ${m.effort} · cost to assign: ${m.costToAssign} · needs: ${m.needs.length ? m.needs.map((n) => NEED[n]).join(', ') : 'nothing'}\n`
    md += `- Tags: ${[...m.tags.ingredients.map((t) => TAG[t]), ...m.tags.reward.map((t) => TAG[t])].join(', ')}${m.tags.ingredients.length + m.tags.reward.length ? ' · ' : ''}intensity ${m.tags.intensity}\n`
    md += `- Should move: ${m.targets.map((t) => `${readingName(t.reading)} ${arrow(t.direction)} (${WINDOW[t.window]})`).join(', ')}\n`
    const first = m.targets[0]
    md += `- Starting belief: ${readingName(first.reading)} ${arrow(first.direction)} by about ${EFFECT[m.prior.effect] ?? m.prior.effect} of a step over the ${WINDOW[first.window]} · ${m.prior.note}.\n`
    md += `- When: ${m.when.map((b) => BLOCK[b]).join(', ')}\n`
    if (m.conflicts.length) md += `- Not alongside: ${m.conflicts.map((id) => nameOf.get(id) ?? id).join('; ')}\n`
    if (m.replaces.length) md += `- Stands in for: ${m.replaces.join(', ')}\n`
    if (m.countsToward.length) md += `- Counts toward: ${m.countsToward.map((c) => COUNTER[c]).join(', ')}\n`
    md += '\n'
  }
}

md += '## Proposed trades\n\n'
md += `- ${data.proposals.money.note}\n`
md += `- ${data.proposals.charisma.note}\n`
md += `- Proposed as passive items: ${data.proposals.passive.map((id) => nameOf.get(id) ?? id).join(', ')}.\n`
md += `- What Green wires: ${data.proposals.wiring}\n\n`

md += '## The research the layer rests on\n\n'
md += 'Read before wiring: what each body of work contributes as entries, as tags, and as the wording of the two evening chips.\n\n'
for (const r of data.research) {
  md += `### ${r.name}\n\n`
  for (const s of r.sources) md += `- Source: ${source(s)}\n`
  md += '\nWhat it contributes:\n\n'
  for (const line of r.contributes) md += `- ${line}\n`
  md += `\nThe two chips: ${r.chips}\n\n`
}

md += '## The extension prompt, as the app will write it\n\n'
md += `${data.extensionPrompt.intro}\n\n`
md += '```\n' + data.extensionPrompt.template + '\n```\n'

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
  console.log(`CATALOGUE.md written: ${data.moves.length} moves, ${proposed.length} proposed`)
}
