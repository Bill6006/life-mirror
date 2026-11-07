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
// A Path with strands (P1, P4): its own strands, or one made of its stages; a rep's guardrail as that Path shows it.
const strandsOf = (p) => (p.strands?.length ? p.strands : [{ id: '', name: p.name, stages: p.stages, rule: p.rule }])
const guardOf = (m, id) => m.path?.[id]?.guardrail ?? m.guardrail
const ORIGIN = { direct: 'direct evidence', indirect: 'indirect evidence', mechanism: 'a mechanism', expert: 'expert advice', inference: 'an inference', judgment: 'design judgment' }
const LABEL = { experimental: 'Experimental' }
const arrow = (d) => (d === 'up' ? '↑' : '↓')

let md = '# Life Mirror — the catalogue of moves\n\n'
md += `${data.moves.length} moves across ${data.families.length} families, ${proposed.length} of them proposed and not yet wired. Every entry carries its source and how strong that evidence is, `
md += 'how long it takes, the effort to start, what being given it costs, its learned tags, its starting belief, what it needs, which readings it should move and over what window, what it conflicts with, '
md += 'what it replaces, and what it counts toward. Generated from `src/catalogue.json` by `scripts/catalogue-md.mjs`; edit the JSON, not this file.\n\n'
md += 'Strength of evidence: **strong** (meta-analyses or several trials), **moderate** (a good trial or review), **thin** (a small study, or evidence for something adjacent), **practice** (common advice, untested).\n\n'
md += 'Proposed entries, tags, beliefs and trades are content to read and veto. Yellow names what to cut or reword; Green wires it. Until then nothing here changes what is offered.\n\n'

