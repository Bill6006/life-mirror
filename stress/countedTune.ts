import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import { seeded, seedOf, standings, stretchesOf, WORTH_POINTS, type Compared, type Point } from '../src/counted/compare'
import { countedWorldById, EVENING_THINGS, eveningPoints, LOOKS, recordOf } from './countedWorlds'

// Tuning only, on seeds 1 to 1000, which the frozen criteria set aside for finding faults in the harness and settling a
// change of method. The with-against-without chance check, tried several ways on the same simulated people: what
// the labels are shuffled within (the stretch, or the stretch and the starting band together), how (freely, or by
// turning the stretch's own order round so that a streak stays a streak), over how long a stretch, and whether the
// difference is read against its own spread. For each way: how often a chance at or under 0.05, 0.01 and 0.005
// turns up with nothing there (an honest check gives 5, 1 and 0.5 in 100), how often a family of twelve shows a
// pattern, and how often a real difference is called. Never a verdict.
//
// node stress/.out/countedTune.mjs <fromSeed> <toSeed> [threads] [worlds,comma,separated]

interface Method {
  id: string
  stretch: number
  byBand: boolean
  how: 'free' | 'turn' | 'turnflip' | 'streaks'
  /** The difference read against its own spread for each arrangement, so an arrangement that leans on few occasions does not look larger than it is. */
  scaled: boolean
}

const METHODS: readonly Method[] = [
  { id: 'free14', stretch: 14, byBand: false, how: 'free', scaled: false },
  { id: 'free14+band', stretch: 14, byBand: true, how: 'free', scaled: false },
  { id: 'free28+band', stretch: 28, byBand: true, how: 'free', scaled: false },
  { id: 'turn14', stretch: 14, byBand: false, how: 'turn', scaled: false },
  { id: 'turn14+band', stretch: 14, byBand: true, how: 'turn', scaled: false },
  { id: 'turn28+band', stretch: 28, byBand: true, how: 'turn', scaled: false },
  { id: 'free14 scaled', stretch: 14, byBand: false, how: 'free', scaled: true },
  { id: 'turn14 scaled', stretch: 14, byBand: false, how: 'turn', scaled: true },
  { id: 'turn28 scaled', stretch: 28, byBand: false, how: 'turn', scaled: true },
  { id: 'flip14 scaled', stretch: 14, byBand: false, how: 'turnflip', scaled: true },
  { id: 'streaks14 scaled', stretch: 14, byBand: false, how: 'streaks', scaled: true },
  { id: 'streaks14', stretch: 14, byBand: false, how: 'streaks', scaled: false },
  { id: 'turn7 scaled', stretch: 7, byBand: false, how: 'turn', scaled: true },
  { id: 'turn21 scaled', stretch: 21, byBand: false, how: 'turn', scaled: true },
]

const WORLDS = ['independent-30', 'runs', 'weekly-rhythm', 'missing-on-state', 'follows-band', 'runs-persistent', 'season', 'fifteen-points', 'ten-points']
const SHUFFLES = 2000
const STOP = 100

