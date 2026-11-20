import { BLOCKS, type Block } from '../src/blocks'
import { CHALLENGER, kindsAtPattern, runChallenger, type ChallengerNumbers, type Condition } from '../src/challenger'
import { compare, difference, WORTH_POINTS } from '../src/counted/compare'
import { BACKTEST_DAYS, chooseModel, loggedDays, MIN_DAYS_TODAY, MODELS, predict, type Backtest, type ModelId } from '../src/forecast'
import { slotKey } from '../src/observe'
import { bandOf } from '../src/score'
import { chooseOfFive, FIFTH, FIFTH_WAY, fifthWayOf, type FifthNumbers, type WayId } from '../src/weekdayPattern'
import { EVENING_THINGS, eveningPoints, recordOf, type CountedRecord } from './countedWorlds'
import { BORROW_OFFSET, DAYS, FIRST_DAY, forecastWorldById, type ForecastWorld } from './forecastSim'

// The week ahead's fifth way: its simulation (the forecast follow-ups, Batch 2, item 5; its criteria were frozen on
// 2026-11-20, before any of this was written; the plan holds them, and its results file will name their hash). Phase
// 8's simulated people and worlds, the app's own four ways and their daily pick, the app's own fifth way and its
// margin (src/weekdayPattern.ts), and the app's own challenger on the way picked of five. Every day from day 15 to day
// 180 is picked for from the record before it. Offline only: nothing in src/ imports this folder.

const MORNING = 0
const EVENING = 2
/** Criterion 2's days: the day-ahead forecasts for days 151 to 180 (0-based 150 to 179). */
export const MEASURE_FROM = 150

const RHYTHM_HALF = [0.1, -0.2, -0.1, 0, 0, 0.1, 0.2] // Sunday first: Phase 8's rhythm at half its steps

const rhythm = forecastWorldById('rhythm')
export const FIFTH_WORLDS: readonly ForecastWorld[] = [
  forecastWorldById('plain'),
  forecastWorldById('streaks'),
  forecastWorldById('sparse'),
  forecastWorldById('season'),
  rhythm,
  { id: 'rhythm-half', kind: 'reported', spec: { ...rhythm.spec, id: 'forecast-rhythm-half', shift: (_d, weekday) => RHYTHM_HALF[weekday] }, borrow: rhythm.borrow },
]

export const fifthWorldById = (id: string): ForecastWorld => {
  const w = FIFTH_WORLDS.find((x) => x.id === id)
  if (!w) throw new Error(`no fifth-way world ${id}`)
  return w
}

const round = (v: number | null): number | null => (v === null ? null : Math.round(v * 1000) / 1000)

/** One day of one person: the day (0 first), whether the fifth way was picked, and whether the challenger was. */
export type FifthDay = [day: number, fifth: 0 | 1, challenger: 0 | 1]

/**
 * A record run's day on which the fifth way beat each of the four in the back-test and had a gain and a clear, the only
 * days a margin can pick it (stress/fifthMargin.ts): what the margin is judged on; the challenger on the four's pick and
 * on the fifth way; and tomorrow's day-ahead misses, by the four's pick on the slots it forecasts, and by both on the
 * slots both forecast.
 */
export type AltDay = [day: number, slots: number, gain: number, clear: number, ch4: 0 | 1, ch5: 0 | 1, s4all: number, nall: number, s4both: number, s5both: number, nboth: number]

export interface FifthPerson {
  seed: number
  days: FifthDay[]
  /** Criterion 2 and 4: the day-ahead forecasts for days 151 to 180, their summed absolute miss and count, by the pick of four and by the pick of five, on the same slots. */
  four: { sum: number; n: number }
  five: { sum: number; n: number }
  /** On the days the fifth way was picked: the miss of its day-ahead forecasts against the four's on the same slots. */
  pickedSlots: { five: number; four: number; n: number }
  /** On the last day: the weekday cells that stood at a steady pattern, as "block.weekday". */
  lastCells: string[]
  ms: number
  /** A record run's alone (FIFTH_RECORD=1): criterion 2's misses on the measured days no margin can change, and every day a margin can. */
  record?: { nb: { sum: number; n: number }; alt: AltDay[] }
}

