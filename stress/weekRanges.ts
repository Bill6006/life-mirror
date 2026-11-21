import { existsSync, writeFileSync } from 'node:fs'
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import { BLOCKS } from '../src/blocks'
import { BACKTEST_DAYS, chooseModel, errorBand, forecastsDue, HORIZON, MIN_DAYS_TODAY, MIN_DAYS_WEEK, MODELS, predict, type ModelId } from '../src/forecast'
import { slotKey } from '../src/observe'
import { recordOf } from './countedWorlds'
import { DAYS, FIRST_DAY } from './forecastSim'
import { levelWeekdayRows, rangeTrackerOf, WEEK, type RangeInputs, type WeekNumbers, type WeekRow } from './levelWeekday'
import { STRETCHES, weekWorldById } from './weekSim'

// The level-plus-weekday way's RANGES: their simulation (the points passed their verdict on 2026-11-21, RESULTS-13.md;
// the ranges' criteria were frozen that day before the way's range code was written, and the private repository holds
// them). Every day from day 15 to day 180 the rows the app would write (today and each of the next seven days, each
// check-in: a point, a low and a high, rounded and kept to 0 to 100 as the app stores them) are written twice: by
// today's system, and by the system with the way, whose rows are the way's on a day it is in use and today's
// otherwise. Each row is then set beside what was answered: whether the answer fell inside the range, how wide the
// range was, and the range's score (its width, plus five times how far outside it the answer fell: the usual score for
// a range meant to hold six answers in ten; lower is better).
//
// Today's rows are worked out with each past forecast made once (the app makes them again every day). Every fiftieth
// person's rows are also written by the app's own chooseModel and forecastsDue, every tenth day, and every fiftieth
// person's rows of the way by the function that reads the record alone (levelWeekdayRows): a difference stops the run.
// Offline only: nothing in src/ imports this folder.
//
// node stress/.out/weekRanges.mjs run <world> <fromSeed> <toSeed> <out.json> [threads] [baseline]
// node stress/.out/weekRanges.mjs judge <folder> [tuning]
// With "baseline" the way is left out: today's system alone, read before the ranges' criteria were frozen.

/** What is kept of a set of rows: how many, then for today's system and for the system with the way: answers inside the range, the summed width, the summed score, the summed miss of the stored point. */
export type Sums = [n: number, hit0: number, hit1: number, width0: number, width1: number, score0: number, score1: number, miss0: number, miss1: number]
const zero = (): Sums => [0, 0, 0, 0, 0, 0, 0, 0, 0]

export interface RangePerson {
  seed: number
  /** By stretch of the day forecast (days 29 to 90, 91 to 150, 151 to 180): the week ahead's rows (one to seven days ahead). */
  week: Sums[]
  /** By stretch: today's own rows (written on the day itself). */
  today: Sums[]
  /** By stretch: only the rows written on days the way was in use, today's and the week ahead's together. */
  used: Sums[]
  /** The last stretch by days ahead, 0 to 7. */
  ahead: Sums[]
  /** Days the way was in use; and slots it left without a row where today's system wrote one. */
  days: number
  left: number
  ms: number
}

const score = (lo: number, hi: number, actual: number): number => hi - lo + 5 * Math.max(0, lo - actual) + 5 * Math.max(0, actual - hi)
const stretchOf = (d: number): number => STRETCHES.findIndex(([a, z]) => d >= a && d <= z)
const round = (v: number): number => Math.round(v * 1000) / 1000
/** As the app stores a number of a row (src/forecast.ts's clamp). */
const clamp = (v: number): number => Math.max(0, Math.min(100, Math.round(v)))

