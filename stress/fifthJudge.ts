import { existsSync, readFileSync } from 'node:fs'
import { type FifthPerson } from './fifthSim'

// The week ahead's fifth way: its judge (criteria frozen 2026-11-20 before the first run; the plan holds them).
// Criterion 1: in `plain`, `streaks`, `sparse` and `season` the fifth way is picked on some day for fewer than one
// person in twenty (at most 80 of 2,000 passes at once, 100 or more fails at once, 81 to 99 is read again on 8,000
// more and passes at 457 of 10,000). Criterion 2: in `rhythm`, the day-ahead miss over days 151 to 180, four's less
// five's, averaged over people, has a 95 percent interval wholly above nothing. Criterion 3: the challenger, on the
// pick of five, is adopted for fewer than one person in twenty in Phase 8's five useless worlds, by criterion 1's rule.
// Criterion 4: in criterion 1's worlds, five's miss less four's has an interval whose upper end is under 0.1 points.
//
// node stress/.out/fifthJudge.mjs <results folder> [tuning]

const [folder, mode] = process.argv.slice(2)
if (!folder) throw new Error('usage: fifthJudge.mjs <results folder> [tuning]')
const tuning = mode === 'tuning'
const load = (path: string): FifthPerson[] | null => (existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as { results: FifthPerson[] }).results : null)
const IDS = ['plain', 'streaks', 'sparse', 'season', 'rhythm', 'rhythm-half']
const worlds = new Map(IDS.flatMap((id) => { const r = load(`${folder}/${id}.json`); return r ? [[id, r] as const] : [] }))
const second = new Map(IDS.flatMap((id) => { const r = load(`${folder}/second/${id}.json`); return r ? [[id, r] as const] : [] }))
const NO_WEEKDAY = ['plain', 'streaks', 'sparse', 'season']
const USELESS_FOR_CHALLENGER = ['plain', 'streaks', 'sparse', 'rhythm', 'season']

function wilson(k: number, n: number): [number, number] {
  const z = 1.959963984540054
  const p = k / n
  const den = 1 + (z * z) / n
  const mid = (p + (z * z) / (2 * n)) / den
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den
  return [100 * (mid - half), 100 * (mid + half)]
}
const pickedFifth = (p: FifthPerson): boolean => p.days.some((d) => d[1] === 1)
const adopted = (p: FifthPerson): boolean => p.days.some((d) => d[2] === 1)

/** Criterion 1's and 3's rule on one world. */
function readOnce(id: string, hit: (p: FifthPerson) => boolean, again: string): { line: string; pass: boolean } {
  const people = worlds.get(id) as FifthPerson[]
  const k = people.filter(hit).length
  const [lo, hi] = wilson(k, people.length)
  let verdict: string
  if (tuning) verdict = 'tuning'
  else if (k <= 80) verdict = 'PASS'
  else if (k >= 100) verdict = 'FAIL'
  else {
    const more = second.get(id)
    if (!more) verdict = `READ AGAIN on ${again}`
    else {
      const k2 = k + more.filter(hit).length
      verdict = k2 <= 457 ? `PASS on the second read (${k2} of ${people.length + more.length})` : `FAIL on the second read (${k2} of ${people.length + more.length})`
    }
  }
  return { line: `${k} of ${people.length} (${((100 * k) / people.length).toFixed(2)} in 100; interval ${lo.toFixed(2)} to ${hi.toFixed(2)}): ${verdict}`, pass: verdict.startsWith('PASS') }
}

/** The average over people of four's day-ahead miss less five's, and its 95 percent interval (normal). */
function gainOf(people: readonly FifthPerson[]): { mean: number; lo: number; hi: number; n: number } {
  const diffs = people.filter((p) => p.four.n > 0 && p.five.n > 0).map((p) => p.four.sum / p.four.n - p.five.sum / p.five.n)
  const n = diffs.length
  const mean = diffs.reduce((s, v) => s + v, 0) / n
  const sd = Math.sqrt(diffs.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1))
  const half = (1.959963984540054 * sd) / Math.sqrt(n)
  return { mean, lo: mean - half, hi: mean + half, n }
}
const f3 = (v: number): string => v.toFixed(3)