/** One comparison one way: the real difference and its chance. */
function chanceOf(points: readonly Point[], method: Method, seed: number): { diff: number | null; p: number | null; n: number; m: number } {
  const rows = points.length
  const n = points.filter((p) => p.event).length
  const m = rows - n
  const bandIndex = new Map<string, number>()
  const band = Int32Array.from(points, (p) => bandIndex.get(p.band ?? '') ?? bandIndex.set(p.band ?? '', bandIndex.size).size - 1)
  const bands = bandIndex.size
  const outcome = Float64Array.from(points, (p) => p.outcome)
  const sumA = new Float64Array(bands)
  const sumB = new Float64Array(bands)
  const na = new Int32Array(bands)
  const nb = new Int32Array(bands)
  /** The like-for-like difference, and with `scaled` the same over the square root of what its spread is proportional to. */
  const measure = (events: Uint8Array, scaled: boolean): number | null => {
    sumA.fill(0)
    sumB.fill(0)
    na.fill(0)
    nb.fill(0)
    for (let i = 0; i < rows; i++) {
      if (events[i]) {
        sumA[band[i]] += outcome[i]
        na[band[i]]++
      } else {
        sumB[band[i]] += outcome[i]
        nb[band[i]]++
      }
    }
    let sum = 0
    let weight = 0
    let spread = 0
    for (let b = 0; b < bands; b++) {
      if (!na[b] || !nb[b]) continue
      const w = Math.min(na[b], nb[b])
      sum += w * (sumA[b] / na[b] - sumB[b] / nb[b])
      weight += w
      spread += w * w * (1 / na[b] + 1 / nb[b])
    }
    if (!(weight > 0)) return null
    return scaled ? sum / Math.sqrt(spread) : sum / weight
  }
  const real = Uint8Array.from(points, (p) => (p.event ? 1 : 0))
  const diff = measure(real, false)
  if (n < 8 || m < 8 || diff === null) return { diff, p: null, n, m }
  // The groups the labels move within, each in time order.
  const stretch = stretchesOf(points.map((p) => p.day), method.stretch)
  const groups = new Map<string, number[]>()
  for (let i = 0; i < rows; i++) {
    const key = method.byBand ? `${stretch[i]}|${band[i]}` : String(stretch[i])
    const g = groups.get(key)
    if (g) g.push(i)
    else groups.set(key, [i])
  }
  const strata = [...groups.values()].filter((g) => g.length > 1)
  // Each group's streaks as they really fell: the first label, then the lengths of the streaks with the thing and without it.
  const streaks = strata.map((g) => {
    const on: number[] = []
    const off: number[] = []
    let length = 1
    for (let i = 1; i <= g.length; i++) {
      if (i < g.length && real[g[i]] === real[g[i - 1]]) length++
      else {
        ;(real[g[i - 1]] ? on : off).push(length)
        length = 1
      }
    }
    return { first: real[g[0]], on, off }
  })
  const mix = (list: number[]): void => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1))
      const a = list[i]
      list[i] = list[j]
      list[j] = a
    }
  }
  const next = seeded(seed)
  const work = Uint8Array.from(real)
  const target = Math.abs(measure(real, method.scaled) ?? 0)
  let reached = 0
  let done = 0
  for (let s = 0; s < SHUFFLES && reached < STOP; s++) {
    for (let gi = 0; gi < strata.length; gi++) {
      const g = strata[gi]
      if (method.how === 'streaks') {
        // The streaks change places: each streak with the thing, and each without, keeps its length and takes another's turn.
        const s = streaks[gi]
        mix(s.on)
        mix(s.off)
        let at = 0
        let value = s.first
        let a = 0
        let b = 0
        while (at < g.length) {
          const length = value ? s.on[a++] : s.off[b++]
          for (let i = 0; i < length; i++) work[g[at++]] = value
          value = value ? 0 : 1
        }
      } else if (method.how === 'free') {
        for (let i = g.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1))
          const a = work[g[i]]
          work[g[i]] = work[g[j]]
          work[g[j]] = a
        }
      } else if (method.how === 'turn') {
        // Turned round: every label moves the same number of places along the group's own order, so a streak stays a streak.
        const k = Math.floor(next() * g.length)
        for (let i = 0; i < g.length; i++) work[g[i]] = real[g[(i + k) % g.length]]
      } else {
        // Turned round, and half the time read backwards first: a streak is as likely one way round as the other.
        const k = Math.floor(next() * g.length)
        const back = next() < 0.5
        for (let i = 0; i < g.length; i++) work[g[i]] = real[g[((back ? g.length - 1 - i : i) + k) % g.length]]
      }
    }
    done++
    if (Math.abs(measure(work, method.scaled) ?? 0) >= target - 1e-12) reached++
  }
  return { diff, p: (reached + 1) / (done + 1), n, m }
}

/** Counters for one world, one look and one method. */
interface Tally {
  tested: number
  c05: number
  c01: number
  c005: number
  people: number
  pattern: number
  lead: number
  first: number
}
type Tallies = Record<string, Tally>
const key = (world: string, look: number, method: string): string => `${world}|${look}|${method}`
const empty = (): Tally => ({ tested: 0, c05: 0, c01: 0, c005: 0, people: 0, pattern: 0, lead: 0, first: 0 })