/** One simulated person through one world: the pick of four and of five each day, the challenger on the pick of five, and the day-ahead forecasts of both picks. */
export function runFifth(world: ForecastWorld, seed: number, fifthNumbers: FifthNumbers = FIFTH, challenger: ChallengerNumbers = CHALLENGER, record = false): FifthPerson {
  const t0 = performance.now()
  const rec: CountedRecord = recordOf(world.spec, seed)
  const lender: CountedRecord = world.borrow ? recordOf(world.borrow, seed + BORROW_OFFSET) : rec
  const index = new Map(rec.dayName.slice(0, DAYS).map((name, d) => [name, d]))
  const at = (day: string): number | undefined => index.get(day)

  // The challenger's conditions, exactly as Phase 8's simulation gives them (stress/forecastSim.ts).
  const fixedBlocks: readonly Block[] = challenger.eachCheckin ? BLOCKS : ['morning']
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

  const values = new Map<string, number>()
  const fifth = fifthWayOf(values, fifthNumbers)
  // A past slot's forecast by one of the four rests on the record before its day alone, so it is worked out once.
  const memo = new Map<string, number | null>()
  const predictPast = (model: ModelId, day: string, block: Block): number | null => {
    const key = `${model}|${day}|${block}`
    if (!memo.has(key)) memo.set(key, predict(model, values, day, block))
    return memo.get(key) as number | null
  }
  /** The way picked's forecast for a past slot, the fifth way's included: what the challenger is tried on. */
  const predictOf = (model: ModelId, _values: ReadonlyMap<string, number>, day: string, block: Block): number | null => ((model as WayId) === FIFTH_WAY ? fifth.predict(day, block) : predictPast(model, day, block))

  /** The app's daily pick of four (chooseModel), each past slot's forecast worked out once, its back-tests kept for the pick of five. */
  const pickFour = (t: number): { model: ModelId; backtests: Backtest[] } | null => {
    const backtests: Backtest[] = []
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
      backtests.push({ model, horizon: 1, mae: n ? sum / n : null, n, errors: [] })
    }
    const able = backtests.filter((b) => b.mae !== null && b.n >= 5)
    if (!able.length) return null
    const best = able.reduce((a, b) => ((b.mae as number) < (a.mae as number) ? b : a))
    return { model: best.model, backtests }
  }

  const days: FifthDay[] = []
  const four = { sum: 0, n: 0 }
  const five = { sum: 0, n: 0 }
  const pickedSlots = { five: 0, four: 0, n: 0 }
  let lastGate = ''
  let onList: string[] = []
  const nb = { sum: 0, n: 0 }
  const alt: AltDay[] = []
  const r4 = (v: number): number => Math.round(v * 10000) / 10000
  for (let t = 0; t < DAYS; t++) {
    // The record as it stood before day t: every slot of the days before it.
    if (t > 0) BLOCKS.forEach((b, i) => { const v = rec.reading[t - 1][i]; if (v !== null) values.set(slotKey(rec.dayName[t - 1], b), v) })
    if (t < FIRST_DAY) continue
    const today = rec.dayName[t]
    const chosen = loggedDays(values) >= MIN_DAYS_TODAY ? pickFour(t) : null
    // Every fiftieth person is picked for by the app's own functions too, day by day: the two must agree.
    if (seed % 50 === 0) {
      const own = loggedDays(values) >= MIN_DAYS_TODAY ? chooseModel(values, today) : null
      if ((own?.model ?? null) !== (chosen?.model ?? null)) throw new Error(`seed ${seed}, day ${t}: the pick of four differs from the app's`)
    }
    if (!chosen) continue
    const ofFive = chooseOfFive(values, today, fifth, fifthNumbers, { model: chosen.model, backtests: chosen.backtests })
    const way = ofFive?.way ?? chosen.model
    // And every tenth day of theirs, the pick of five by the app's own function with a fresh fifth way, so nothing kept between days can differ.
    if (seed % 50 === 0 && t % 10 === 0) {
      const own = chooseOfFive(values, today, fifthWayOf(values, fifthNumbers), fifthNumbers)
      if ((own?.way ?? null) !== way) throw new Error(`seed ${seed}, day ${t}: the pick of five differs from the app's`)
    }

    // The challenger on the way picked of five, as the app would run it today (Phase 8's gate and conditions).
    const points = Array.from({ length: EVENING_THINGS }, (_, j) => eveningPoints(rec, t, j))
    const gateKey = `${points[0].length}`
    if (gateKey !== lastGate) {
      lastGate = gateKey
      const worth = points.some((p) => Math.abs(difference(p) ?? 0) >= WORTH_POINTS - 1e-9)
      onList = worth ? kindsAtPattern(points.map((p, j) => compare(p, { id: `thing.${j}`, worth: WORTH_POINTS })), challenger.maxKinds) : []
    }
    const conditions = [sleep, evening, ...onList.map((id) => kind(Number(id.slice(6))))]
    const run = runChallenger(way as ModelId, values, today, conditions, challenger, predictOf)
    days.push([t, way === FIFTH_WAY ? 1 : 0, run.picked ? 1 : 0])

    // A record run: the day as any margin would have it. The fifth way can be picked only where it beat each of the
    // four (chooseOfFive's own test, on the same back-tests) with a gain and a clear; every other day is the same under
    // any margin, and only its share of criterion 2's misses is kept.
    if (record) {
      const tried = ofFive?.tried
      const able = chosen.backtests.filter((b) => b.mae !== null && b.n >= 5).map((b) => b.mae as number)
      const open = tried !== undefined && tried.mae !== null && tried.n >= 5 && able.every((m) => (tried.mae as number) < m) && tried.gain !== null && tried.clear !== null
      let s4all = 0
      let nall = 0
      let s4both = 0
      let s5both = 0
      let nboth = 0
      if (t + 1 < DAYS) {
        const tomorrow = rec.dayName[t + 1]
        BLOCKS.forEach((b, i) => {
          const actual = rec.reading[t + 1][i]
          if (actual === null) return
          const p4 = predict(chosen.model, values, tomorrow, b)
          if (p4 === null) return
          s4all += Math.abs(actual - p4)
          nall++
          if (!open) return
          const p5 = fifth.predict(tomorrow, b, today)
          if (p5 === null) return
          s4both += Math.abs(actual - p4)
          s5both += Math.abs(actual - p5)
          nboth++
        })
      }
      if (open && tried) {
        const other = runChallenger((way === FIFTH_WAY ? chosen.model : FIFTH_WAY) as ModelId, values, today, conditions, challenger, predictOf).picked ? 1 : 0
        const own = run.picked ? 1 : 0
        const [ch4, ch5] = way === FIFTH_WAY ? [other, own] : [own, other]
        // The gain and the clear unrounded, so a margin's test reads them exactly as chooseOfFive does.
        alt.push([t, tried.slots, tried.gain as number, tried.clear as number, ch4 as 0 | 1, ch5 as 0 | 1, r4(s4all), nall, r4(s4both), r4(s5both), nboth])
      } else if (t + 1 >= MEASURE_FROM && t + 1 < DAYS) {
        nb.sum += s4all
        nb.n += nall
      }
    }

    // Criterion 2 and 4: the day-ahead forecast written today for tomorrow, by each pick, on tomorrow's answered slots.
    if (t + 1 >= MEASURE_FROM && t + 1 < DAYS) {
      const tomorrow = rec.dayName[t + 1]
      BLOCKS.forEach((b, i) => {
        const actual = rec.reading[t + 1][i]
        if (actual === null) return
        const p4 = predict(chosen.model, values, tomorrow, b)
        const p5 = way === FIFTH_WAY ? fifth.predict(tomorrow, b, today) : p4
        if (p4 === null || p5 === null) return
        four.sum += Math.abs(actual - p4)
        four.n++
        five.sum += Math.abs(actual - p5)
        five.n++
      })
    }
    // On a day the fifth way is picked: its day-ahead miss against the four's, on the same slots.
    if (way === FIFTH_WAY && t + 1 < DAYS) {
      const tomorrow = rec.dayName[t + 1]
      BLOCKS.forEach((b, i) => {
        const actual = rec.reading[t + 1][i]
        if (actual === null) return
        const p4 = predict(chosen.model, values, tomorrow, b)
        const p5 = fifth.predict(tomorrow, b, today)
        if (p4 === null || p5 === null) return
        pickedSlots.four += Math.abs(actual - p4)
        pickedSlots.five += Math.abs(actual - p5)
        pickedSlots.n++
      })
    }
  }
  const last = rec.dayName[DAYS - 1]
  const lastCells = fifth.cells(last).filter((c) => c.pattern).map((c) => `${c.block}.${c.weekday}`)
  return {
    seed,
    days,
    four: { sum: round(four.sum) as number, n: four.n },
    five: { sum: round(five.sum) as number, n: five.n },
    pickedSlots: { five: round(pickedSlots.five) as number, four: round(pickedSlots.four) as number, n: pickedSlots.n },
    lastCells,
    ms: Math.round(performance.now() - t0),
    ...(record ? { record: { nb: { sum: r4(nb.sum), n: nb.n }, alt } } : {}),
  }
}

/** For the pool's check that a world's people come out alike with and without the shortcuts: the record's first morning. */
export const firstMorning = (world: ForecastWorld, seed: number): number | null => recordOf(world.spec, seed).reading[0][MORNING]
