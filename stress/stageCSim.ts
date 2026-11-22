import { existsSync, writeFileSync } from 'node:fs'
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import { BLOCKS, type Block } from '../src/blocks'
import { CHALLENGER, kindsAtPattern, runChallenger, type Condition } from '../src/challenger'
import { compare, difference, WORTH_POINTS } from '../src/counted/compare'
import { BACKTEST_DAYS, chooseModel, errorBand, forecastsDue, HORIZON, MIN_DAYS_TODAY, MIN_DAYS_WEEK, MODELS, predict, type ModelId, type WayId } from '../src/forecast'
import { slotKey } from '../src/observe'
import { bandOf } from '../src/score'
import { EVENING_THINGS, eveningPoints, recordOf, type CountedRecord } from './countedWorlds'
import { BORROW_OFFSET, FIRST_DAY, forecastWorldById } from './forecastSim'
import { rangeTrackerOf, WEEK, type WeekRow } from './levelWeekday'
import { STAGE_C, stageCTrackerOf, type StageCInputs, type StageCNumbers } from './stageC'
import { cRecordOf, cTruthOf, cWorldById, DAYS, MEASURES, READINGS, type CTruth } from './stageCWorlds'

// Stage C, the week ahead from what is known about each day: its simulation (designed 2026-11-21 at the owner's word;
// its criteria were frozen that day before the method's code was written, and the private repository holds them).
// Every day from day 15 to day 180 the rows the app would write (today's check-ins and each check-in of the next seven
// days: a point, a low and a high, rounded and kept to 0 to 100 as the app stores them) are written by today's system
// (the four's pick), by the Stage B system (the four's pick, and the level-plus-weekday way where it is in use, exactly
// as its verdicts ran it), by the Stage C system under each setting asked for, and by a forecast told the truth. Each is
// set beside what was then answered. Today's rows are made with each past forecast made once and checked against the
// app's own chooseModel and forecastsDue on every fiftieth person. Offline only: nothing in src/ imports this folder.
//
// node stress/.out/stageCSim.mjs run <world> <fromSeed> <toSeed> <out.json> [threads] [settings as a JSON list | "none"] [challenger]
// "none" leaves Stage C out: today's system, the Stage B system and the told forecast alone, read before the criteria
// were frozen. With "challenger" (one setting only) the app's challenger is also run each day on the way in use.
// A last word "today" (after the mode, "-" for none) has today's system's rows, not the Stage B system's, written on a
// day Stage C is not in use: the design's own arrangement, judged apart by criteria of its own (frozen 2026-11-22).

export const STRETCHES = [
  [28, 89],
  [90, 149],
  [150, 179],
] as const
const stretchOf = (d: number): number => STRETCHES.findIndex(([a, z]) => d >= a && d <= z)
const clamp = (v: number): number => Math.max(0, Math.min(100, Math.round(v)))
const score = (lo: number, hi: number, actual: number): number => hi - lo + 5 * Math.max(0, lo - actual) + 5 * Math.max(0, actual - hi)
const round = (v: number): number => Math.round(v * 1000) / 1000
const EVENING = 2

/** One setting's own sums and state for a person. */
export interface CSetting {
  /** By stretch: the stored point's summed miss, then its ranges: answers inside, summed width, summed score. */
  s: [miss: number, hit: number, width: number, score: number][]
  /** By stretch, over the rows where its row differs from the Stage B system's: how many, Stage B's answers inside, its own. */
  diff: [n: number, hitB: number, hitC: number][]
  /** In use: the first day (0 first) or -1; the days in use before day 29 and in each stretch; the times it went out of use again. */
  first: number
  days: number[]
  offs: number
  /** Ever in use, by term: the score's weekday test, a reading's, each weather measure, then an event. */
  ever: number[]
  /** Ever in use, by kind of event. */
  kinds: number[]
  /** Days it was in use while the Stage B system was not. */
  alone: number
  /** The last stretch by days ahead, 0 to 7: the rows, Stage B's summed miss, its own. */
  ahead: [n: number, missB: number, missC: number][]
}

export interface CPerson {
  seed: number
  /** By stretch, every row (today's and the week ahead's): how many; the stored point's summed miss for today's system, the Stage B system and the told forecast; Stage B's ranges: inside, width, score; and today's system's summed range score. */
  base: [n: number, missToday: number, missB: number, missTold: number, hitB: number, widthB: number, scoreB: number, scoreToday: number][]
  /** The Stage B way in use: the first day or -1, the days in use (before day 29, then each stretch), the times it went out again. */
  b: { first: number; days: number[]; offs: number }
  c: CSetting[]
  /** With the challenger run on one setting: whether it was picked on some day. */
  ch?: { adopted: 0 | 1 }
  ms: number
}

