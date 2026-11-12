import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { meansBound, weekdayBound } from './countedBound'
import { COUNTED_WORLDS, LOOKS, type CountedPerson, type Family } from './countedWorlds'
import { wilson } from './stats'

// The judge of the counted foundation's simulation: the frozen criteria (RESULTS-8.md says where they are kept), read on the results
// in a folder. Written before the verdict run. It reads what the pool wrote and decides nothing the criteria do not
// state: criterion 1 by the interval's upper bound, criteria 3 and 4 by the point estimate against a bound computed
// from each person's own counts.
//
// node stress/.out/countedJudge.mjs <folder>
//
// <folder>/<world>.json is the first read. <folder>/second/<world>.json, when there, is the second read of a world
// with a cell the first read did not decide.

const PATTERN = 3
const LEAD = 2
const FIRST_MARK = 0.07
const SECOND_MARK = 0.06
const VERDICT_PEOPLE = 2000
const SECOND_PEOPLE = 8000
const SATURDAY_ROW = 6
const EVENING_ROW = 9

interface Run {
  world: string
  seeds: [number, number]
  ms: number
  results: CountedPerson[]
}

const folder = process.argv[2]
if (!folder) throw new Error('usage: countedJudge.mjs <folder>')
const load = (path: string): Run | null => (existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Run) : null)
const pct = (v: number): string => (100 * v).toFixed(1)
const out: string[] = []
const say = (line = ''): void => void out.push(line)

const rowsOf = (p: CountedPerson, look: number, family: Family) => p.looks[String(look)]?.families[family]?.rows ?? []
const shows = (p: CountedPerson, look: number, family: Family, standing: number): boolean => rowsOf(p, look, family).some((r) => r[4] === standing)
const called = (p: CountedPerson, look: number, family: Family, row: number, direction: number): boolean => {
  const r = rowsOf(p, look, family)[row]
  return !!r && r[4] === PATTERN && r[5] === direction
}

let failed = 0
let undecided = 0
let missing = 0
let tuning = false

say('THE COUNTED FOUNDATION: THE SIMULATION, JUDGED')
say(`folder: ${folder}`)
say()
say('1. False patterns with nothing there (judged), and 2. leads with nothing there (reported)')
say('world              family     look  people  pattern  share  upper95  lead-only  any-look  verdict')
for (const spec of COUNTED_WORLDS.filter((w) => w.kind === 'no-pattern')) {
  const first = load(join(folder, `${spec.id}.json`))
  if (!first) {
    say(`${spec.id.padEnd(18)} MISSING`)
    missing++
    continue
  }
  const second = load(join(folder, 'second', `${spec.id}.json`))
  const n = first.results.length
  if (n !== VERDICT_PEOPLE) tuning = true
  for (const family of spec.families) {
    const anyLook = first.results.filter((p) => LOOKS.some((look) => shows(p, look, family, PATTERN))).length
    for (const look of LOOKS) {
      const k = first.results.filter((p) => shows(p, look, family, PATTERN)).length
      const leads = first.results.filter((p) => shows(p, look, family, LEAD) && !shows(p, look, family, PATTERN)).length
      const w = wilson(k, n)
      let verdict: string
      if (w.hi <= FIRST_MARK) verdict = 'pass'
      else if (k / n >= FIRST_MARK) {
        verdict = 'FAIL'
        failed++
      } else if (second) {
        if (second.results.length !== SECOND_PEOPLE) throw new Error(`${spec.id}: the second read holds ${second.results.length} people, not ${SECOND_PEOPLE}`)
        const k2 = second.results.filter((p) => shows(p, look, family, PATTERN)).length
        const all = wilson(k + k2, n + SECOND_PEOPLE)
        const passed = all.hi <= SECOND_MARK
        verdict = `second read: ${k + k2} of ${n + SECOND_PEOPLE}, share ${pct(all.p)}, upper ${pct(all.hi)}: ${passed ? 'pass' : 'FAIL'}`
        if (!passed) failed++
      } else {
        verdict = 'NOT DECIDED: a second read is needed'
        undecided++
      }
      say(`${spec.id.padEnd(18)} ${family.padEnd(10)} ${String(look).padStart(4)}  ${String(n).padStart(6)}  ${String(k).padStart(7)}  ${pct(w.p).padStart(5)}  ${pct(w.hi).padStart(7)}  ${pct(leads / n).padStart(9)}  ${pct(anyLook / n).padStart(8)}  ${verdict}`)
    }
  }
}

/** A judged share against a bound: the point estimate decides. */
function judged(title: string, hits: number, n: number, bound: number, factor: number, judge: boolean): void {
  const w = wilson(hits, n)
  const mark = factor * bound
  let verdict = 'reported'
  if (judge) {
    verdict = w.p >= mark ? 'pass' : 'FAIL'
    if (w.p < mark) failed++
  }
  say(`${title}: ${hits} of ${n}, share ${pct(w.p)} (95% ${pct(w.lo)} to ${pct(w.hi)}); bound ${pct(bound)}; mark ${pct(mark)} (${factor} of the bound): ${verdict}`)
}