/** One simulated person through one world: every day's rows by today's system and by the system with the way. */
export function runRanges(worldId: string, seed: number, numbers: WeekNumbers | null): RangePerson {
  const t0 = performance.now()
  const world = weekWorldById(worldId)
  const rec = recordOf(world.spec, seed)
  const index = new Map(rec.dayName.slice(0, DAYS).map((name, d) => [name, d]))
  /** The whole record; a forecast reads it only up to a day, through `upTo`. */
  const all = new Map<string, number>()
  for (let d = 0; d < DAYS; d++) BLOCKS.forEach((b, i) => { const v = rec.reading[d][i]; if (v !== null) all.set(slotKey(rec.dayName[d], b), v) })
  /** The record as it stood at the end of a day (0 first): what the app's visibleBefore gives, without copying it. */
  const upTo = (last: number): ReadonlyMap<string, number> => {
    const limit = last >= 0 ? rec.dayName[last] : ''
    return { get: (k: string) => (last >= 0 && k.slice(0, 10) <= limit ? all.get(k) : undefined) } as unknown as ReadonlyMap<string, number>
  }
  /** A way's miss on a past slot as it would have been forecast `ahead` days out (the app's backtest: from the record as it stood that many days before the day): the reading less the forecast, made once. */
  const missMemo = new Map<string, number | null>()
  const missOf = (model: ModelId, x: number, i: number, ahead: number): number | null => {
    const key = `${model}|${x}|${i}|${ahead}`
    if (!missMemo.has(key)) {
      const actual = rec.reading[x][i]
      const p = actual === null ? null : predict(model, upTo(x - Math.max(1, ahead)), rec.dayName[x], BLOCKS[i])
      missMemo.set(key, actual === null || p === null ? null : actual - p)
    }
    return missMemo.get(key) as number | null
  }
  /** A way's misses over the 28 days before day t at a distance: what its range is taken from (the app's backtest). */
  const missesBefore = (model: ModelId, t: number, ahead: number): number[] => {
    const out: number[] = []
    for (let back = 1; back <= BACKTEST_DAYS; back++) {
      const x = t - back
      if (x < 0) continue
      for (let i = 0; i < BLOCKS.length; i++) {
        const e = missOf(model, x, i, ahead)
        if (e !== null) out.push(e)
      }
    }
    return out
  }
  /** The app's pick for day t (chooseModel) and the range for a distance (horizonBand), from those misses. */
  const pickOn = (t: number): ModelId | null => {
    let best: { model: ModelId; mae: number } | null = null
    for (const model of MODELS) {
      const e = missesBefore(model, t, 1)
      if (e.length < 5) continue
      const mae = e.reduce((s, v) => s + Math.abs(v), 0) / e.length
      if (best === null || mae < best.mae) best = { model, mae }
    }
    return best ? best.model : null
  }
  const bandOn = (model: ModelId, t: number, ahead: number): { lo: number; hi: number } => {
    if (ahead > 1) {
      const far = missesBefore(model, t, ahead)
      if (far.length >= 5) return errorBand(far)
    }
    return errorBand(missesBefore(model, t, 1))
  }

  const inputs: RangeInputs = {
    reading: (day, block) => rec.reading[day][block],
    flatMiss: (day, block, ahead) => missOf('sameBlock', day, block, ahead),
    flatForecast: (t, day, block) => predict('sameBlock', upTo(t - 1), rec.dayName[day], BLOCKS[block]),
    weekday: (day) => rec.weekday[day],
    dayName: (day) => rec.dayName[day],
  }
  const tracker = numbers ? rangeTrackerOf(numbers, inputs) : null
  const week = STRETCHES.map(zero)
  const today = STRETCHES.map(zero)
  const used = STRETCHES.map(zero)
  const ahead = Array.from({ length: 8 }, zero)
  let days = 0
  let left = 0
  const none = new Set<string>()
  const logged = new Set<number>()

  for (let t = 0; t < DAYS; t++) {
    if (t > 0 && rec.reading[t - 1].some((v) => v !== null)) logged.add(t - 1)
    const state = tracker ? tracker.stateOn(t) : null
    if (t < FIRST_DAY || logged.size < MIN_DAYS_TODAY) continue
    const day = rec.dayName[t]
    const before = upTo(t - 1)
    const model = pickOn(t)
    if (!model) continue
    // Today's system: every row due, as the app's forecastsDue writes them.
    const maxHorizon = logged.size >= MIN_DAYS_WEEK ? HORIZON : 0
    const rows: { d: number; i: number; horizon: number; point: number; lo: number; hi: number }[] = []
    for (let h = 0; h <= maxHorizon; h++) {
      const d = t + h
      if (d >= DAYS) break
      const band = bandOn(model, t, Math.max(1, h))
      for (let i = 0; i < BLOCKS.length; i++) {
        const p = predict(model, before, rec.dayName[d], BLOCKS[i])
        if (p === null) continue
        rows.push({ d, i, horizon: h, point: clamp(p), lo: clamp(p + band.lo), hi: clamp(p + band.hi) })
      }
    }
    // Every fiftieth person, every tenth day: the same rows by the app's own functions, on a copy of the record as it stood.
    if (seed % 50 === 0 && t % 10 === 0) {
      const copy = new Map<string, number>()
      for (const [k, v] of all) if (k.slice(0, 10) < day) copy.set(k, v)
      const chosen = chooseModel(copy, day)
      const own = chosen ? forecastsDue(chosen, copy, [], day, none).filter((f) => index.has(f.day)) : []
      const same = chosen?.model === model && own.length === rows.length && own.every((f, k) => { const r = rows[k]; return index.get(f.day) === r.d && BLOCKS.indexOf(f.block) === r.i && f.horizon === r.horizon && f.point === r.point && f.lo === r.lo && f.hi === r.hi })
      if (!same) throw new Error(`seed ${seed}, day ${t}: today's rows differ from the app's own`)
    }
    const inUse = state !== null && state.inUse
    let own: Map<string, WeekRow> | null = null
    if (tracker && numbers) {
      if (inUse) {
        days++
        own = tracker.rowsOn(t)
      }
      // Every fiftieth person, every tenth day: the way's rows worked out again from the record alone, as the app would.
      if (seed % 50 === 0 && t % 10 === 0) {
        const copy = new Map<string, number>()
        for (const [k, v] of all) if (k.slice(0, 10) < day) copy.set(k, v)
        const alone = levelWeekdayRows(copy, day, numbers)
        const same = own === null ? alone === null : alone !== null && alone.size === own.size && [...own].every(([k, r]) => { const a = alone.get(k); return a !== undefined && a.point === r.point && a.lo === r.lo && a.hi === r.hi })
        if (!same) throw new Error(`seed ${seed}, day ${t}: the way's rows differ from those worked out from the record alone`)
      }
    }
    for (const f of rows) {
      const actual = rec.reading[f.d][f.i]
      if (actual === null) continue
      const st = stretchOf(f.d)
      if (st < 0) continue
      let w: { point: number; lo: number; hi: number } = f
      if (own) {
        const r = own.get(`${rec.dayName[f.d]}|${BLOCKS[f.i]}|${f.horizon}`)
        if (!r) {
          left++
          continue
        }
        w = r
      }
      const add = (s: Sums): void => {
        s[0]++
        if (actual >= f.lo && actual <= f.hi) s[1]++
        if (actual >= w.lo && actual <= w.hi) s[2]++
        s[3] += f.hi - f.lo
        s[4] += w.hi - w.lo
        s[5] += score(f.lo, f.hi, actual)
        s[6] += score(w.lo, w.hi, actual)
        s[7] += Math.abs(actual - f.point)
        s[8] += Math.abs(actual - w.point)
      }
      add(f.horizon === 0 ? today[st] : week[st])
      if (own) add(used[st])
      if (st === STRETCHES.length - 1) add(ahead[f.horizon])
    }
  }
  const tidy = (s: Sums): Sums => s.map(round) as Sums
  return { seed, week: week.map(tidy), today: today.map(tidy), used: used.map(tidy), ahead: ahead.map(tidy), days, left, ms: Math.round(performance.now() - t0) }
}