/** One simulated person through one world: every day's rows by each system. */
export function runStageC(worldId: string, seed: number, settings: readonly StageCNumbers[], truth: CTruth, withChallenger = false, beneath: 'stageB' | 'today' = 'stageB'): CPerson {
  if (withChallenger && settings.length !== 1) throw new Error('the challenger is run for one setting at a time')
  const t0 = performance.now()
  const world = cWorldById(worldId)
  const rec = cRecordOf(world, seed)
  const phase = (d: number): number => (world.phase ? world.phase(d) : 0)
  const usualSun = (d: number): number => rec.observed[0][d] - rec.sunTurn[d]

  /** The whole record, the same with the truth taken out (what the told forecast reads), and each reading's own; a forecast reads them only up to a day. */
  const all = new Map<string, number>()
  const bare = new Map<string, number>()
  const byReading = READINGS.map(() => new Map<string, number>())
  for (let d = 0; d < DAYS; d++) {
    BLOCKS.forEach((b, i) => {
      const v = rec.score[d][i]
      const p = rec.points[d][i]
      if (v === null || p === null) return
      const key = slotKey(rec.dayName[d], b)
      all.set(key, v)
      bare.set(key, v - truth.steps[phase(d)][rec.weekday[d]][i] - truth.sun * rec.sunTurn[d])
      p.forEach((x, r) => byReading[r].set(key, x))
    })
  }
  const view = (map: ReadonlyMap<string, number>, last: number): ReadonlyMap<string, number> => {
    const limit = last >= 0 ? rec.dayName[last] : ''
    return { get: (k: string) => (last >= 0 && k.slice(0, 10) <= limit ? map.get(k) : undefined) } as unknown as ReadonlyMap<string, number>
  }
  const upTo = (last: number): ReadonlyMap<string, number> => view(all, last)

  /** A way's miss on a past slot as it would have been forecast that many days out (the app's backtest), made once. */
  const missMemo = new Map<string, number | null>()
  const missOf = (model: ModelId, x: number, i: number, ahead: number): number | null => {
    const key = `${model}|${x}|${i}|${ahead}`
    if (!missMemo.has(key)) {
      const actual = rec.score[x][i]
      const p = actual === null ? null : predict(model, upTo(x - Math.max(1, ahead)), rec.dayName[x], BLOCKS[i])
      missMemo.set(key, actual === null || p === null ? null : actual - p)
    }
    return missMemo.get(key) as number | null
  }
  const readingMemo = new Map<string, number | null>()
  const readingMiss = (x: number, i: number, r: number): number | null => {
    const key = `${x}|${i}|${r}`
    if (!readingMemo.has(key)) {
      const actual = rec.points[x][i]
      const p = actual === null ? null : predict('sameBlock', view(byReading[r], x - 1), rec.dayName[x], BLOCKS[i])
      readingMemo.set(key, actual === null || p === null ? null : actual[r] - p)
    }
    return readingMemo.get(key) as number | null
  }
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

  const inputs: StageCInputs = {
    reading: (day, block) => rec.score[day][block],
    flatMiss: (day, block, ahead) => missOf('sameBlock', day, block, ahead),
    flatForecast: (t, day, block) => predict('sameBlock', upTo(t - 1), rec.dayName[day], BLOCKS[block]),
    weekday: (day) => rec.weekday[day],
    dayName: (day) => rec.dayName[day],
    readings: READINGS.length,
    share: () => 1 / READINGS.length,
    readingMiss: (day, block, reading) => readingMiss(day, block, reading),
    kindOf: (day) => rec.kind[day],
    kindNow: (asOf, weekday) => rec.kindNow(asOf, weekday),
    measures: MEASURES.length,
    observed: (measure, day) => rec.observed[measure][day],
    issued: (measure, issuedOn, ahead) => rec.issued[measure][issuedOn][ahead],
    events: rec.events.length,
    eventBlock: (kind) => rec.eventBlock[kind],
    eventOn: (kind, day) => rec.events[kind][day],
  }
  const stageB = rangeTrackerOf(WEEK, inputs)
  const trackers = settings.map((numbers) => stageCTrackerOf(numbers, inputs))

  const base: CPerson['base'] = STRETCHES.map(() => [0, 0, 0, 0, 0, 0, 0, 0])
  const b = { first: -1, days: [0, 0, 0, 0], offs: 0 }
  let bWas = false
  const c: CSetting[] = settings.map(() => ({ s: STRETCHES.map(() => [0, 0, 0, 0]), diff: STRETCHES.map(() => [0, 0, 0]), first: -1, days: [0, 0, 0, 0], offs: 0, ever: [0, 0, ...MEASURES.map(() => 0), 0], kinds: rec.events.map(() => 0), alone: 0, ahead: Array.from({ length: 8 }, () => [0, 0, 0]) }))
  const cWas = settings.map(() => false)
  const none = new Set<string>()
  const logged = new Set<number>()

  // The challenger's useless conditions, as Phase 8's simulation gives them: another person's nights and evenings, and things laid by chance.
  let things: boolean[][] = []
  let lender: CountedRecord | null = null
  const index = new Map(rec.dayName.slice(0, DAYS).map((name, d) => [name, d]))
  if (withChallenger) {
    things = recordOf(forecastWorldById('rhythm').spec, seed).eveningThings
    const borrow = forecastWorldById('plain').borrow
    if (!borrow) throw new Error('no lender')
    lender = recordOf(borrow, seed + BORROW_OFFSET)
  }
  const at = (day: string): number | undefined => index.get(day)
  const fixedBlocks: readonly Block[] = CHALLENGER.eachCheckin ? BLOCKS : ['morning']
  const sleep: Condition = { id: 'sleep', blocks: fixedBlocks, stateOn: (day) => { const d = at(day); const v = d === undefined || !lender ? null : lender.shortNight[d]; return v === null ? null : v ? 'short' : 'not' }, moves: () => true }
  const evening: Condition = { id: 'evening', blocks: fixedBlocks, stateOn: (day) => { const d = at(day); const v = d === undefined || !lender ? null : lender.reading[d][EVENING]; return v === null ? null : bandOf(v) }, moves: () => true }
  const kind = (j: number): Condition => ({ id: `thing.${j}`, blocks: ['morning'], stateOn: (day) => { const d = at(day); if (d === undefined || rec.score[d][EVENING] === null) return null; return things[j][d] ? 'yes' : 'no' }, moves: (state) => state === 'yes' })
  const usedOn: boolean[] = []
  let lastGate = ''
  let onList: string[] = []
  const ch = { adopted: 0 as 0 | 1 }
  const WAY_C = 'stageC'
  const pastMemo = new Map<string, number | null>()
  /** The way in use's forecast for a past slot, as the challenger reads its base: the same-block way's, plus what Stage C added on the day itself where it was in use. */
  const predictOf = (model: WayId, _values: ReadonlyMap<string, number>, day: string, block: Block): number | null => {
    const d = at(day)
    if (d === undefined) return null
    const i = BLOCKS.indexOf(block)
    if ((model as string) !== WAY_C) {
      const key = `${model}|${d}|${i}`
      if (!pastMemo.has(key)) pastMemo.set(key, predict(model as ModelId, upTo(d - 1), day, block))
      return pastMemo.get(key) as number | null
    }
    const key = `flat|${d}|${i}`
    if (!pastMemo.has(key)) pastMemo.set(key, predict('sameBlock', upTo(d - 1), day, block))
    const flat = pastMemo.get(key) as number | null
    return flat === null ? null : flat + (usedOn[d] ? trackers[0].shiftOn(d, d, i) : 0)
  }

  for (let t = 0; t < DAYS; t++) {
    if (t > 0 && rec.score[t - 1].some((v) => v !== null)) logged.add(t - 1)
    const stateB = stageB.stateOn(t)
    const states = trackers.map((tr) => tr.stateOn(t))
    usedOn.push(states.length > 0 && states[0].inUse)
    // The check against leaks, every fiftieth person, every thirtieth day: a fresh copy of the method, given the record
    // cut off at the day before (no score, reading, event or weather of the day or after, no forecast issued after it),
    // must give the same state and the same rows, number for number.
    if (seed % 50 === 0 && t % 30 === 0 && t >= FIRST_DAY && trackers.length > 0) {
      const late = (what: string): never => {
        throw new Error(`seed ${seed}, day ${t}: the method asked for ${what} from the day of writing or after`)
      }
      const cut: StageCInputs = {
        ...inputs,
        reading: (day, block) => (day < t ? inputs.reading(day, block) : null),
        flatMiss: (day, block, ahead) => (day < t ? inputs.flatMiss(day, block, ahead) : null),
        flatForecast: (written, day, block) => (written <= t ? inputs.flatForecast(written, day, block) : late('a forecast written later')),
        readingMiss: (day, block, reading) => (day < t ? inputs.readingMiss(day, block, reading) : null),
        kindOf: (day) => (day < t ? inputs.kindOf(day) : late("a day's own row")),
        kindNow: (asOf, weekday) => (asOf <= t ? inputs.kindNow(asOf, weekday) : late('a later template')),
        observed: (measure, day) => (day < t ? inputs.observed(measure, day) : null),
        issued: (measure, issuedOn, ahead) => (issuedOn <= t ? inputs.issued(measure, issuedOn, ahead) : null),
        eventOn: (kind, day) => (day < t ? inputs.eventOn(kind, day) : null),
      }
      trackers.forEach((tr, k) => {
        const fresh = stageCTrackerOf(settings[k], cut)
        const mine = JSON.stringify([tr.stateOn(t), [...tr.rowsOn(t)]])
        const again = JSON.stringify([fresh.stateOn(t), [...fresh.rowsOn(t)]])
        if (mine !== again) throw new Error(`seed ${seed}, day ${t}, setting ${k}: Stage C's rows differ from those worked out from the record cut off at the day before`)
      })
    }
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
      const own = chosen ? forecastsDue(chosen, copy, [], day, none) : []
      const same = chosen?.model === model && own.length === rows.length && own.every((f, k) => { const r = rows[k]; return f.day === rec.dayName[r.d] && BLOCKS.indexOf(f.block) === r.i && f.horizon === r.horizon && f.point === r.point && f.lo === r.lo && f.hi === r.hi })
      if (!same) throw new Error(`seed ${seed}, day ${t}: today's rows differ from the app's own`)
    }
    const bucket = t < STRETCHES[0][0] ? 0 : stretchOf(t) + 1
    const rowsB: Map<string, WeekRow> | null = stateB.inUse ? stageB.rowsOn(t) : null
    if (stateB.inUse) {
      b.days[bucket]++
      if (b.first < 0) b.first = t
    } else if (bWas) b.offs++
    bWas = stateB.inUse
    const rowsC = states.map((s, k) => (s.inUse ? trackers[k].rowsOn(t) : null))
    states.forEach((s, k) => {
      const me = c[k]
      if (s.inUse) {
        me.days[bucket]++
        if (me.first < 0) me.first = t
        if (!stateB.inUse) me.alone++
        if (s.score) me.ever[0] = 1
        if (s.readings.some(Boolean)) me.ever[1] = 1
        s.weather.forEach((on, m) => { if (on) me.ever[2 + m] = 1 })
        s.events.forEach((on, k) => { if (on) { me.ever[2 + MEASURES.length] = 1; me.kinds[k] = 1 } })
      } else if (cWas[k]) me.offs++
      cWas[k] = s.inUse
    })

    for (const f of rows) {
      if (f.d >= DAYS) continue
      const actual = rec.score[f.d][f.i]
      if (actual === null) continue
      const st = stretchOf(f.d)
      if (st < 0) continue
      const key = `${rec.dayName[f.d]}|${BLOCKS[f.i]}|${f.horizon}`
      const rb = rowsB ? rowsB.get(key) : f
      if (!rb) continue
      const level = predict('sameBlock', view(bare, t - 1), rec.dayName[f.d], BLOCKS[f.i])
      const flat = level ?? predict('sameBlock', before, rec.dayName[f.d], BLOCKS[f.i])
      const told = flat === null ? f.point : clamp(flat + truth.steps[phase(f.d)][rec.weekday[f.d]][f.i] + truth.sun * truth.skill[f.horizon] * (rec.issued[0][t][f.horizon] - usualSun(f.d)))
      const row = base[st]
      row[0]++
      row[1] += Math.abs(actual - f.point)
      row[2] += Math.abs(actual - rb.point)
      row[3] += Math.abs(actual - told)
      if (actual >= rb.lo && actual <= rb.hi) row[4]++
      row[5] += rb.hi - rb.lo
      row[6] += score(rb.lo, rb.hi, actual)
      row[7] += score(f.lo, f.hi, actual)
      /** What is written where Stage C has no row: the Stage B system's, or (the design's own arrangement) today's system's. */
      const under = beneath === 'today' ? f : rb
      rowsC.forEach((own, k) => {
        const rc = own ? (own.get(key) ?? under) : under
        const me = c[k]
        const s = me.s[st]
        s[0] += Math.abs(actual - rc.point)
        if (actual >= rc.lo && actual <= rc.hi) s[1]++
        s[2] += rc.hi - rc.lo
        s[3] += score(rc.lo, rc.hi, actual)
        if (rc.point !== rb.point || rc.lo !== rb.lo || rc.hi !== rb.hi) {
          const dd = me.diff[st]
          dd[0]++
          if (actual >= rb.lo && actual <= rb.hi) dd[1]++
          if (actual >= rc.lo && actual <= rc.hi) dd[2]++
        }
        if (st === STRETCHES.length - 1) {
          const a = me.ahead[f.horizon]
          a[0]++
          a[1] += Math.abs(actual - rb.point)
          a[2] += Math.abs(actual - rc.point)
        }
      })
    }

    // The challenger on the way in use, as the app would run it today (Phase 8's gate and useless conditions).
    if (withChallenger) {
      const cr = { reading: rec.score, eveningThings: things, dayName: rec.dayName } as unknown as CountedRecord
      const points = Array.from({ length: EVENING_THINGS }, (_, j) => eveningPoints(cr, t, j))
      const gateKey = `${points[0].length}`
      if (gateKey !== lastGate) {
        lastGate = gateKey
        const worth = points.some((p) => Math.abs(difference(p) ?? 0) >= WORTH_POINTS - 1e-9)
        onList = worth ? kindsAtPattern(points.map((p, j) => compare(p, { id: `thing.${j}`, worth: WORTH_POINTS })), CHALLENGER.maxKinds) : []
      }
      const conditions = [sleep, evening, ...onList.map((id) => kind(Number(id.slice(6))))]
      const way = (states[0].inUse ? WAY_C : model) as WayId
      if (runChallenger(way, before, day, conditions, CHALLENGER, predictOf).picked) ch.adopted = 1
    }
  }
  const tidy = <T extends number[]>(row: T): T => row.map(round) as T
  return {
    seed,
    base: base.map(tidy),
    b,
    c: c.map((me) => ({ ...me, s: me.s.map(tidy), ahead: me.ahead.map(tidy) })),
    ...(withChallenger ? { ch } : {}),
    ms: Math.round(performance.now() - t0),
  }
}

