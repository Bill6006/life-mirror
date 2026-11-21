import { existsSync, readFileSync } from 'node:fs'
import { type Truth, type WeekPerson } from './weekSim'

// The week ahead's level-plus-weekday way: its judge. The criteria were frozen on 2026-11-21, before the way's code was
// written; the private repository holds them, and the results file names their hash. This file reads them as they
// were frozen: seven judged, the rest reported.
//
// node stress/.out/weekJudge.mjs <results folder> [tuning]
// The folder holds one file a world; the challenger's runs are in <folder>/challenger; a second read of a world, where
// criterion 5's or 6's rule asks for one, in <folder>/second and <folder>/challenger/second.

const [folder, mode] = process.argv.slice(2)
if (!folder) throw new Error('usage: weekJudge.mjs <results folder> [tuning]')
const tuning = mode === 'tuning'
interface Run {
  results: WeekPerson[]
  truth: Truth
  numbers: unknown
  seeds: [number, number]
}
const load = (path: string): Run | null => (existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Run) : null)
const IDS = ['plain', 'streaks', 'sparse', 'season', 'rhythm', 'rhythm-half', 'rhythm-one', 'rhythm-turn']
const NO_WEEKDAY = ['plain', 'streaks', 'sparse', 'season']
const USELESS_FOR_CHALLENGER = ['plain', 'streaks', 'sparse', 'rhythm', 'season']
const runs = new Map(IDS.flatMap((id) => { const r = load(`${folder}/${id}.json`); return r ? [[id, r] as const] : [] }))
const second = new Map(IDS.flatMap((id) => { const r = load(`${folder}/second/${id}.json`); return r ? [[id, r] as const] : [] }))
const chRuns = new Map(IDS.flatMap((id) => { const r = load(`${folder}/challenger/${id}.json`); return r ? [[id, r] as const] : [] }))
const chSecond = new Map(IDS.flatMap((id) => { const r = load(`${folder}/challenger/second/${id}.json`); return r ? [[id, r] as const] : [] }))

const Z = 1.959963984540054
function wilson(k: number, n: number): [number, number] {
  const p = k / n
  const den = 1 + (Z * Z) / n
  const mid = (p + (Z * Z) / (2 * n)) / den
  const half = (Z * Math.sqrt((p * (1 - p)) / n + (Z * Z) / (4 * n * n))) / den
  return [100 * (mid - half), 100 * (mid + half)]
}
interface Interval {
  mean: number
  lo: number
  hi: number
  n: number
}
function interval(values: readonly number[]): Interval {
  const n = values.length
  const mean = values.reduce((s, v) => s + v, 0) / n
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1))
  const half = (Z * sd) / Math.sqrt(n)
  return { mean, lo: mean - half, hi: mean + half, n }
}
const show = (i: Interval): string => `${i.mean.toFixed(3)} (${i.lo.toFixed(3)} to ${i.hi.toFixed(3)}; ${i.n} people)`

/** A person's average miss over some stretches: today's system, with the new way, the told forecast, the flat way; null with no slot. */
function misses(p: WeekPerson, stretches: readonly number[]): { without: number; with: number; told: number; flat: number } | null {
  let a = 0
  let b = 0
  let c = 0
  let d = 0
  let n = 0
  for (const i of stretches) {
    a += p.s[i][0]
    b += p.s[i][1]
    c += p.s[i][2]
    d += p.s[i][3]
    n += p.s[i][4]
  }
  return n ? { without: a / n, with: b / n, told: c / n, flat: d / n } : null
}
const over = <T>(people: readonly WeekPerson[], stretches: readonly number[], f: (m: { without: number; with: number; told: number; flat: number }) => T): T[] => people.flatMap((p) => { const m = misses(p, stretches); return m ? [f(m)] : [] })

const EARLY = [0]
const MIDDLE = [1]
const LATE = [2]
const AFTER_TURN = [1, 2]
const ALL = [0, 1, 2]
const NAMES = ['days 29 to 90', 'days 91 to 150', 'days 151 to 180']
const name = (stretches: readonly number[]): string => (stretches.length === 3 ? 'days 29 to 180' : stretches.length === 2 ? 'days 91 to 180' : NAMES[stretches[0]])

let pass = true
const judged = (label: string, ok: boolean, line: string): void => {
  if (!ok) pass = false
  console.log(`${label}: ${line}: ${tuning ? (ok ? 'would pass' : 'WOULD FAIL') : ok ? 'PASS' : 'FAIL'}`)
}
const need = (id: string): WeekPerson[] | null => {
  const r = runs.get(id)
  if (!r) {
    pass = false
    console.log(`  ${id}: NOT RUN`)
    return null
  }
  return r.results
}

