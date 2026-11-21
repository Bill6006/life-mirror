import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import { WEEK, type WeekNumbers } from './levelWeekday'
import { runWeekMany, truthOf, weekWorldById, type Truth, type WeekPerson } from './weekSim'

// The level-plus-weekday way's tuning grid: the same people through one world under many settings of the method's
// numbers at once, so every setting inside the frozen limits is read on all the tuning people. Tuning seeds only.
//
// node stress/.out/weekGrid.mjs run <world> <fromSeed> <toSeed> <out.json> [threads]
// node stress/.out/weekGrid.mjs judge <folder> [single-run folder to prove one setting against]

/** The settings tried: every window, shrinking, chance and hold below, inside the limits the criteria state. */
const WINDOWS = [56, 70, 84, 98, 112, 140, 180]
const SHRINKS = [1, 2, 3, 4]
const CHANCES = [0.01, 0.001]
const HOLDS = [28, 42]
const cross = (windows: number[], shrinks: number[], chances: number[], holds: number[]): WeekNumbers[] => windows.flatMap((window) => shrinks.flatMap((shrink) => chances.flatMap((chance) => holds.map((hold) => ({ ...WEEK, window, shrink, chance, hold })))))
/**
 * The first grid, and a second one with far stricter gates and longer holds (the limits put no floor under the chance
 * and no ceiling over the hold): the first showed a stricter gate letting go of a turned pattern sooner.
 */
const GRIDS: Record<string, WeekNumbers[]> = {
  first: cross(WINDOWS, SHRINKS, CHANCES, HOLDS),
  strict: cross([84, 98, 112, 140, 180], [1, 2, 3], [1e-4, 1e-5, 1e-6, 1e-7], [28, 56]),
}
export const GRID: WeekNumbers[] = GRIDS[process.env.WEEK_GRID ?? 'first']
if (!GRID) throw new Error(`no grid ${process.env.WEEK_GRID}`)

/** A person in the grid: what does not depend on the setting, then each setting's own. */
interface GridPerson {
  seed: number
  /** By stretch: today's system, the told forecast, the flat way, the slots. */
  b: [number, number, number, number][]
  /** By setting: the system with the new way by stretch, the first day in use (-1 never), the times it went out of use again. */
  c: [number, number, number, number, number][]
}
const compact = (people: WeekPerson[]): GridPerson => ({
  seed: people[0].seed,
  b: people[0].s.map((row) => [row[0], row[2], row[3], row[4]]),
  c: people.map((p) => [p.s[0][1], p.s[1][1], p.s[2][1], p.use.first ?? -1, p.use.offs]),
})

interface Job {
  world: string
  seeds: number[]
  truth: Truth
}