// The paths (Parts 23 and 26): each stage with its reps, the rule, what is counted and never counted, what is left out, and the evidence.
md += '## Paths\n\n'
md += 'The Social and Partner paths, each a staged curriculum of reps, with your Green. Both are wired: add either under Aims, and each path’s own reps are offered through its row alone. With both on, Now still shows one People row. '
md += 'A Path the catalogue adds is read on one screen first and runs only once you start it: the Speaking path, labelled experimental, compiled once by hand from the research (P4). It shares the same one People row.\n\n'
for (const p of data.paths) {
  md += `### ${p.name} path${p.label ? ` (${LABEL[p.label] ?? p.label})` : ''}\n\n${p.what}\n\n${p.timeline ? `How long: ${p.timeline}\n\n` : ''}`
  if (p.start) {
    md += `#### Before it starts\n\nTwo questions, yes or no, whose answers are not kept: ${p.start.questions.map((q, i) => `(${i + 1}) ${q.text}`).join(' ')} A yes to either shows the app’s own text first: ${p.start.help}\n\n`
    md += `Where it starts: ${p.start.focus.map((f) => f.words).join('; ')}.\n\n`
  }
  for (const strand of strandsOf(p)) {
    if (strand.id) md += `#### Strand: ${strand.name}\n\n${strand.what}\n\n`
    if (strand.id && strand.rule) md += `How a stage of it is reached: ${strand.rule.note}\n\n`
    const measure = p.measurement?.strands.find((x) => x.strand === strand.id)
    if (measure) md += `Its behaviours, checked by you right after${measure.record ? ', on a recording of yourself the next day or later' : ''}${measure.handOver ? ', and by someone who was there, on your phone' : ''}: ${measure.behaviours.map((b) => b.words).join('; ')}.\n\n`
    for (const st of strand.stages) {
      md += `${strand.id ? '#####' : '####'} Stage ${st.n} · ${st.name}\n\n${st.what}\n\n- Not progress: ${st.notProgress}\n- How it moves: ${ADVANCE[st.advance ?? 'counts']}\n`
      const gate = p.measurement?.gates.find((g) => g.strand === strand.id && g.stage === st.n)
      if (gate) md += `- Shown when: ${gate.met} of its behaviours on reps in ${gate.weeks} separate weeks${gate.confirmed ? `, ${gate.confirmed} of them checked from outside the moment` : ''}, in ${gate.kinds} kind${gate.kinds === 1 ? '' : 's'} of setting\n`
      const reps = data.moves.filter((m) => m.path?.[p.id]?.stage === st.n && (m.path[p.id].strand ?? '') === strand.id)
      for (const m of reps) {
        const place = m.path[p.id]
        const bits = [place.advances ? 'moves the stage' : 'moves no stage']
        if (m.settings?.length) bits.push(`where: ${m.settings.map((k) => SETTING[k]).join(', ')}`)
        if (m.channel) bits.push(`channel: ${m.channel}`)
        if (place.through) bits.push(`from ${strand.stages.find((s) => s.n === place.stage)?.name} through ${strand.stages.find((s) => s.n === place.through)?.name}`)
        if (place.onDate) bits.push('on a declared date day')
        if (place.after) bits.push(`offered by the app once these are done: ${place.after.map((id) => data.moves.find((x) => x.id === id)?.name ?? id).join(', ')}`)
        if (m.hiddenWith === 'faith') bits.push('hidden while the faith family is hidden')
        if (m.record && measure?.record) bits.push('recorded of yourself')
        if (m.status === 'proposed') bits.push('proposed')
        const guard = guardOf(m, p.id)
        md += `- **${m.name}** (${bits.join(' · ')}). Attention on: ${m.cue} Drop: ${m.crutch} ${m.doneWhen}${guard ? ` ${guard}` : ''}\n`
      }
      for (const a of (p.acts ?? []).filter((x) => x.stage === st.n)) {
        const questions = a.questions ? ` The questions: ${a.questions.map((q, i) => `(${i + 1}) ${q.text}${q.helpOnYes ? ' A yes shows the help.' : ''}`).join(' ')}` : ''
        const parts = a.parts ? ` In parts: ${a.parts.map((pt) => `(${pt.name}) ${pt.prompt}`).join(' ')}` : ''
        const weigh = a.considerations ? ` To weigh: ${a.considerations.map((x) => `${x.text} (${{ evidence: 'evidence', adjacent: 'related evidence', opinion: 'expert opinion' }[x.basis]}: ${x.source})`).join(' ')}` : ''
        md += `- **${a.name}.** ${a.what}${questions}${a.help ? ` The help the app shows itself: ${a.help}` : ''}${parts}${weigh} Source: ${source(a.source)}\n`
      }
      md += '\n'
    }
  }
  if (p.measurement) md += `#### Checked again, and stuck\n\nA stage shown is checked again about ${p.measurement.maintenance.at.join(' and ')} days after it was shown, then about every ${p.measurement.maintenance.every} days; a check missed or not met brings its reps back. After ${p.measurement.cap} tries at a stage without its behaviours shown, the stage below’s reps come back beside it.\n\n`
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
  if (p.decisions?.length) {
    md += '#### Why it is built this way\n\n'
    for (const d of p.decisions) md += `- **${d.decision}** Rests on ${ORIGIN[d.origin] ?? d.origin}, ${d.cards.length} cards. ${d.basis} Unsure: ${d.uncertainty} Would change it: ${d.change}\n`
    md += '\n'
  }
  md += '#### The evidence\n\nClaim cards, each source verified at Crossref, admitted once their path was wired; the disputed ones are never cited. A card about dating reaches the day’s line only on a date day you declared, and one about a relationship never does.\n\n'
  for (const id of p.cards) {
    const c = cardOf.get(id)
    if (!c) continue
    md += `- **${GRADE[c.grade]}** (${c.status === 'disputed' ? 'disputed, never cited' : c.status === 'draft' ? 'draft, admitted when its path is wired' : 'admitted'}). ${c.claim} ${c.sources.map((x) => x.cite).join(' ')}\n`
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
    if (m.status === 'proposed') status.push(m.path ? 'Proposed: Green given; joins the candidates when its path is wired' : 'Proposed: read and veto; joins the candidates at Green')
    if (m.status === 'path') status.push('Offered through its path’s row alone, never by the day’s draw')
    if (m.parked) status.push('Parked: shown here, never offered')
    if (m.ladder) status.push(`rung ${m.ladder.rung} of the participation ladder`)
    if (m.setup) status.push(m.setup.kind === 'necessity' ? `a setup whose target is a necessity: ${NECESSITY[m.setup.necessity]}` : SETUP[m.setup.kind])
    if (m.passive) status.push('proposed as a passive item')
    for (const p of data.paths) if (m.path?.[p.id]) status.push(`${p.name} path, ${m.path[p.id].strand ? `${p.strands?.find((x) => x.id === m.path[p.id].strand)?.name ?? m.path[p.id].strand}, ` : ''}stage ${m.path[p.id].stage}, ${m.path[p.id].advances ? 'moves the stage' : 'moves no stage'}`)
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
