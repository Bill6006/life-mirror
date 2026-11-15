import { addDays, BLOCKS, type Block } from './blocks'
import { standings, type Compared } from './counted/compare'
import { BACKTEST_DAYS, predict, type ModelId } from './forecast'
import { slotKey } from './observe'

// The forecast's one challenger (2026-11-14): a fifth way to forecast, never one per input. It is the way picked
// among the four, adjusted by a short, fixed list of conditions the record held the day before the day forecast: a
// short night, the evening before by its band, then a few kinds whose comparison for the next morning stands at a
// steady pattern. Every condition is read from the day before, and every adjustment's size from days before the day
// forecast, so nothing logged on or after a day can move that day's forecast. It is tried on the past exactly as it
// would have run then, set beside the base way slot by slot, and picked only when its gain in miss clears a margin
// over enough slots. The margin's numbers were set by an offline simulation in stress/, so that an input that says
// nothing about the days ahead is rarely picked. A condition the record cannot speak for moves nothing.

/** Switched off until its simulation has passed: while this is false nothing here is run by the app. */
export const CHALLENGER_ON = false

let forTests: boolean | null = null
/** For tests: the switch as given, or the code's own again with null. */
export function setChallengerForTests(on: boolean | null): void {
  forTests = on
}
/** Whether the app runs the challenger. */
export const challengerOn = (): boolean => forTests ?? CHALLENGER_ON

/** The method's numbers. */
export interface ChallengerNumbers {
  /** How many days before the day forecast are looked back over. */
  window: number
  /** The least earlier days in a state, and outside it, before that state adjusts anything. */
  minState: number
  /**
   * The shrinking: a state's size is cut by this many times the square of its own uncertainty over the square of the
   * size, and is nothing where that leaves nothing. A size no larger than chance alone gives moves no forecast.
   */
  shrink: number
  /** Whether the first two conditions adjust each check-in of the day, or the morning alone. */
  eachCheckin: boolean
  /** The margin: the least slots where it differed from the base way, the least average gain in miss over them in points, and the least that gain must stand clear of its own day-to-day spread. */
  minSlots: number
  minGain: number
  minClear: number
  /** The most kinds on the list. */
  maxKinds: number
}

export const CHALLENGER: ChallengerNumbers = { window: 180, minState: 8, shrink: 4, eachCheckin: true, minSlots: 20, minGain: 0.5, minClear: 2.4, maxKinds: 3 }

/** One condition on the list. */
export interface Condition {
  id: string
  /** The check-ins of the day it may move. */
  blocks: readonly Block[]
  /** Its state on a day, read from that day's own record alone; null where the record cannot say. */
  stateOn(day: string): string | null
  /** Whether a state moves the forecast: every state of the first two, and for a kind only the day it was present. */
  moves(state: string): boolean
}

/** What was added to a slot's forecast, and by which conditions. */
export interface Adjustment {
  points: number
  by: string[]
}

export interface ChallengerRun {
  base: ModelId
  /** Past slots where it differed from the base way, and the days that held them. */
  slots: number
  days: number
  /** The average gain in miss over those slots, in points; null with none. */
  gain: number | null
  /** That gain over its own day-to-day spread; null under two days. */
  clear: number | null
  picked: boolean
  /** Actual minus its forecast over the back-test's days: what its range is taken from. */
  errors: number[]
  /** The adjustment for a slot on or after the day of the run, from what the record holds now. */
  adjustmentFor(day: string, block: Block): Adjustment
}

export type Predict = (model: ModelId, values: ReadonlyMap<string, number>, day: string, block: Block) => number | null

interface Sums {
  n: number
  sum: number
  /** The sum of the misses' squares, for their spread. */
  squares: number
  states: Map<string, { n: number; sum: number }>
}

/**
 * One state's adjustment: its average miss less the average over every day the condition was known, shrunk by how
 * unsure that difference is; nothing under the minimum, and nothing where the difference is within its own noise.
 */