console.log(`The level-plus-weekday way, ${tuning ? 'on the tuning seeds (nothing here is a verdict)' : 'THE VERDICT'}: ${folder}`)
const first = [...runs.values()][0]
if (first) console.log(`The method's numbers: ${JSON.stringify(first.numbers)}; seeds ${first.seeds[0]} to ${first.seeds[1]}`)

console.log('\nCriterion 1, rhythm, days 151 to 180: it closes at least a quarter of the gap (g less a quarter of b, wholly above nothing).')
{
  const people = need('rhythm')
  if (people) {
    const v = interval(over(people, LATE, (m) => m.without - m.with - 0.25 * (m.without - m.told)))
    const g = interval(over(people, LATE, (m) => m.without - m.with))
    const b = interval(over(people, LATE, (m) => m.without - m.told))
    judged('  rhythm', v.lo > 0, `g less a quarter of b ${show(v)}; g ${g.mean.toFixed(3)}, b ${b.mean.toFixed(3)}, so ${((100 * g.mean) / b.mean).toFixed(0)} of 100 of the gap closed`)
  }
}

console.log('\nCriterion 2, rhythm, days 91 to 150: the forecasts get better (without less with, wholly above nothing).')
{
  const people = need('rhythm')
  if (people) {
    const g = interval(over(people, MIDDLE, (m) => m.without - m.with))
    judged('  rhythm', g.lo > 0, show(g))
  }
}

console.log('\nCriterion 3: no harm (with less without, upper end under 0.05 points).')
for (const [id, stretches] of [['rhythm', EARLY], ['plain', ALL], ['streaks', ALL], ['sparse', ALL], ['season', ALL], ['rhythm-half', ALL], ['rhythm-one', ALL], ['rhythm-turn', LATE]] as const) {
  const people = need(id)
  if (!people) continue
  const h = interval(over(people, stretches, (m) => m.with - m.without))
  judged(`  ${id}, ${name(stretches)}`, h.hi < 0.05, show(h))
}

console.log('\nCriterion 4, rhythm-turn, days 91 to 180: a turned pattern costs little (with less without, upper end under 0.10 points).')
{
  const people = need('rhythm-turn')
  if (people) {
    const h = interval(over(people, AFTER_TURN, (m) => m.with - m.without))
    judged('  rhythm-turn', h.hi < 0.1, show(h))
  }
}

/** Criterion 5's and 6's rule on one world. */
function readOnce(people: readonly WeekPerson[], more: readonly WeekPerson[] | undefined, hit: (p: WeekPerson) => boolean, again: string): { line: string; ok: boolean } {
  const k = people.filter(hit).length
  const [lo, hi] = wilson(k, people.length)
  const head = `${k} of ${people.length} (${((100 * k) / people.length).toFixed(2)} in 100; interval ${lo.toFixed(2)} to ${hi.toFixed(2)})`
  if (tuning) return { line: head, ok: k / people.length <= 0.04 }
  if (k <= 80) return { line: head, ok: true }
  if (k >= 100) return { line: head, ok: false }
  if (!more) return { line: `${head}; READ AGAIN on ${again}`, ok: false }
  const k2 = k + more.filter(hit).length
  return { line: `${head}; on the second read ${k2} of ${people.length + more.length}`, ok: k2 <= 457 }
}

console.log('\nCriterion 5: no invented weeks (ever in use for fewer than one person in twenty where there is no weekday effect).')
for (const id of NO_WEEKDAY) {
  const people = need(id)
  if (!people) continue
  const r = readOnce(people, second.get(id)?.results, (p) => p.use.first !== null, 'seeds 902001 to 910000')
  judged(`  ${id}`, r.ok, r.line)
}

console.log("\nCriterion 6: the challenger's own criterion 1 with the new way among its bases (adopted for fewer than one person in twenty).")
for (const id of USELESS_FOR_CHALLENGER) {
  const r0 = chRuns.get(id)
  if (!r0) {
    pass = false
    console.log(`  ${id}: NOT RUN`)
    continue
  }
  if (r0.results.some((p) => !p.ch)) throw new Error(`${id}: a challenger run without the challenger`)
  const r = readOnce(r0.results, chSecond.get(id)?.results, (p) => p.ch?.adopted === 1, 'seeds 902001 to 910000')
  judged(`  ${id}`, r.ok, r.line)
}

console.log('\nCriterion 7, rhythm: it stays (out of use again for under one in four of those it came into use for, the interval wholly under).')
{
  const people = need('rhythm')
  if (people) {
    const came = people.filter((p) => p.use.first !== null)
    const left = came.filter((p) => p.use.offs > 0).length
    const [lo, hi] = came.length ? wilson(left, came.length) : [0, 100]
    judged('  rhythm', came.length > 0 && hi < 25, `${left} of ${came.length} (${came.length ? ((100 * left) / came.length).toFixed(1) : '-'} in 100; interval ${lo.toFixed(1)} to ${hi.toFixed(1)})`)
  }
}