interface Job {
  world: string
  seeds: number[]
  settings: StageCNumbers[]
  truth: CTruth
  challenger: boolean
  beneath: 'stageB' | 'today'
}

if (!isMainThread) {
  const job = workerData as Job
  for (const seed of job.seeds) parentPort?.postMessage(runStageC(job.world, seed, job.settings, job.truth, job.challenger, job.beneath))
  parentPort?.postMessage('done')
} else if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && /stageCSim\.mjs$/.test(process.argv[1])) {
  const [what, world, from, to, out, threadsArg, settingsArg, mode, under] = process.argv.slice(2)
  const beneath = under === 'today' ? 'today' : 'stageB'
  if (what !== 'run' || !world || !from || !to || !out) throw new Error('usage: stageCSim.mjs run <world> <fromSeed> <toSeed> <out.json> [threads] [settings as a JSON list | "none"] [challenger]')
  cWorldById(world)
  if (existsSync(out)) throw new Error(`${out} is already there: a range is read once`)
  const settings: StageCNumbers[] = settingsArg === 'none' ? [] : settingsArg ? (JSON.parse(settingsArg) as Partial<StageCNumbers>[]).map((s) => ({ ...STAGE_C, ...s })) : [STAGE_C]
  const challenger = mode === 'challenger'
  const seeds: number[] = []
  for (let s = Number(from); s <= Number(to); s++) seeds.push(s)
  const truth = cTruthOf(cWorldById(world))
  const threads = Math.min(Number(threadsArg || 12), seeds.length)
  const results: CPerson[] = []
  const t0 = Date.now()
  let finished = 0
  await new Promise<void>((resolve, reject) => {
    for (let i = 0; i < threads; i++) {
      const mine = seeds.filter((_, k) => k % threads === i)
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { world, seeds: mine, settings, truth, challenger, beneath } satisfies Job })
      w.on('message', (m: CPerson | 'done') => {
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
  writeFileSync(out, JSON.stringify({ world, seeds: [Number(from), Number(to)], settings, challenger, beneath, truth, ms: Date.now() - t0, results }))
  process.stderr.write(`${world}: ${results.length} people in ${Math.round((Date.now() - t0) / 1000)} s -> ${out}\n`)
}