say()
say('3. A real weekday effect (judged at day 180)')
{
  const run = load(join(folder, 'weekday.json'))
  if (!run) {
    say('weekday MISSING')
    missing++
  } else {
    const n = run.results.length
    if (n !== VERDICT_PEOPLE) tuning = true
    for (const look of LOOKS) {
      const hits = run.results.filter((p) => called(p, look, 'A-day', SATURDAY_ROW, 1)).length
      const wrong = run.results.filter((p) => called(p, look, 'A-day', SATURDAY_ROW, -1)).length
      const bound = run.results.reduce((s, p) => s + weekdayBound(p.looks[String(look)].bound?.sat ?? 0, p.looks[String(look)].bound?.other ?? 0, p.looks[String(look)].families['A-day']?.tested ?? 0), 0) / n
      judged(`weekday, day ${look}`, hits, n, bound, 0.8, look === 180)
      say(`  called the wrong way: ${wrong}`)
    }
  }
}

say()
say('4. A real like-for-like difference (judged at day 180 in fifteen-points)')
for (const id of ['fifteen-points', 'ten-points']) {
  const run = load(join(folder, `${id}.json`))
  if (!run) {
    say(`${id} MISSING`)
    if (id === 'fifteen-points') missing++
    continue
  }
  const n = run.results.length
  if (n !== VERDICT_PEOPLE) tuning = true
  for (const look of LOOKS) {
    const inputs = run.results.map((p) => ({ b: p.looks[String(look)].bound ?? {}, tested: p.looks[String(look)].families.B?.tested ?? 0 }))
    const trueN = inputs.reduce((s, x) => s + (x.b.trueN ?? 0), 0)
    const trueDiff = trueN ? inputs.reduce((s, x) => s + (x.b.trueSum ?? 0), 0) / trueN : 0
    const bound = inputs.reduce((s, x) => s + meansBound(x.b.n1 ?? 0, x.b.n0 ?? 0, x.tested, x.b.spread ?? 0, trueDiff), 0) / n
    const hits = run.results.filter((p) => called(p, look, 'B', 0, 1)).length
    const wrong = run.results.filter((p) => called(p, look, 'B', 0, -1)).length
    const others = run.results.filter((p) => rowsOf(p, look, 'B').some((r, i) => i > 0 && r[4] === PATTERN)).length
    const spread = inputs.reduce((s, x) => s + (x.b.spread ?? 0), 0) / n
    judged(`${id}, day ${look}`, hits, n, bound, 0.9, id === 'fifteen-points' && look === 180)
    say(`  the true difference ${trueDiff.toFixed(2)} points over ${trueN} evenings; mean spread ${spread.toFixed(2)}; called the wrong way: ${wrong}; one of the eleven other things at pattern: ${others} of ${n} (${pct(others / n)})`)
  }
}

say()
say('5. Reported only')
for (const [id, row, label] of [['weekday-checkin', SATURDAY_ROW, 'the Saturday cell'], ['evening', EVENING_ROW, 'the evening cell']] as const) {
  const run = load(join(folder, `${id}.json`))
  if (!run) {
    say(`${id} MISSING (reported only)`)
    continue
  }
  const n = run.results.length
  for (const look of LOOKS) {
    const hits = run.results.filter((p) => called(p, look, 'A-checkin', row, 1)).length
    const wrong = run.results.filter((p) => called(p, look, 'A-checkin', row, -1)).length
    const w = wilson(hits, n)
    say(`${id}, day ${look}: ${label} at pattern, read higher: ${hits} of ${n}, share ${pct(w.p)} (95% ${pct(w.lo)} to ${pct(w.hi)}); called the wrong way: ${wrong}`)
  }
}

say()
say('Time for one simulated person through every family at three looks, in milliseconds (median by world)')
for (const spec of COUNTED_WORLDS) {
  const run = load(join(folder, `${spec.id}.json`))
  if (!run) continue
  const ms = run.results.map((p) => p.ms).sort((a, b) => a - b)
  say(`${spec.id.padEnd(18)} seeds ${run.seeds[0]} to ${run.seeds[1]}  people ${String(run.results.length).padStart(5)}  median ${ms[ms.length >> 1]} ms  slowest ${ms[ms.length - 1]} ms`)
}

say()
if (tuning) say('NO VERDICT: this folder does not hold 2,000 people a world. These are tuning numbers.')
else if (missing) say(`NO VERDICT: ${missing} judged world(s) missing.`)
else if (failed) say(`VERDICT: FAIL (${failed} judged cell(s) failed${undecided ? `, ${undecided} not decided` : ''}).`)
else if (undecided) say(`VERDICT: NOT DECIDED (${undecided} cell(s) need the second read; every other judged cell passed).`)
else say('VERDICT: PASS (every judged cell passed).')
process.stdout.write(out.join('\n') + '\n')
