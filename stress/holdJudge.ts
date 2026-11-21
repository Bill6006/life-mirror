import { existsSync, readFileSync } from 'node:fs'
import { HOLD_WORLDS, MAX_N, PAIRS, shownAt, STRESS_HIGH, type HoldPerson, type Run } from './holdSim'

// The steady pattern hold's judge (criteria frozen 2026-11-20 before the first run, and frozen anew the same day at the
// owner's word with the hold read up to 60 days, once none from 1 to 30 met their rule; the plan holds both). On the
// tuning seeds it says the N the criteria choose: the smallest from 1 to 60 (MAX_N) at which every useless world has
// at most 30 of 1,000 people shown. On the verdict's seeds, given that N, it reads criterion 1 in every useless world (at most
// 80 of 2,000 passes at once, 100 or more fails at once, 81 to 99 is read again on 8,000 more, passing at 457 of
// 10,000) and criterion 2 in `fifteen-points` (the stress pair shown by day 180 for at least two thirds as many people
// as at N = 1). Everything else is reported.
//
// node stress/.out/holdJudge.mjs <results folder> [N for the verdict]

const [folder, nArg] = process.argv.slice(2)
if (!folder) throw new Error('usage: holdJudge.mjs <results folder> [N]')
const load = (path: string): HoldPerson[] | null => (existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as { results: HoldPerson[] }).results : null)
const worlds = new Map(HOLD_WORLDS.flatMap((w) => { const r = load(`${folder}/${w.id}.json`); return r ? [[w.id, r] as const] : [] }))
const second = new Map(HOLD_WORLDS.flatMap((w) => { const r = load(`${folder}/second/${w.id}.json`); return r ? [[w.id, r] as const] : [] }))

const shown = (p: HoldPerson, n: number, pairs: readonly number[] = PAIRS.map((_, i) => i)): boolean => pairs.some((i) => p.runs[i].some((r: Run) => shownAt(r, n)))
const count = (people: readonly HoldPerson[], n: number, pairs?: readonly number[]): number => people.filter((p) => shown(p, n, pairs)).length
const pct = (k: number, n: number): string => `${((100 * k) / n).toFixed(2)} in 100`

/** Wilson's 95% interval for k of n. */
function wilson(k: number, n: number): [number, number] {
  const z = 1.959963984540054
  const p = k / n
  const den = 1 + (z * z) / n
  const mid = (p + (z * z) / (2 * n)) / den
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den
  return [100 * (mid - half), 100 * (mid + half)]
}

const useless = HOLD_WORLDS.filter((w) => w.kind === 'useless' && worlds.has(w.id))
console.log(`folder ${folder}`)
console.log('people shown at each N (any of the sixteen pairs held on a day from day 15 to day 180):')
const ns = Array.from({ length: MAX_N }, (_, i) => i + 1)
for (const w of HOLD_WORLDS) {
  const people = worlds.get(w.id)
  if (!people) continue
  console.log(`  ${w.id.padEnd(15)} (${people.length}) ${ns.map((n) => `${n}:${count(people, n)}`).join(' ')}`)
}

const tuning = !nArg
let chosen: number | null = nArg ? Number(nArg) : null
if (tuning) {
  // The N the criteria choose, on the tuning seeds: every useless world at most 30 of 1,000.
  const size = useless.length ? (worlds.get(useless[0].id) as HoldPerson[]).length : 0
  chosen = ns.find((n) => useless.every((w) => (count(worlds.get(w.id) as HoldPerson[], n) * 1000) / size <= 30)) ?? null
  console.log(`\nthe criteria's choice on these seeds: ${chosen === null ? `NONE up to ${MAX_N}: the build stops for the owner` : `N = ${chosen}`} (every useless world at most 30 of 1,000)`)
}

if (chosen !== null) {
  const n = chosen
  console.log(`\nat N = ${n}:`)
  let all = true
  for (const w of useless) {
    const people = worlds.get(w.id) as HoldPerson[]
    const k = count(people, n)
    const [lo, hi] = wilson(k, people.length)
    let verdict: string
    if (tuning) verdict = 'tuning'
    else if (k <= 80) verdict = 'PASS'
    else if (k >= 100) verdict = 'FAIL'
    else {
      const more = second.get(w.id)
      if (!more) verdict = 'READ AGAIN on seeds 702001 to 710000'
      else {
        const k2 = k + count(more, n)
        verdict = k2 <= 457 ? `PASS on the second read (${k2} of ${people.length + more.length})` : `FAIL on the second read (${k2} of ${people.length + more.length})`
      }
    }
    if (!verdict.startsWith('PASS') && !tuning) all = false
    console.log(`  criterion 1, ${w.id}: ${k} of ${people.length} shown (${pct(k, people.length)}; interval ${lo.toFixed(2)} to ${hi.toFixed(2)}): ${verdict}`)
  }
  const useful = worlds.get('fifteen-points')
  if (useful) {
    const atN = count(useful, n, [STRESS_HIGH])
    const atOne = count(useful, 1, [STRESS_HIGH])
    const ok = atN * 3 >= atOne * 2
    if (!ok && !tuning) all = false
    console.log(`  criterion 2, fifteen-points: the stress pair shown for ${atN} of ${useful.length} at N = ${n}, ${atOne} at N = 1; ${(atOne ? (100 * atN) / atOne : 0).toFixed(1)} percent of it (two thirds or more): ${tuning ? 'tuning' : ok ? 'PASS' : 'FAIL'}`)
    // Reported: how long a real pair waits, and how often a held one falls back.
    const waits: number[] = []
    let fell = 0
    let held = 0
    for (const p of useful) {
      const runs = p.runs[STRESS_HIGH]
      if (!runs.length) continue
      const first = runs[0][0]
      const firstHeld = runs.find((r) => r[1] >= n)
      if (firstHeld) waits.push(firstHeld[0] + n - 1 - first)
      const heldRuns = runs.filter((r) => r[1] >= n)
      held += heldRuns.length
      fell += heldRuns.filter((r) => r[0] + r[1] < 180).length
    }
    waits.sort((a, b) => a - b)
    console.log(`  reported, fifteen-points: median days from the stress pair's first day at a pattern to its first day held ${waits.length ? waits[Math.floor(waits.length / 2)] : '-'} (of ${waits.length} people held); held runs ${held}, of them fallen back before day 180 ${fell}`)
  }
  for (const id of ['ten-points', 'own', 'own-persistent']) {
    const people = worlds.get(id)
    if (!people) continue
    const pairsHeld = people.reduce((s, p) => s + p.runs.filter((rs) => rs.some((r) => shownAt(r, n))).length, 0)
    const fellBack = people.reduce((s, p) => s + p.runs.reduce((t, rs) => t + rs.filter((r) => r[1] >= n && r[0] + r[1] < 180).length, 0), 0)
    const stress = id === 'ten-points' ? `; the stress pair shown for ${count(people, n, [STRESS_HIGH])} (at N = 1: ${count(people, 1, [STRESS_HIGH])})` : ''
    console.log(`  reported, ${id}: people shown ${count(people, n)} of ${people.length}; pairs held ${pairsHeld}; held runs fallen back ${fellBack}${stress}`)
  }
  if (!tuning) console.log(`\nVERDICT at N = ${n}: ${all ? 'PASS' : 'NOT A PASS'}`)
}
