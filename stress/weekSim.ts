import { BLOCKS, type Block } from '../src/blocks'
import { CHALLENGER, kindsAtPattern, runChallenger, type Condition } from '../src/challenger'
import { compare, difference, WORTH_POINTS } from '../src/counted/compare'
import { BACKTEST_DAYS, chooseModel, loggedDays, MIN_DAYS_TODAY, MODELS, predict, tellsWeekdaysApart, type ModelId } from '../src/forecast'
import { slotKey } from '../src/observe'
import { bandOf } from '../src/score'
import { EVENING_THINGS, eveningPoints, recordOf, type CountedRecord } from './countedWorlds'
import { BORROW_OFFSET, DAYS, FIRST_DAY, forecastWorldById, type ForecastWorld } from './forecastSim'
import { LEVEL_WEEKDAY, trackerOf, WEEK, weekStateOf, type WeekNumbers } from './levelWeekday'

// The week ahead's level-plus-weekday way: its simulation (designed 2026-11-21 at the owner's word; its criteria were
// frozen that day, before the way's code was written; the private repository holds them, and the results file names
// their hash). Phase 8's simulated people and worlds, and three harder ones; the app's own four ways and their daily
// pick; the new way (stress/levelWeekday.ts: nothing in the app has it); and, when asked, the app's own challenger on
// the way in use. Every day from day 15 to day 180 the week ahead is written from the record before that day, by
// today's system and by the system with the new way, and each forecast is set beside what was then answered.
// Offline only: nothing in src/ imports this folder.

const EVENING = 2
/** The stretches a forecast's day falls in: days 29 to 90, 91 to 150 and 151 to 180 (0 first here). */
export const STRETCHES = [
  [28, 89],
  [90, 149],
  [150, 179],
] as const
export const HORIZON = 7
/** The day (0 first) from which rhythm-turn's steps fall three weekdays on. */
export const TURN = 90
/** The people the true shifts are read from, for the told forecast: tuning seeds, so nothing of a verdict's people enters it. */
export const TRUTH_SEEDS = 300

const RHYTHM = [0.2, -0.4, -0.2, 0, 0, 0.2, 0.4] // Sunday first: Phase 8's rhythm
const RHYTHM_HALF = RHYTHM.map((s) => s / 2)

export interface WeekWorld extends ForecastWorld {
  /** Which arrangement of weekday shifts holds on a day; one arrangement where absent. */
  phase?: (d: number) => number
}

const rhythm = forecastWorldById('rhythm')
export const WEEK_WORLDS: readonly WeekWorld[] = [
  forecastWorldById('plain'),
  forecastWorldById('streaks'),
  forecastWorldById('sparse'),
  forecastWorldById('season'),
  rhythm,
  { id: 'rhythm-half', kind: 'reported', spec: { ...rhythm.spec, id: 'forecast-rhythm-half', shift: (_d, weekday) => RHYTHM_HALF[weekday] }, borrow: rhythm.borrow },
  // Harder: the same steps at the evening check-in alone; and the same steps until day 90, then three weekdays on.
  { id: 'rhythm-one', kind: 'reported', spec: { ...rhythm.spec, id: 'forecast-rhythm-one', shift: undefined, shiftAt: (_d, weekday, block) => (block === 'evening' ? RHYTHM[weekday] : 0) }, borrow: rhythm.borrow },
  { id: 'rhythm-turn', kind: 'reported', spec: { ...rhythm.spec, id: 'forecast-rhythm-turn', shift: (d, weekday) => (d < TURN ? RHYTHM[weekday] : RHYTHM[(weekday + 3) % 7]) }, borrow: rhythm.borrow, phase: (d) => (d < TURN ? 0 : 1) },
]

export const weekWorldById = (id: string): WeekWorld => {
  const w = WEEK_WORLDS.find((x) => x.id === id)
  if (!w) throw new Error(`no week world ${id}`)
  return w
}

/** The true shift in points, by arrangement, weekday (Sunday first) and check-in; null for a world with none. */
export type Truth = number[][][] | null

/**
 * A world's true shifts: over the first tuning people, each answered check-in's reading less the same person's reading
 * in the same world without the shift (the same draws, so the difference is the shift's own), averaged by weekday and
 * check-in. What the told forecast is told.
 */