if (!isMainThread) {
  const job = workerData as Job
  const world = weekWorldById(job.world)
  for (const seed of job.seeds) parentPort?.postMessage(compact(runWeekMany(world, seed, GRID, job.truth)))
  parentPort?.postMessage('done')
} else if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [what, ...rest] = process.argv.slice(2)
  if (what === 'run') {
    const [worldId, from, to, out, threadsArg] = rest
    if (!worldId || !from || !to || !out) throw new Error('usage: weekGrid.mjs run <world> <fromSeed> <toSeed> <out.json> [threads]')
    if (Number(to) > 1000) throw new Error('the grid is for the tuning seeds, 1 to 1000')
    const world = weekWorldById(worldId)
    if (existsSync(out)) throw new Error(`${out} is already there`)
    const seeds: number[] = []
    for (let s = Number(from); s <= Number(to); s++) seeds.push(s)
    const truth = truthOf(world)
    const threads = Math.min(Number(threadsArg ?? 12), seeds.length)
    const results: GridPerson[] = []
    const t0 = Date.now()
    let finished = 0
    await new Promise<void>((resolve, reject) => {
      for (let i = 0; i < threads; i++) {
        const mine = seeds.filter((_, k) => k % threads === i)
        const w = new Worker(fileURLToPath(import.meta.url), { workerData: { world: worldId, seeds: mine, truth } satisfies Job })
        w.on('message', (m: GridPerson | 'done') => {
          if (m === 'done') {
            if (++finished === threads) resolve()
            return
          }
          results.push(m)
        })
        w.on('error', reject)
      }
    })
    results.sort((a, b) => a.seed - b.seed)
    if (results.length !== seeds.length) throw new Error(`${worldId}: ${results.length} results for ${seeds.length} seeds`)
    writeFileSync(out, JSON.stringify({ world: worldId, seeds: [Number(from), Number(to)], grid: GRID, results }))
    process.stderr.write(`${worldId}: ${results.length} people, ${GRID.length} settings, in ${Math.round((Date.now() - t0) / 1000)} s -> ${out}\n`)
  } else if (what === 'judge') {
    const [folder, single] = rest
    if (!folder) throw new Error('usage: weekGrid.mjs judge <folder> [single-run folder]')
    const IDS = ['plain', 'streaks', 'sparse', 'season', 'rhythm', 'rhythm-half', 'rhythm-one', 'rhythm-turn']
    const worlds = new Map(IDS.flatMap((id) => (existsSync(`${folder}/${id}.json`) ? [[id, JSON.parse(readFileSync(`${folder}/${id}.json`, 'utf8')) as { grid: WeekNumbers[]; results: GridPerson[] }] as const] : [])))
    const Z = 1.959963984540054
    const interval = (values: number[]): { mean: number; lo: number; hi: number } => {
      const n = values.length
      const mean = values.reduce((s, v) => s + v, 0) / n
      const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1))
      return { mean, lo: mean - (Z * sd) / Math.sqrt(n), hi: mean + (Z * sd) / Math.sqrt(n) }
    }
    const wilsonHi = (k: number, n: number): number => {
      const p = k / n
      const den = 1 + (Z * Z) / n
      return (100 * ((p + (Z * Z) / (2 * n)) / den + (Z * Math.sqrt((p * (1 - p)) / n + (Z * Z) / (4 * n * n))) / den))
    }
    /** For a world, a setting and some stretches: each person's without, with and told. */
    const values = (id: string, k: number, stretches: number[]): { without: number; with: number; told: number }[] =>
      (worlds.get(id)?.results ?? []).flatMap((p) => {
        const n = stretches.reduce((s, i) => s + p.b[i][3], 0)
        if (!n) return []
        return [{ without: stretches.reduce((s, i) => s + p.b[i][0], 0) / n, with: stretches.reduce((s, i) => s + p.c[k][i], 0) / n, told: stretches.reduce((s, i) => s + p.b[i][1], 0) / n }]
      })
    const grid = [...worlds.values()][0].grid
    console.log(`The tuning grid, seeds 1 to 1000: ${grid.length} settings, ${worlds.size} of 8 worlds read. Nothing here is a verdict.`)
    console.log('window shrink chance hold | C1 g-b/4 (lo)  closed | C2 lo  | C3 worst hi (where)        | C4 mean (hi)   | C5 most ever | C7 left (hi) | would pass')
    const NO_WEEKDAY = ['plain', 'streaks', 'sparse', 'season']
    const C3: [string, number[]][] = [['rhythm', [0]], ['plain', [0, 1, 2]], ['streaks', [0, 1, 2]], ['sparse', [0, 1, 2]], ['season', [0, 1, 2]], ['rhythm-half', [0, 1, 2]], ['rhythm-one', [0, 1, 2]], ['rhythm-turn', [2]]]
    const passing: string[] = []
    const rows: { line: string; c1: number; c4: number; all: boolean; room: number }[] = []
    grid.forEach((numbers, k) => {
      const late = values('rhythm', k, [2])
      const c1 = interval(late.map((m) => m.without - m.with - 0.25 * (m.without - m.told)))
      const g = late.reduce((s, m) => s + m.without - m.with, 0) / late.length
      const b = late.reduce((s, m) => s + m.without - m.told, 0) / late.length
      const c2 = interval(values('rhythm', k, [1]).map((m) => m.without - m.with))
      let worst = { hi: -Infinity, where: '' }
      for (const [id, st] of C3) {
        const v = values(id, k, st)
        if (!v.length) continue
        const h = interval(v.map((m) => m.with - m.without)).hi
        if (h > worst.hi) worst = { hi: h, where: id }
      }
      const c4 = interval(values('rhythm-turn', k, [1, 2]).map((m) => m.with - m.without))
      const ever = Math.max(...NO_WEEKDAY.map((id) => (worlds.get(id)?.results ?? []).filter((p) => p.c[k][3] >= 0).length))
      const came = (worlds.get('rhythm')?.results ?? []).filter((p) => p.c[k][3] >= 0)
      const left = came.filter((p) => p.c[k][4] > 0).length
      const c7hi = came.length ? wilsonHi(left, came.length) : 100
      const ok = { c1: c1.lo > 0, c2: c2.lo > 0, c3: worst.hi < 0.05, c4: c4.hi < 0.1, c5: ever <= 40, c7: came.length > 0 && c7hi < 25 }
      const all = Object.values(ok).every(Boolean)
      const fails = Object.entries(ok).filter(([, v]) => !v).map(([n]) => n).join(' ')
      const line = `${String(numbers.window).padStart(6)} ${String(numbers.shrink).padStart(6)} ${String(numbers.chance).padStart(6)} ${String(numbers.hold).padStart(4)} | ${c1.mean.toFixed(3).padStart(6)} (${c1.lo.toFixed(3)}) ${((100 * g) / b).toFixed(0).padStart(4)}%  | ${c2.lo.toFixed(3).padStart(6)} | ${worst.hi.toFixed(3)} (${worst.where.padEnd(11)})       | ${c4.mean.toFixed(3)} (${c4.hi.toFixed(3)})  | ${String(ever).padStart(5)}        | ${came.length ? ((100 * left) / came.length).toFixed(1).padStart(5) : '    -'} (${c7hi.toFixed(1)}) | ${all ? 'ALL' : `not: ${fails}`}`
      // The room a setting leaves at its tightest interval criterion, in that criterion's own half-widths: the rule for
      // choosing among settings that would pass, written before the second grid was read.
      const half = (i: { lo: number; hi: number }): number => (i.hi - i.lo) / 2
      const c3worst = C3.map(([id, st]) => { const v = values(id, k, st); return v.length ? interval(v.map((m) => m.with - m.without)) : null }).filter((x): x is { mean: number; lo: number; hi: number } => x !== null)
      const room = Math.min(c1.lo / half(c1), c2.lo / half(c2), (0.1 - c4.hi) / half(c4), ...c3worst.map((i) => (0.05 - i.hi) / Math.max(half(i), 1e-9)))
      rows.push({ line: `${line} | room ${room.toFixed(2)}`, c1: c1.lo, c4: c4.hi, all, room })
      if (all) passing.push(line)
    })
    for (const r of rows) console.log(r.line)
    const able = rows.filter((r) => r.all)
    if (able.length) console.log(`\nAmong the settings that would pass, the most room at its tightest criterion:\n${able.reduce((a, r) => (r.room > a.room ? r : a)).line}`)
    console.log(`\nSettings where every criterion read here would pass (criterion 6, the challenger, is not in the grid): ${passing.length} of ${grid.length}`)
    console.log(`Settings where criterion 1 would pass: ${rows.filter((r) => r.c1 > 0).length}; where criterion 4 would pass: ${rows.filter((r) => r.c4 < 0.1).length}; where both would: ${rows.filter((r) => r.c1 > 0 && r.c4 < 0.1).length}`)
    const bestC1 = rows.reduce((a, r) => (r.c1 > a.c1 ? r : a))
    const bestC4 = rows.reduce((a, r) => (r.c4 < a.c4 ? r : a))
    console.log(`The best for criterion 1: ${bestC1.line}`)
    console.log(`The best for criterion 4: ${bestC4.line}`)
    // One setting, proven person by person against a run made with one setting alone.
    if (single) {
      for (const id of IDS) {
        if (!existsSync(`${single}/${id}.json`) || !worlds.has(id)) continue
        const one = JSON.parse(readFileSync(`${single}/${id}.json`, 'utf8')) as { numbers: WeekNumbers; results: WeekPerson[] }
        const k = grid.findIndex((n) => JSON.stringify(n) === JSON.stringify(one.numbers))
        if (k < 0) throw new Error(`the single run's numbers ${JSON.stringify(one.numbers)} are not a setting of the grid`)
        const many = (worlds.get(id) as { results: GridPerson[] }).results
        let differ = 0
        one.results.forEach((p, i) => {
          const q = many[i]
          const same = q.seed === p.seed && [0, 1, 2].every((s) => q.b[s][0] === p.s[s][0] && q.c[k][s] === p.s[s][1] && q.b[s][1] === p.s[s][2] && q.b[s][2] === p.s[s][3] && q.b[s][3] === p.s[s][4]) && q.c[k][3] === (p.use.first ?? -1) && q.c[k][4] === p.use.offs
          if (!same) differ++
        })
        console.log(`${id}: the grid's setting ${JSON.stringify(one.numbers)} against the run made with it alone: ${differ} of ${one.results.length} people differ`)
        if (differ) process.exitCode = 1
      }
    }
  } else throw new Error('run or judge')
}
