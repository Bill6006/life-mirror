import { existsSync, readFileSync } from 'node:fs'
import { type FifthNumbers } from './weekdayPattern'
import { DAYS } from './forecastSim'
import { MEASURE_FROM, type AltDay, type FifthDay, type FifthPerson } from './fifthSim'

// The fifth way's margin, tried over a grid on the tuning seeds without running anyone again (tuning only: the plan's
// criteria let the margin's three numbers be set there, read as often as needed). A run made with FIFTH_RECORD=1 keeps,
// for every day the fifth way beat each of the four in the back-test (the only days a margin can pick it), what the
// margin is judged on and what each pick would have led to: the challenger on either base, and the day-ahead misses of
// either pick. Every other day is the same under any margin. Each person is made again for a margin from those, and
// for the run's own margin the person made again must be the person the run wrote, or this stops.
//
// node stress/.out/fifthMargin.mjs <record folder> [grid as JSON: {"minSlots":[...],"minGain":[...],"minClear":[...]}] [a run's folder at another margin]
// Given a third folder, run on the same seeds with the same window, hold and shrink at another margin, the people
// made again at that margin must be its people too: the proof that a margin other than the record run's own is made
// again truly.

const [folder, gridArg, againstFolder] = process.argv.slice(2)
if (!folder) throw new Error('usage: fifthMargin.mjs <record folder> [grid] [against folder]')
interface Run { numbers: FifthNumbers; results: FifthPerson[] }
const loadFrom = (dir: string, id: string): Run | null => (existsSync(`${dir}/${id}.json`) ? (JSON.parse(readFileSync(`${dir}/${id}.json`, 'utf8')) as Run) : null)
const load = (id: string): Run | null => loadFrom(folder, id)
const IDS = ['plain', 'streaks', 'sparse', 'season', 'rhythm', 'rhythm-half']
const runs = new Map(IDS.flatMap((id) => { const r = load(id); return r ? [[id, r] as const] : [] }))
const NO_WEEKDAY = ['plain', 'streaks', 'sparse', 'season']
const USELESS_FOR_CHALLENGER = ['plain', 'streaks', 'sparse', 'rhythm', 'season']
if (!runs.size) throw new Error(`no results in ${folder}`)

interface Margin { minSlots: number; minGain: number; minClear: number }
const pickedBy = (a: AltDay, m: Margin): boolean => a[1] >= m.minSlots && a[2] >= m.minGain && a[3] >= m.minClear
const measured = (t: number): boolean => t + 1 >= MEASURE_FROM && t + 1 < DAYS

/** One person made again under a margin, from what the record run kept. */
function again(p: FifthPerson, m: Margin): FifthPerson {
  const rec = p.record
  if (!rec) throw new Error(`seed ${p.seed}: not a record run (FIFTH_RECORD=1)`)
  const alt = new Map(rec.alt.map((a) => [a[0], a]))
  const days: FifthDay[] = p.days.map((d) => {
    const a = alt.get(d[0])
    if (!a) return d
    const on = pickedBy(a, m)
    return [d[0], on ? 1 : 0, on ? a[5] : a[4]]
  })
  let four = rec.nb.sum
  let five = rec.nb.sum
  let n = rec.nb.n
  const picked = { five: 0, four: 0, n: 0 }
  for (const a of rec.alt) {
    const on = pickedBy(a, m)
    if (measured(a[0])) {
      four += on ? a[8] : a[6]
      five += on ? a[9] : a[6]
      n += on ? a[10] : a[7]
    }
    if (on && a[0] + 1 < DAYS) {
      picked.four += a[8]
      picked.five += a[9]
      picked.n += a[10]
    }
  }
  return { ...p, days, four: { sum: four, n }, five: { sum: five, n }, pickedSlots: picked }
}

/** Every person of `run` made again from the record run's people at `run`'s own margin must be `run`'s person. */
function sameAs(id: string, from: readonly FifthPerson[], run: Run): number {
  const own: Margin = { minSlots: run.numbers.minSlots, minGain: run.numbers.minGain, minClear: run.numbers.minClear }
  const bySeed = new Map(from.map((p) => [p.seed, p]))
  let picked = 0
  for (const p of run.results) {
    const r = bySeed.get(p.seed)
    if (!r) throw new Error(`${id}, seed ${p.seed}: not in the record run`)
    const q = again(r, own)
    const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.01
    if (JSON.stringify(q.days) !== JSON.stringify(p.days)) throw new Error(`${id}, seed ${p.seed}: the days made again differ from the run's`)
    if (q.four.n !== p.four.n || !near(q.four.sum, p.four.sum) || !near(q.five.sum, p.five.sum)) throw new Error(`${id}, seed ${p.seed}: criterion 2's misses made again differ (${q.four.sum}/${q.five.sum} on ${q.four.n} against ${p.four.sum}/${p.five.sum} on ${p.four.n})`)
    if (q.pickedSlots.n !== p.pickedSlots.n || !near(q.pickedSlots.five, p.pickedSlots.five) || !near(q.pickedSlots.four, p.pickedSlots.four)) throw new Error(`${id}, seed ${p.seed}: the picked days' misses made again differ`)
    picked += p.days.filter((d) => d[1] === 1).length
  }
  return picked
}
// The run's own margin first: every person made again must be the one the run wrote.
for (const [id, run] of runs) sameAs(id, run.results, run)
if (againstFolder) {
  for (const [id, run] of runs) {
    const other = loadFrom(againstFolder, id)
    if (!other) continue
    if (other.numbers.window !== run.numbers.window || other.numbers.hold !== run.numbers.hold || other.numbers.shrink !== run.numbers.shrink) throw new Error(`${id}: ${againstFolder} was run with another window, hold or shrink`)
    const picked = sameAs(id, run.results, other)
    console.log(`${id}: every person of ${againstFolder} (${other.results.length}, margin ${other.numbers.minSlots}/${other.numbers.minGain}/${other.numbers.minClear}, the fifth way picked on ${picked} days) is made again truly from the record run`)
  }
}
const first = runs.values().next().value as Run
console.log(`folder ${folder}: window ${first.numbers.window}, hold ${first.numbers.hold}, shrink ${first.numbers.shrink}; every person made again at the run's own margin is the run's (${[...runs].map(([id, r]) => `${id} ${r.results.length}`).join(', ')})`)