function sizeOf(sums: Sums | undefined, state: string, numbers: ChallengerNumbers): number {
  const s = sums?.states.get(state)
  if (!sums || !s || s.n < numbers.minState || sums.n - s.n < numbers.minState) return 0
  const size = s.sum / s.n - sums.sum / sums.n
  const spread = (sums.squares - (sums.sum * sums.sum) / sums.n) / (sums.n - 1)
  const unsure = spread * (1 / s.n - 1 / sums.n)
  if (size === 0) return 0
  return size * Math.max(0, 1 - (numbers.shrink * unsure) / (size * size))
}

/**
 * The challenger tried on the days before `today`, and ready to adjust the forecasts written today. Each past slot is
 * forecast by the base way from the record before its day, and adjusted by sizes learnt from the days before it alone;
 * the conditions are taken in order, each learning from what the ones before it left.
 */
export function runChallenger(base: ModelId, values: ReadonlyMap<string, number>, today: string, conditions: readonly Condition[], numbers: ChallengerNumbers = CHALLENGER, predictOf: Predict = predict): ChallengerRun {
  const sums = new Map<string, Sums>()
  const take = (key: string, state: string, miss: number): void => {
    const all = sums.get(key) ?? { n: 0, sum: 0, squares: 0, states: new Map<string, { n: number; sum: number }>() }
    const s = all.states.get(state) ?? { n: 0, sum: 0 }
    all.n++
    all.sum += miss
    all.squares += miss * miss
    s.n++
    s.sum += miss
    all.states.set(state, s)
    sums.set(key, all)
  }
  /** A slot's adjustment; where the base way's miss on it is known, the sums take that miss in once each size has been read. */
  const adjust = (before: string, block: Block, miss: number | null): Adjustment => {
    let left = miss
    let points = 0
    const by: string[] = []
    conditions.forEach((c, i) => {
      if (!c.blocks.includes(block)) return
      const state = c.stateOn(before)
      if (state === null) return
      const key = `${i}|${block}`
      const size = c.moves(state) ? sizeOf(sums.get(key), state, numbers) : 0
      if (left !== null) {
        take(key, state, left)
        left -= size
      }
      if (size !== 0) {
        points += size
        by.push(c.id)
      }
    })
    return { points, by }
  }

  const errors: number[] = []
  const gains: number[] = []
  let slots = 0
  for (let back = numbers.window; back >= 1; back--) {
    const day = addDays(today, -back)
    const before = addDays(day, -1)
    let dayGain = 0
    let moved = false
    for (const block of BLOCKS) {
      const actual = values.get(slotKey(day, block))
      if (actual === undefined) continue
      const p = predictOf(base, values, day, block)
      if (p === null) continue
      const miss = actual - p
      const a = adjust(before, block, miss)
      if (a.points !== 0) {
        slots++
        moved = true
        dayGain += Math.abs(miss) - Math.abs(miss - a.points)
      }
      if (back <= BACKTEST_DAYS) errors.push(miss - a.points)
    }
    if (moved) gains.push(dayGain)
  }
  const total = gains.reduce((s, g) => s + g, 0)
  const gain = slots ? total / slots : null
  let clear: number | null = null
  if (gains.length >= 2) {
    const mean = total / gains.length
    const spread = Math.sqrt((gains.reduce((s, g) => s + (g - mean) ** 2, 0) / (gains.length - 1)) * gains.length)
    clear = spread > 0 ? total / spread : null
  }
  const picked = slots >= numbers.minSlots && gain !== null && gain >= numbers.minGain && clear !== null && clear >= numbers.minClear
  return { base, slots, days: gains.length, gain, clear, picked, errors, adjustmentFor: (day, block) => adjust(addDays(day, -1), block, null) }
}

/** The kinds that join the list: those of the family that stand at a steady pattern, in the family's own order, a few at most. */
export function kindsAtPattern(family: readonly Compared[], max: number = CHALLENGER.maxKinds): string[] {
  return standings(family)
    .filter((s) => s.standing === 'pattern')
    .slice(0, max)
    .map((s) => s.id)
}