function tallyFor(worlds: readonly string[], seeds: readonly number[], methods: readonly Method[]): Tallies {
  const out: Tallies = {}
  for (const id of worlds) {
    const spec = countedWorldById(id)
    for (const seed of seeds) {
      const rec = recordOf(spec, seed)
      for (const look of LOOKS) {
        const points = Array.from({ length: EVENING_THINGS }, (_, j) => eveningPoints(rec, look, j))
        for (const method of methods) {
          const t = (out[key(id, look, method.id)] ??= empty())
          const family: Compared[] = points.map((pts, j) => {
            const c = chanceOf(pts, method, seedOf(`${id}|${seed}|${look}|${j}|${method.id}`))
            return { id: String(j), n: c.n, m: c.m, diff: c.diff, enough: c.p !== null, p: c.p, worth: WORTH_POINTS }
          })
          // With a real difference the first thing is not a comparison with nothing there.
          family.forEach((c, j) => {
            if (c.p === null || (spec.effect && j === 0)) return
            t.tested++
            if (c.p <= 0.05) t.c05++
            if (c.p <= 0.01) t.c01++
            if (c.p <= 0.005) t.c005++
          })
          const stood = standings(family)
          t.people++
          const others = stood.filter((_, j) => !(spec.effect && j === 0))
          if (others.some((s) => s.standing === 'pattern')) t.pattern++
          else if (others.some((s) => s.standing === 'lead')) t.lead++
          if (stood[0].standing === 'pattern' && stood[0].direction === 'higher') t.first++
        }
      }
    }
  }
  return out
}

if (!isMainThread) {
  const job = workerData as { worlds: string[]; methods: string[]; seeds: number[] }
  parentPort?.postMessage(tallyFor(job.worlds, job.seeds, METHODS.filter((m) => job.methods.includes(m.id))))
} else if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [from, to, threadsArg, worldsArg, methodsArg] = process.argv.slice(2)
  if (!from || !to) throw new Error('usage: countedTune.mjs <fromSeed> <toSeed> [threads] [worlds]')
  if (Number(to) > 1000) throw new Error('tuning reads seeds 1 to 1000 only')
  const worlds = worldsArg && worldsArg !== 'all' ? worldsArg.split(',') : WORLDS
  const methods = methodsArg ? METHODS.filter((m) => methodsArg.split(',').includes(m.id.replace(' ', '-'))) : METHODS
  const seeds: number[] = []
  for (let s = Number(from); s <= Number(to); s++) seeds.push(s)
  const threads = Math.min(Number(threadsArg ?? 12), seeds.length)
  const total: Tallies = {}
  await new Promise<void>((resolve, reject) => {
    let finished = 0
    for (let i = 0; i < threads; i++) {
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { worlds, methods: methods.map((m) => m.id), seeds: seeds.filter((_, k) => k % threads === i) } })
      w.on('message', (part: Tallies) => {
        for (const [k, t] of Object.entries(part)) {
          const sum = (total[k] ??= empty())
          for (const f of Object.keys(t) as (keyof Tally)[]) sum[f] += t[f]
        }
        if (++finished === threads) resolve()
      })
      w.on('error', reject)
    }
  })
  const pct = (a: number, b: number): string => (b ? ((100 * a) / b).toFixed(2) : '-').padStart(6)
  const z = (hits: number, n: number, at: number): string => (n ? `${hits / n >= at ? '+' : ''}${((hits / n - at) / Math.sqrt((at * (1 - at)) / n)).toFixed(1)}` : '').padStart(5)
  console.log(`seeds ${from} to ${to}; chances with nothing there (an honest check gives 5.00, 1.00, 0.50), the family of twelve, and the first thing called`)
  console.log('world              look  method           tested  p<=.05     z  p<=.01     z p<=.005     z  pattern%   lead%  first%')
  for (const id of worlds) {
    for (const look of LOOKS) {
      for (const method of methods) {
        const t = total[key(id, look, method.id)]
        if (!t) continue
        console.log(`${id.padEnd(18)} ${String(look).padStart(4)}  ${method.id.padEnd(14)} ${String(t.tested).padStart(8)}  ${pct(t.c05, t.tested)} ${z(t.c05, t.tested, 0.05)}  ${pct(t.c01, t.tested)} ${z(t.c01, t.tested, 0.01)}  ${pct(t.c005, t.tested)} ${z(t.c005, t.tested, 0.005)}    ${pct(t.pattern, t.people)}  ${pct(t.lead, t.people)}  ${pct(t.first, t.people)}`)
      }
    }
    console.log()
  }
}