function gainOf(people: readonly FifthPerson[]): { mean: number; lo: number; hi: number } {
  const diffs = people.filter((p) => p.four.n > 0 && p.five.n > 0).map((p) => p.four.sum / p.four.n - p.five.sum / p.five.n)
  const mean = diffs.reduce((s, v) => s + v, 0) / diffs.length
  const sd = Math.sqrt(diffs.reduce((s, v) => s + (v - mean) ** 2, 0) / (diffs.length - 1))
  const half = (1.959963984540054 * sd) / Math.sqrt(diffs.length)
  return { mean, lo: mean - half, hi: mean + half }
}

const grid = { minSlots: [4, 8, 12, 16, 24, 32], minGain: [0, 0.5, 1, 1.5, 2, 3], minClear: [0, 1, 1.5, 2, 2.5, 3, 3.5, 4], ...(gridArg ? (JSON.parse(gridArg) as Partial<Record<keyof Margin, number[]>>) : {}) }
interface Row { m: Margin; c1: number[]; c3: number[]; c2: { mean: number; lo: number; hi: number } | null; c4: number[]; half: number | null; rhythmPicked: number }
const rows: Row[] = []
for (const minSlots of grid.minSlots) for (const minGain of grid.minGain) for (const minClear of grid.minClear) {
  const m = { minSlots, minGain, minClear }
  const made = new Map([...runs].map(([id, r]) => [id, r.results.map((p) => again(p, m))]))
  const c1 = NO_WEEKDAY.filter((id) => made.has(id)).map((id) => (made.get(id) as FifthPerson[]).filter((p) => p.days.some((d) => d[1] === 1)).length)
  const c3 = USELESS_FOR_CHALLENGER.filter((id) => made.has(id)).map((id) => (made.get(id) as FifthPerson[]).filter((p) => p.days.some((d) => d[2] === 1)).length)
  const c2 = made.has('rhythm') ? gainOf(made.get('rhythm') as FifthPerson[]) : null
  const c4 = NO_WEEKDAY.filter((id) => made.has(id)).map((id) => -gainOf(made.get(id) as FifthPerson[]).lo)
  const half = made.has('rhythm-half') ? gainOf(made.get('rhythm-half') as FifthPerson[]).mean : null
  const rhythmPicked = made.has('rhythm') ? (made.get('rhythm') as FifthPerson[]).filter((p) => p.days.some((d) => d[1] === 1)).length : 0
  rows.push({ m, c1, c3, c2, c4, half, rhythmPicked })
}
const f3 = (v: number | null): string => (v === null ? '-' : v.toFixed(3))
const people = first.results.length
console.log(`each world's people: ${people}. Columns: the margin (least slots, least gain, least clear); criterion 1's most picked of the no-weekday worlds (${NO_WEEKDAY.join(', ')}); criterion 3's most adopted of ${USELESS_FOR_CHALLENGER.join(', ')}; criterion 2's gain in rhythm with its interval; criterion 4's worst upper end; rhythm picked; rhythm-half's gain`)
const line = (r: Row): string => `  slots ${String(r.m.minSlots).padStart(2)} gain ${r.m.minGain.toFixed(1)} clear ${r.m.minClear.toFixed(1)} | c1 ${String(Math.max(...r.c1)).padStart(3)} (${r.c1.join('/')}) | c3 ${String(Math.max(...r.c3)).padStart(3)} (${r.c3.join('/')}) | c2 ${f3(r.c2?.mean ?? null)} (${f3(r.c2?.lo ?? null)} to ${f3(r.c2?.hi ?? null)}) | c4 ${f3(Math.max(...r.c4))} | rhythm picked ${r.rhythmPicked} | half ${f3(r.half)}`
const target = (r: Row): boolean => Math.max(...r.c1) <= 30 && Math.max(...r.c3) <= 30 && r.c2 !== null && r.c2.lo > 0 && Math.max(...r.c4) < 0.05
const meeting = rows.filter(target).sort((a, b) => (b.c2?.lo ?? 0) - (a.c2?.lo ?? 0))
console.log(`\n${meeting.length} of ${rows.length} margins meet the tuning's aims (criteria 1 and 3 at most 30 of 1,000 in every world, criterion 2's interval above nothing, criterion 4's upper end under 0.05), by criterion 2's lower end:`)
for (const r of meeting.slice(0, 25)) console.log(line(r))
const safe = rows.filter((r) => Math.max(...r.c1) <= 30 && Math.max(...r.c3) <= 30).sort((a, b) => (b.c2?.mean ?? -1e9) - (a.c2?.mean ?? -1e9))
console.log(`\n${safe.length} of ${rows.length} margins keep criteria 1 and 3 at most 30 of 1,000 in every world; the best of them by criterion 2's gain, whatever its interval:`)
for (const r of safe.slice(0, 15)) console.log(line(r))
console.log('\nthe least strict margin at each least clear, for the shape of it:')
for (const minClear of grid.minClear) {
  const r = rows.find((x) => x.m.minClear === minClear && x.m.minSlots === grid.minSlots[0] && x.m.minGain === grid.minGain[0])
  if (r) console.log(line(r))
}