export function truthOf(world: WeekWorld, people = TRUTH_SEEDS): Truth {
  if (!world.spec.shift && !world.spec.shiftAt) return null
  const phases = world.phase ? 2 : 1
  const sum = Array.from({ length: phases }, () => Array.from({ length: 7 }, () => BLOCKS.map(() => 0)))
  const n = Array.from({ length: phases }, () => Array.from({ length: 7 }, () => BLOCKS.map(() => 0)))
  const bare = { ...world.spec, shift: undefined, shiftAt: undefined }
  for (let seed = 1; seed <= people; seed++) {
    const withShift = recordOf(world.spec, seed)
    const without = recordOf(bare, seed)
    for (let d = 0; d < DAYS; d++) {
      const p = world.phase ? world.phase(d) : 0
      for (let i = 0; i < BLOCKS.length; i++) {
        const a = withShift.reading[d][i]
        const b = without.reading[d][i]
        if (a === null || b === null) continue
        sum[p][withShift.weekday[d]][i] += a - b
        n[p][withShift.weekday[d]][i]++
      }
    }
  }
  return sum.map((byWeekday, p) => byWeekday.map((byBlock, w) => byBlock.map((s, i) => (n[p][w][i] ? s / n[p][w][i] : 0))))
}

const round = (v: number): number => Math.round(v * 1000) / 1000

export interface WeekPerson {
  seed: number
  /** By stretch: the summed absolute miss of today's system, of the system with the new way, of the told forecast and of the flat way, then the slots. */
  s: [without: number, withNew: number, told: number, flat: number, n: number][]
  /** The last stretch by days ahead, 1 to 7: today's system, with the new way, the told forecast, the slots. */
  h: [without: number, withNew: number, told: number, n: number][]
  /** The new way in use: the first day (0 first) or null; the days in use before day 29 and in each stretch; the times it went out of use after being in use; whether in use on the last day. */
  use: { first: number | null; days: number[]; offs: number; last: 0 | 1 }
  /** The shifts in use on the last day, by weekday (Sunday first), averaged over the check-ins; null where it is not in use. */
  shifts: number[] | null
  /** Days today's pick told weekdays apart, before day 29 and in each stretch, of the days it picked. */
  aware: number[]
  picked: number[]
  /** With the challenger run: whether it was picked on some day on the way in use, and on how many days. */
  ch?: { adopted: 0 | 1; days: number }
  ms: number
}

const stretchOf = (d: number): number => STRETCHES.findIndex(([a, z]) => d >= a && d <= z)

/** One simulated person through one world: today's system and the system with the new way, each day's week ahead set beside what was answered. */
export function runWeek(world: WeekWorld, seed: number, numbers: WeekNumbers = WEEK, truth: Truth = null, withChallenger = false): WeekPerson {
  return runWeekMany(world, seed, [numbers], truth, withChallenger)[0]
}

/**
 * The same person under several settings of the method's numbers at once (the tuning's grid): everything that does not
 * depend on the numbers (the record, the four's forecasts and pick, the told forecast) is worked out once, and each
 * setting keeps its own tracker and its own sums. One setting gives exactly what runWeek gave before this was written
 * (proven against the first tuning run). The challenger is run for one setting alone.
 */
