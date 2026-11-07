// Writes generator/DOSSIER.md, the drafting run's guide to the dossier (P5), from the compiler's own source, so the
// guide and the compiler can never disagree: the shape, how the app reads what a dossier says, and one example.
// `node scripts/dossier-md.mjs` writes it; `--check` fails if the file is out of date. The Worker serves this file,
// read from GitHub main, to every drafting run.
import { readFileSync, writeFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const between = (text, from, to) => {
  const a = text.indexOf(from)
  const b = text.indexOf(to, a)
  if (a < 0 || b < 0) throw new Error(`dossier-md: "${from}" or "${to}" moved`)
  return text.slice(a, b)
}

const compile = read('src/pathCompile.ts')
const measure = read('src/pathMeasure.ts')
const catalogue = read('src/catalogue.ts')
const fixture = read('src/pathCompile.fixture.ts')

const shape = between(compile, '/** Goal types,', 'export type Compiled')
const measurement = between(measure, '/** One behaviour a strand', "/** What a rep's record says")
const stage = between(catalogue, 'export interface PathStage {', '/** The one rule shape a stage is reached by')
const rule = between(catalogue, '/** The one rule shape a stage is reached by', 'export interface PathChannel')
const strand = between(catalogue, 'export interface PathStrand {', "/** The app's own private check on a strand")
const decision = between(catalogue, '/** Why one element of a Path is as it is', '/** The track a Path holds')
const example = fixture.slice(fixture.indexOf('/** A small, well-formed dossier'))

const reads = `## How the app reads what you write

- **A rep's record.** After a rep the person checks which of its strand's behaviours they did (\`checks\`). A recorded
  rep (\`record\`, the person alone) is checked on its recording the next day or later. A handed-over rep
  (\`handOver\`) asks someone who was there to mark the behaviours they noticed. Before every start the app asks
  "What do you expect will happen? One line, if you want." and shows that line after; a rep never asks for a
  rating, a score, stars or how it went. The app never stores anyone's reaction.
- **A rep's best view.** From outside the moment when there is one (the recording's or the other person's checks,
  when they hold at least as many behaviours as the person's own), else the person's own right after.
- **A stage moves on** when the strand's rule is met (\`reps\` done within \`withinWeeks\`, \`distinctReps\` different
  ones, \`settingKinds\` kinds of setting), counting only stage-moving reps (\`advances\`) placed at that stage, and,
  where the stage has a gate, when the gate holds too: reps whose best view shows \`met\` behaviours and every one
  in \`requires\`, on \`weeks\` separate weeks, \`confirmed\` of them from outside the moment, in \`kinds\` kinds of
  setting. A strand's last stage is practice: reaching it is the end of the strand.
- **The attempt cap** (\`measurement.cap\`, four to twelve). An attempt is a done rep of the stage with behaviours
  checked. After \`cap\` attempts without the gate holding, the stage below's reps come back beside the current
  ones: practice steps back, nothing shown is erased, and nothing is called a demotion.
- **Checks again later** (\`measurement.maintenance\`). A stage shown is checked again \`at\` days after it was shown
  (for example 30 and 90), then every \`every\` days. At each check, the first done rep of that stage on or after
  the day must show its gate's behaviours; one that does not, or none within 14 days, brings the stage's reps back
  until a later rep shows them again.
- **The start screens** (\`start.screen\`). \`socialFear\` asks two questions (whether the person often avoids social
  situations, and whether they are often left afraid or embarrassed); \`fear\` asks one (whether the fear often
  stops them doing things). A yes shows the app's own help, saying this is practice beside help, and turns on the
  strand the start \`opens\`, which must be an exposure strand; the person may turn it off. The answers are never
  kept. A Path most of whose stage-moving reps are done with someone must open on \`socialFear\`.
- **Where it starts** (\`start.focus\`). Each choice is a strand's id (that strand alone), or any other id (every
  strand but the one a yes opens and those that wait). A focus never names the strand a yes opens or one that waits.
- **A strand's last stage** has no gate and is never checked again: reaching it is the end of the strand.
- **The smaller version.** After \`smallerAfterRefusals\` refusals in a row the app offers the stage's lightest rep, by
  effort and then minutes, so every stage the rule moves holds a rep below high effort.
- **Strands on.** The strand a start opens is off at first without \`waits\`: a yes turns it on.
  Every strand but the one a yes opens and those that wait is on at first. The person turns strands
  on and off on the Path's card; at least one stays on. A strand that \`waits\` is off until they turn it on, dated;
  while it is on, the strands it \`pauses\` are off, and they come back with their stages kept when it goes off. A
  strand that is off offers nothing, and its checks again later wait.
- **An ask** (\`asks\`): a rep that asks one person for something they could refuse carries the app's own bar,
  appended to its guardrail word for word: never someone who cannot freely say no, one ask, anything but a yes
  final. A strand done with a partner holds a rep of asking in words before anything physical.
- **The app's own private check.** A strand whose reps need a partner carries the app's monthly private check,
  questions and help written by the app, never by you; its answers are never kept.
- **Calls and messages.** On a strand without \`remote\`, a rep that can be done by a call or a message moves no stage.
- **Feasibility** (\`needs\`, \`gives\`): \`contact\` (a way to reach the person) and \`acquaintance\` (someone talked
  with before) must be given by a rep at or before the needing rep's stage on its strand, or by a rep on another
  strand that does not wait; \`plan\` (someone's yes to a plan) never moves a stage; \`partner\` sits only on a strand
  that waits; a rep that needs a plan is offered like any other, and with no plan the person answers there was no
  chance. Every stage the rule moves must keep its floor with any one of its stage-moving reps taken away.
- **Gates measure every component** a strand trains before its last stage: one of its behaviours is required by a gate.
- **Floors by kind** (\`FLOORS\` above): a strand's rule asks at least these reps and different reps.
- **The share.** Beside another Path a Path's own reps take the People row three days in seven, so the strands that
  run together ask at most three reps a week in all (\`reps\` over \`withinWeeks\`, added up); a strand that waits runs
  with those it does not pause.
- **A first stage** never waits on someone else: a check from outside the moment there must be one you can give
  alone, a recording of yourself.
- **Minutes.** One to ninety a rep, each within the person's minutes a week; the median rep on three days in seven
  within them, since a Path's own reps take the day's People row at most three days in seven.
- **Decisions** the compiler requires: \`structure\`, \`strand:<id>\` for each strand, \`gate:<id>\` for each strand with
  gates, \`start\` when there is one, \`maintenance\`, \`rule\`, \`cap\` and \`timeline\`.
- **Provenance** is stamped by the harness that runs you: never write it.
`

const md = `# The dossier's shape

Generated from \`src/pathCompile.ts\`, \`src/pathMeasure.ts\`, \`src/catalogue.ts\` and \`src/pathCompile.fixture.ts\` by
\`scripts/dossier-md.mjs\`; edit those, not this file. Settings are one of recurring, errand, group, oneToOne, remote,
solo; effort is low, medium or high; an origin is one of direct, indirect, mechanism, expert, inference, judgment.

\`\`\`ts
${shape}
${measurement}
${stage}
${rule}
${strand}
${decision}\`\`\`

${reads}
## An example, for its shape only (a garden goal)

\`\`\`ts
${example}\`\`\`
`

const target = new URL('../generator/DOSSIER.md', import.meta.url)
if (process.argv.includes('--check')) {
  const now = (() => {
    try {
      return readFileSync(target, 'utf8').replace(/\r\n/g, '\n')
    } catch {
      return ''
    }
  })()
  if (now !== md) {
    console.error('generator/DOSSIER.md is out of date: run node scripts/dossier-md.mjs')
    process.exit(1)
  }
  console.log('generator/DOSSIER.md is current')
} else {
  writeFileSync(target, md)
  console.log('wrote generator/DOSSIER.md')
}