console.log(`\n${tuning ? 'ON THE TUNING SEEDS' : 'THE VERDICT'}: ${pass ? (tuning ? 'every criterion would pass' : 'PASS') : tuning ? 'not every criterion would pass' : 'FAIL'}`)

console.log('\nReported, not judged.')
const median = (xs: number[]): number | null => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor((s.length - 1) / 2)]
}
for (const id of IDS) {
  const run = runs.get(id)
  if (!run) continue
  const people = run.results
  console.log(`  ${id}`)
  for (const st of [EARLY, MIDDLE, LATE]) {
    const m = over(people, st, (x) => x)
    const avg = (f: (x: { without: number; with: number; told: number; flat: number }) => number): string => (m.reduce((s, x) => s + f(x), 0) / m.length).toFixed(3)
    const days = people.reduce((s, p) => s + p.use.days[st[0] + 1], 0)
    const of = people.reduce((s, p) => s + p.picked[st[0] + 1], 0)
    const aware = people.reduce((s, p) => s + p.aware[st[0] + 1], 0)
    console.log(`    ${name(st)}: without ${avg((x) => x.without)}, with ${avg((x) => x.with)}, told ${avg((x) => x.told)}, the flat way ${avg((x) => x.flat)}; in use on ${((100 * days) / of).toFixed(1)} of 100 days; today's pick tells weekdays apart on ${((100 * aware) / of).toFixed(1)}`)
  }
  const firsts = people.flatMap((p) => (p.use.first === null ? [] : [p.use.first + 1]))
  console.log(`    ever in use: ${firsts.length} of ${people.length}; the middle first day in use: ${median(firsts) ?? '-'}; out of use again: ${people.filter((p) => p.use.first !== null && p.use.offs > 0).length}; in use on day 180: ${people.filter((p) => p.use.last === 1).length}`)
  const by = Array.from({ length: 7 }, (_, k) => {
    const a = people.reduce((s, p) => s + p.h[k][0], 0)
    const b = people.reduce((s, p) => s + p.h[k][1], 0)
    const c = people.reduce((s, p) => s + p.h[k][2], 0)
    const n = people.reduce((s, p) => s + p.h[k][3], 0)
    return `${k + 1}: ${(a / n).toFixed(2)}/${(b / n).toFixed(2)}/${(c / n).toFixed(2)}`
  })
  console.log(`    days 151 to 180 by days ahead (without/with/told): ${by.join('; ')}`)
  if (id !== 'rhythm' && id.startsWith('rhythm')) {
    const g1 = interval(over(people, LATE, (m) => m.without - m.with))
    const b1 = interval(over(people, LATE, (m) => m.without - m.told))
    const g2 = interval(over(people, MIDDLE, (m) => m.without - m.with))
    console.log(`    criterion 1's numbers: g ${show(g1)}, b ${b1.mean.toFixed(3)}; criterion 2's: ${show(g2)}`)
  }
  if (id === 'rhythm' && run.truth) {
    const truth = run.truth[0].map((row) => row.reduce((a, b) => a + b, 0) / row.length)
    const centre = truth.reduce((a, b) => a + b, 0) / 7
    const shown = people.flatMap((p) => (p.shifts ? [p.shifts] : []))
    const avg = Array.from({ length: 7 }, (_, w) => shown.reduce((s, x) => s + x[w], 0) / Math.max(1, shown.length))
    const off = shown.length ? shown.reduce((s, x) => s + x.reduce((t, v, w) => t + Math.abs(v - (truth[w] - centre)), 0) / 7, 0) / shown.length : NaN
    console.log(`    the shifts in use on day 180, Sunday first, averaged over ${shown.length} people: ${avg.map((v) => v.toFixed(1)).join(' ')}; the true ones: ${truth.map((v) => (v - centre).toFixed(1)).join(' ')}; a shift is off by ${off.toFixed(2)} points on average`)
  }
  if (NO_WEEKDAY.includes(id)) {
    const used = people.filter((p) => p.use.first !== null)
    if (used.length > 1) console.log(`    among the ${used.length} ever in use, with less without over days 29 to 180: ${show(interval(over(used, ALL, (m) => m.with - m.without)))}`)
  }
}
for (const id of USELESS_FOR_CHALLENGER) {
  const r = chRuns.get(id)
  if (r) console.log(`  the challenger in ${id}: adopted for ${r.results.filter((p) => p.ch?.adopted === 1).length} of ${r.results.length}; with the new way ever in use for ${r.results.filter((p) => p.use.first !== null).length}`)
}