export function runWeekMany(world: WeekWorld, seed: number, list: readonly WeekNumbers[], truth: Truth = null, withChallenger = false): WeekPerson[] {
  if (withChallenger && list.length !== 1) throw new Error('the challenger is run for one setting at a time')
  const t0 = performance.now()
  const rec: CountedRecord = recordOf(world.spec, seed)
  const lender: CountedRecord = withChallenger && world.borrow ? recordOf(world.borrow, seed + BORROW_OFFSET) : rec
  const index = new Map(rec.dayName.slice(0, DAYS).map((name, d) => [name, d]))
  const at = (day: string): number | undefined => index.get(day)
  const phase = (d: number): number => (world.phase ? world.phase(d) : 0)

  // The challenger's conditions, exactly as Phase 8's simulation gives them (stress/forecastSim.ts).
  const fixedBlocks: readonly Block[] = CHALLENGER.eachCheckin ? BLOCKS : ['morning']
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

  /** The record before the day at hand, and the same with the true shifts taken out (what the told forecast reads). */
  const values = new Map<string, number>()
  const bare = new Map<string, number>()
  // A past slot's forecast by one of the four rests on the record before its day alone, so it is worked out once.
  const memo = new Map<string, number | null>()
  const predictPast = (model: ModelId, day: string, block: Block): number | null => {
    const key = `${model}|${day}|${block}`
    if (!memo.has(key)) memo.set(key, predict(model, values, day, block))
    return memo.get(key) as number | null
  }
  /** The app's daily pick of four (chooseModel), each past slot's forecast worked out once. */
  const pickFour = (t: number): ModelId | null => {
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
          const p = predictPast(model, rec.dayName[d], BLOCKS[i])
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

  /** What each setting keeps for itself. */
  const per = list.map((numbers) => ({
    numbers,
    tracker: trackerOf(numbers),
    /** Each day's state of the new way, kept for the challenger's look back: whether in use, and the shifts then. */
    usedOn: [] as boolean[],
    shiftOn: [] as (readonly (readonly number[])[] | null)[],
    s: STRETCHES.map(() => [0, 0, 0, 0, 0]) as WeekPerson['s'],
    h: Array.from({ length: HORIZON }, () => [0, 0, 0, 0]) as WeekPerson['h'],
    use: { first: null as number | null, days: [0, 0, 0, 0], offs: 0, last: 0 as 0 | 1 },
    shifts: null as number[] | null,
    wasInUse: false,
  }))
  /** The way in use's forecast for a past slot, the new way's included: what the challenger is tried on. Where the new way was not in use it is the flat way's, number for number. */
  const predictOf = (model: ModelId, _values: ReadonlyMap<string, number>, day: string, block: Block): number | null => {
    if ((model as string) !== LEVEL_WEEKDAY) return predictPast(model, day, block)
    const flat = predictPast('sameBlock', day, block)
    const d = at(day)
    if (flat === null || d === undefined) return flat
    const shift = per[0].usedOn[d] ? per[0].shiftOn[d] : null
    return shift ? flat + shift[rec.weekday[d]][BLOCKS.indexOf(block)] : flat
  }

  const aware = [0, 0, 0, 0]
  const picked = [0, 0, 0, 0]
  let lastGate = ''
  let onList: string[] = []
  const ch = { adopted: 0 as 0 | 1, days: 0 }

  for (let t = 0; t < DAYS; t++) {
    // The record as it stood before day t: every slot of the days before it; and the new way takes in yesterday's misses of the flat way.
    if (t > 0) {
      const y = t - 1
      const misses = BLOCKS.map((b, i) => {
        const v = rec.reading[y][i]
        const p = v === null ? null : predictPast('sameBlock', rec.dayName[y], b)
        return v === null || p === null ? null : v - p
      })
      BLOCKS.forEach((b, i) => {
        const v = rec.reading[y][i]
        if (v === null) return
        values.set(slotKey(rec.dayName[y], b), v)
        bare.set(slotKey(rec.dayName[y], b), v - (truth ? truth[phase(y)][rec.weekday[y]][i] : 0))
      })
      for (const c of per) c.tracker.take(y, rec.weekday[y], misses)
    }
    const states = per.map((c) => c.tracker.stateOn(t))
    for (const c of per) {
      c.usedOn.push(false)
      c.shiftOn.push(null)
    }
    if (t < FIRST_DAY) continue
    const today = rec.dayName[t]
    const model = loggedDays(values) >= MIN_DAYS_TODAY ? pickFour(t) : null
    // Every fiftieth person is picked for by the app's own function too, day by day, and every tenth day of theirs the
    // new way's state is worked out again from the record alone (for one setting, each in its turn): each pair must agree.
    if (seed % 50 === 0) {
      const own = loggedDays(values) >= MIN_DAYS_TODAY ? (chooseModel(values, today)?.model ?? null) : null
      if (own !== model) throw new Error(`seed ${seed}, day ${t}: the pick of four differs from the app's`)
      if (t % 10 === 0) {
        const k = (t / 10) % per.length
        const state = states[k]
        const alone = weekStateOf(values, today, per[k].numbers)
        const same = alone.inUse === state.inUse && alone.held === state.held && alone.open === state.open && alone.shift.every((row, w) => row.every((v, i) => Math.abs(v - state.shift[w][i]) < 1e-6))
        if (!same) throw new Error(`seed ${seed}, day ${t}, setting ${k}: the new way's state differs from the one worked out from the record alone`)
      }
    }
    if (!model) continue
    const bucket = t < STRETCHES[0][0] ? 0 : stretchOf(t) + 1
    picked[bucket]++
    if (tellsWeekdaysApart(model)) aware[bucket]++
    per.forEach((c, k) => {
      const state = states[k]
      const inUse = state.inUse
      if (inUse) {
        c.usedOn[t] = true
        c.shiftOn[t] = state.shift
        c.use.days[bucket]++
        if (c.use.first === null) c.use.first = t
      } else if (c.wasInUse) c.use.offs++
      c.wasInUse = inUse
      if (t === DAYS - 1) {
        c.use.last = inUse ? 1 : 0
        c.shifts = inUse ? state.shift.map((row) => round(row.reduce((a, b) => a + b, 0) / row.length)) : null
      }
    })

    // The week ahead written today, each forecast set beside what was then answered.
    for (let ahead = 1; ahead <= HORIZON; ahead++) {
      const d = t + ahead
      if (d >= DAYS) break
      const st = stretchOf(d)
      if (st < 0) continue
      for (let i = 0; i < BLOCKS.length; i++) {
        const actual = rec.reading[d][i]
        if (actual === null) continue
        const pWithout = predict(model, values, rec.dayName[d], BLOCKS[i])
        const pFlat = model === 'sameBlock' ? pWithout : predict('sameBlock', values, rec.dayName[d], BLOCKS[i])
        if (pWithout === null || pFlat === null) continue
        let pTold = pFlat
        if (truth) {
          const level = predict('sameBlock', bare, rec.dayName[d], BLOCKS[i])
          pTold = (level ?? pFlat) + truth[phase(d)][rec.weekday[d]][i]
        }
        const mWithout = Math.abs(actual - pWithout)
        const mTold = Math.abs(actual - pTold)
        const mFlat = Math.abs(actual - pFlat)
        for (let k = 0; k < per.length; k++) {
          const c = per[k]
          const state = states[k]
          const pWith = state.inUse ? pFlat + state.shift[rec.weekday[d]][i] : pWithout
          const mWith = Math.abs(actual - pWith)
          const row = c.s[st]
          row[0] += mWithout
          row[1] += mWith
          row[2] += mTold
          row[3] += mFlat
          row[4]++
          if (st === STRETCHES.length - 1) {
            const by = c.h[ahead - 1]
            by[0] += mWithout
            by[1] += mWith
            by[2] += mTold
            by[3]++
          }
        }
      }
    }

    // The challenger on the way in use, as the app would run it today (Phase 8's gate and conditions).
    if (withChallenger) {
      const points = Array.from({ length: EVENING_THINGS }, (_, j) => eveningPoints(rec, t, j))
      const gateKey = `${points[0].length}`
      if (gateKey !== lastGate) {
        lastGate = gateKey
        const worth = points.some((p) => Math.abs(difference(p) ?? 0) >= WORTH_POINTS - 1e-9)
        onList = worth ? kindsAtPattern(points.map((p, j) => compare(p, { id: `thing.${j}`, worth: WORTH_POINTS })), CHALLENGER.maxKinds) : []
      }
      const conditions = [sleep, evening, ...onList.map((id) => kind(Number(id.slice(6))))]
      const way = (states[0].inUse ? LEVEL_WEEKDAY : model) as ModelId
      if (runChallenger(way, values, today, conditions, CHALLENGER, predictOf).picked) {
        ch.adopted = 1
        ch.days++
      }
    }
  }
  const ms = Math.round(performance.now() - t0)
  return per.map((c) => ({
    seed,
    s: c.s.map((row) => [round(row[0]), round(row[1]), round(row[2]), round(row[3]), row[4]]) as WeekPerson['s'],
    h: c.h.map((row) => [round(row[0]), round(row[1]), round(row[2]), row[3]]) as WeekPerson['h'],
    use: c.use,
    shifts: c.shifts,
    aware,
    picked,
    ...(withChallenger ? { ch } : {}),
    ms,
  }))
}

/** For the check that a world drawn here is the world as it was: one person's first answered readings. */
export const firstReadings = (world: WeekWorld, seed: number): (number | null)[] => recordOf(world.spec, seed).reading.slice(0, 30).flat()
