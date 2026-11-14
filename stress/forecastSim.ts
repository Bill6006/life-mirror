import { BLOCKS, type Block } from '../src/blocks'
import { CHALLENGER, kindsAtPattern, runChallenger, type ChallengerNumbers, type Condition } from '../src/challenger'
import { compare, difference, WORTH_POINTS } from '../src/counted/compare'
import { BACKTEST_DAYS, chooseModel, loggedDays, MIN_DAYS_TODAY, MODELS, predict, type ModelId } from '../src/forecast'
import { slotKey } from '../src/observe'
import { bandOf } from '../src/score'
import { EVENING_THINGS, eveningPoints, recordOf, type CountedRecord, type CountedWorld } from './countedWorlds'

// The forecast challenger's simulation (its criteria were frozen on 2026-11-14, before any of this was written; the
// plan holds them, and RESULTS-9.md names their hash). A simulated person from world.ts; the app's own four ways and
// their daily pick; the app's own challenger, tried every day from day 15 to day 180 on the record before that day.
// In a useless world every input says nothing about the person's days ahead: the conditions are another simulated
// person's, and the things are laid from streams of their own. Offline only: nothing in src/ imports this folder.

export const DAYS = 180
export const FIRST_DAY = 14
const MORNING = 0
const EVENING = 2
/** The other person a useless world's conditions are borrowed from: the same seed plus this. */
export const BORROW_OFFSET = 5_000_000

const RHYTHM = [0.2, -0.4, -0.2, 0, 0, 0.2, 0.4] // Sunday first
const chance = (c: number): CountedWorld['things'] => ({ how: 'chance', chance: () => c })
const person = (id: string, people: CountedWorld['people'], things: CountedWorld['things'], more: Partial<CountedWorld> = {}): CountedWorld => ({ id: `forecast-${id}`, kind: 'no-pattern', people, families: ['B'], things, ...more })

export interface ForecastWorld {
  id: string
  kind: 'useless' | 'useful' | 'reported'
  spec: CountedWorld
  /** Whose sleep answers and evening bands the challenger is given: another person's, or null for the person's own. */
  borrow: CountedWorld | null
}

const plainBase = person('lender-base', 'base', chance(0.3))
const plainPersistent = person('lender-persistent', 'persistent', chance(0.3))
const plainSparse = person('lender-sparse', 'sparse', chance(0.3))

export const FORECAST_WORLDS: readonly ForecastWorld[] = [
  { id: 'plain', kind: 'useless', spec: person('plain', 'base', chance(0.3)), borrow: plainBase },
  { id: 'streaks', kind: 'useless', spec: person('streaks', 'persistent', { how: 'runs' }), borrow: plainPersistent },
  { id: 'sparse', kind: 'useless', spec: person('sparse', 'sparse', chance(0.1)), borrow: plainSparse },
  { id: 'rhythm', kind: 'useless', spec: person('rhythm', 'base', chance(0.5), { shift: (_d, weekday) => RHYTHM[weekday] }), borrow: plainBase },
  { id: 'season', kind: 'useless', spec: person('season', 'base', { how: 'runs' }, { shift: (d) => Math.sin((2 * Math.PI * d) / 180) }), borrow: plainPersistent },
  { id: 'fifteen-points', kind: 'useful', spec: person('fifteen', 'base', chance(0.3), { effect: 0.6 }), borrow: plainBase },
  { id: 'ten-points', kind: 'reported', spec: person('ten', 'base', chance(0.3), { effect: 0.4 }), borrow: plainBase },
  { id: 'own', kind: 'reported', spec: person('own', 'base', chance(0.3)), borrow: null },
  { id: 'own-persistent', kind: 'reported', spec: person('own-persistent', 'persistent', { how: 'runs' }), borrow: null },
]

export const forecastWorldById = (id: string): ForecastWorld => {
  const w = FORECAST_WORLDS.find((x) => x.id === id)
  if (!w) throw new Error(`no forecast world ${id}`)
  return w
}

const round = (v: number | null): number | null => (v === null ? null : Math.round(v * 1000) / 1000)

/** One day's try: the day (0 first), slots, gain, clear, kinds on the list, then that day's own adjusted slots and how much worse (+) or better (-) their miss was than the base way's. */
export type DayRow = [day: number, slots: number, gain: number | null, clear: number | null, kinds: number, adjusted: number, worse: number]

export interface ForecastPerson {
  seed: number
  rows: DayRow[]
  /** For a world with a real lift: the mornings after the thing, the spread of the base way's misses on the other mornings, and the true lift in points. */
  bound?: { m: number; s: number; d: number }
  ms: number
}