interface Job {
  world: string
  seeds: number[]
  numbers: WeekNumbers | null
}

if (!isMainThread) {
  const job = workerData as Job
  for (const seed of job.seeds) parentPort?.postMessage(runRanges(job.world, seed, job.numbers))
  parentPort?.postMessage('done')
} else if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && /weekRanges\.mjs$/.test(process.argv[1])) {
  // (Only when this file is the program run: bundled into another program, such as the fixture's, it stays quiet.)
  const [what, ...rest] = process.argv.slice(2)
  if (what === 'run') {
    const [world, from, to, out, threadsArg, mode] = rest
    if (!world || !from || !to || !out) throw new Error('usage: weekRanges.mjs run <world> <fromSeed> <toSeed> <out.json> [threads] [baseline]')
    weekWorldById(world)
    if (existsSync(out)) throw new Error(`${out} is already there: a range is read once`)
    const numbers = mode === 'baseline' ? null : WEEK
    const seeds: number[] = []
    for (let s = Number(from); s <= Number(to); s++) seeds.push(s)
    const threads = Math.min(Number(threadsArg || 12), seeds.length)
    const results: RangePerson[] = []
    const t0 = Date.now()
    let finished = 0
    await new Promise<void>((resolve, reject) => {
      for (let i = 0; i < threads; i++) {
        const mine = seeds.filter((_, k) => k % threads === i)
        const w = new Worker(fileURLToPath(import.meta.url), { workerData: { world, seeds: mine, numbers } satisfies Job })
        w.on('message', (m: RangePerson | 'done') => {
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
    if (results.length !== seeds.length) throw new Error(`${world}: ${results.length} results for ${seeds.length} seeds`)
    writeFileSync(out, JSON.stringify({ world, seeds: [Number(from), Number(to)], numbers, ms: Date.now() - t0, results }))
    process.stderr.write(`${world}: ${results.length} people in ${Math.round((Date.now() - t0) / 1000)} s -> ${out}\n`)
  } else if (what === 'judge') {
    const { judgeRanges } = await import('./weekRangesJudge')
    judgeRanges(rest[0], rest[1] === 'tuning')
  } else throw new Error('run or judge')
}