console.log(`folder ${folder}${tuning ? ' (tuning)' : ''}`)
let all = true
for (const id of NO_WEEKDAY) {
  if (!worlds.has(id)) continue
  const r = readOnce(id, pickedFifth, 'seeds 802001 to 810000')
  if (!r.pass) all = false
  console.log(`criterion 1, ${id}: the fifth way picked for ${r.line}`)
}
if (worlds.has('rhythm')) {
  const g = gainOf(worlds.get('rhythm') as FifthPerson[])
  const pass = g.lo > 0
  if (!pass && !tuning) all = false
  console.log(`criterion 2, rhythm: four's day-ahead miss less five's, days 151 to 180, averaged over ${g.n} people: ${f3(g.mean)} points (interval ${f3(g.lo)} to ${f3(g.hi)}): ${tuning ? 'tuning' : pass ? 'PASS' : 'FAIL'}`)
}
for (const id of USELESS_FOR_CHALLENGER) {
  if (!worlds.has(id)) continue
  const r = readOnce(id, adopted, 'seeds 802001 to 810000')
  if (!r.pass) all = false
  console.log(`criterion 3, ${id}: the challenger adopted, on the pick of five, for ${r.line}`)
}
for (const id of NO_WEEKDAY) {
  if (!worlds.has(id)) continue
  const g = gainOf(worlds.get(id) as FifthPerson[])
  // Five's miss less four's is the gain turned round: its interval's upper end is minus the gain's lower end.
  const worseHi = -g.lo
  const pass = worseHi < 0.1
  if (!pass && !tuning) all = false
  console.log(`criterion 4, ${id}: five's day-ahead miss less four's, averaged over ${g.n} people: ${f3(-g.mean)} points (interval ${f3(-g.hi)} to ${f3(worseHi)}; under 0.1 at its upper end): ${tuning ? 'tuning' : pass ? 'PASS' : 'FAIL'}`)
}

console.log('\nreported:')
for (const id of IDS) {
  const people = worlds.get(id)
  if (!people) continue
  const lastDay = (p: FifthPerson): boolean => { const d = p.days[p.days.length - 1]; return d !== undefined && d[0] === 179 && d[1] === 1 }
  const firsts = people.flatMap((p) => { const d = p.days.find((x) => x[1] === 1); return d ? [d[0] + 1] : [] }).sort((a, b) => a - b)
  const dayShare = people.reduce((s, p) => s + p.days.filter((d) => d[1] === 1).length, 0) / Math.max(1, people.reduce((s, p) => s + p.days.length, 0))
  const slots = people.reduce((s, p) => ({ five: s.five + p.pickedSlots.five, four: s.four + p.pickedSlots.four, n: s.n + p.pickedSlots.n }), { five: 0, four: 0, n: 0 })
  const g = gainOf(people)
  console.log(`  ${id.padEnd(12)} picked on day 180 ${people.filter(lastDay).length} of ${people.length}; picked on some day ${people.filter(pickedFifth).length}; median first day ${firsts.length ? firsts[Math.floor(firsts.length / 2)] : '-'}; share of days ${(100 * dayShare).toFixed(2)} in 100; on picked days its day-ahead miss ${slots.n ? f3((slots.five - slots.four) / slots.n) : '-'} points against four's (${slots.n} slots); four's miss less five's ${f3(g.mean)} (${f3(g.lo)} to ${f3(g.hi)}); the challenger adopted ${people.filter(adopted).length}`)
}
const rh = worlds.get('rhythm')
if (rh) {
  const cells = new Map<string, number>()
  for (const p of rh) for (const c of p.lastCells) cells.set(c, (cells.get(c) ?? 0) + 1)
  console.log(`  rhythm, the weekday cells at a steady pattern on day 180 (block.weekday, 0 Sunday): ${[...cells].sort((a, b) => b[1] - a[1]).map(([c, k]) => `${c} ${k}`).join(', ') || 'none'}`)
}
if (!tuning) console.log(`\nVERDICT: ${all ? 'PASS' : 'NOT A PASS'}`)