/** One simulated person through one world, with the method's numbers given. */
export function runForecast(world: ForecastWorld, seed: number, numbers: ChallengerNumbers = CHALLENGER): ForecastPerson {
  const t0 = performance.now()
  const rec: CountedRecord = recordOf(world.spec, seed)
  const lender: CountedRecord = world.borrow ? recordOf(world.borrow, seed + BORROW_OFFSET) : rec
  const index = new Map(rec.dayName.slice(0, DAYS).map((name, d) => [name, d]))
  const at = (day: string): number | undefined => index.get(day)

  const fixedBlocks: readonly Block[] = numbers.eachCheckin ? BLOCKS : ['morning']
  const sleep: Condition = {
    id: 'sleep',
    blocks: fixedBlocks,
    stateOn: (day) => {
      const d = at(day)
      const v = d === undefined ? null : lender.shortNight[d]
      return v === null ? null : v ? 'short' : 'not'
    },
    moves: () => true,
  }
  const evening: Condition = {
    id: 'evening',
    blocks: fixedBlocks,
    stateOn: (day) => {
      const d = at(day)
      const v = d === undefined ? null : lender.reading[d][EVENING]
      return v === null ? null : bandOf(v)
    },
    moves: () => true,
  }
  const kind = (j: number): Condition => ({
    id: `thing.${j}`,
    blocks: ['morning'],
    stateOn: (day) => {
      const d = at(day)
      if (d === undefined || rec.reading[d][EVENING] === null) return null
      return rec.eveningThings[j][d] ? 'yes' : 'no'
    },
    moves: (state) => state === 'yes',
  })

  // The base way's forecast for a past slot rests on the record before its day alone, so it is worked out once.
  const memo = new Map<string, number | null>()
  const values = new Map<string, number>()
  const predictOnce = (model: ModelId, _values: ReadonlyMap<string, number>, day: string, block: Block): number | null => {
    const key = `${model}|${day}|${block}`
    if (!memo.has(key)) memo.set(key, predict(model, values, day, block))
    return memo.get(key) as number | null
  }

  /**
   * The app's daily pick (chooseModel), with each past slot's forecast worked out once: the way with the lowest average
   * miss over the 28 days before the day, among those with five scored slots, the first of equals.
   */
  const pick = (t: number): ModelId | null => {
    let best: { model: ModelId; mae: number } | null = null
    for (const model of MODELS) {
      let sum = 0
      let n = 0
      for (let back = 1; back <= BACKTEST_DAYS; back++) {
        const d = t - back
        if (d < 0) continue
        for (let i = 0; i < BLOCKS.length; i++) {
          const actual = rec.reading[d][i]
          if (actual === null) continue
          const p = predictOnce(model, values, rec.dayName[d], BLOCKS[i])
          if (p === null) continue
          sum += Math.abs(actual - p)
          n++
        }
      }
      if (n < 5) continue
      const mae = sum / n
      if (best === null || mae < best.mae) best = { model, mae }
    }
    return best ? best.model : null
  }

  const rows: DayRow[] = []
  let lastGate = ''
  let onList: string[] = []
  let lastBase: ModelId | null = null
  for (let t = 0; t < DAYS; t++) {
    // The record as it stood before day t: every slot of the days before it.
    if (t > 0) BLOCKS.forEach((b, i) => { const v = rec.reading[t - 1][i]; if (v !== null) values.set(slotKey(rec.dayName[t - 1], b), v) })
    if (t < FIRST_DAY) continue
    const today = rec.dayName[t]
    const model = loggedDays(values) >= MIN_DAYS_TODAY ? pick(t) : null
    // Every fiftieth person is picked for by the app's own function too, day by day: the two must agree.
    if (seed % 50 === 0 && model !== (loggedDays(values) >= MIN_DAYS_TODAY ? (chooseModel(values, today)?.model ?? null) : null)) throw new Error(`seed ${seed}, day ${t}: the pick differs from the app's`)
    if (!model) continue
    const chosen = { model }
    lastBase = model
    // The gate: each thing's comparison for the next morning, over the record before today; worked out again only when its occasions changed.
    const points = Array.from({ length: EVENING_THINGS }, (_, j) => eveningPoints(rec, t, j))
    const gateKey = `${points[0].length}`
    if (gateKey !== lastGate) {
      lastGate = gateKey
      // A thing stands at a pattern only with a difference worth saying; where none has one, none can, and the chance check is not run.
      const worth = points.some((p) => Math.abs(difference(p) ?? 0) >= WORTH_POINTS - 1e-9)
      onList = worth ? kindsAtPattern(points.map((p, j) => compare(p, { id: `thing.${j}`, worth: WORTH_POINTS })), numbers.maxKinds) : []
    }
    const conditions = [sleep, evening, ...onList.map((id) => kind(Number(id.slice(6))))]
    const run = runChallenger(chosen.model, values, today, conditions, numbers, predictOnce)
    // Today's own slots, as the challenger would have forecast them: how its miss compares with the base way's.
    let adjusted = 0
    let worse = 0
    BLOCKS.forEach((b, i) => {
      const actual = rec.reading[t][i]
      const p = actual === null ? null : predict(chosen.model, values, today, b)
      if (actual === null || p === null) return
      const a = run.adjustmentFor(today, b)
      if (a.points === 0) return
      adjusted++
      worse += Math.abs(actual - p - a.points) - Math.abs(actual - p)
    })
    rows.push([t, run.slots, round(run.gain), round(run.clear), onList.length, adjusted, round(worse) as number])
  }

  let bound: ForecastPerson['bound']
  if (world.spec.effect && lastBase) {
    let m = 0
    let lift = 0
    const others: number[] = []
    for (let d = FIRST_DAY; d < DAYS; d++) {
      const morning = rec.reading[d][MORNING]
      const p = morning === null ? null : predictOnce(lastBase, values, rec.dayName[d], 'morning')
      if (morning === null || p === null) continue
      const after = rec.reading[d - 1][EVENING] !== null && rec.eveningThings[0][d - 1]
      if (after) {
        m++
        lift += morning - (rec.morningWithout[d] as number)
      } else others.push(morning - p)
    }
    const mean = others.reduce((s, v) => s + v, 0) / Math.max(1, others.length)
    const s = Math.sqrt(others.reduce((acc, v) => acc + (v - mean) ** 2, 0) / Math.max(1, others.length - 1))
    bound = { m, s: round(s) as number, d: round(m ? lift / m : 0) as number }
  }
  return { seed, rows, ...(bound ? { bound } : {}), ms: Math.round(performance.now() - t0) }
}
