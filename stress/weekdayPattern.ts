import { addDays, BLOCKS, type Block } from '../src/blocks'
import { compare, difference, standings, WORTH_POINTS, type Compared, type Point } from '../src/counted/compare'
import { weekdayOf } from '../src/counted/occasions'
import { BACKTEST_DAYS, chooseModel, predict, type Chosen, type ModelId } from '../src/forecast'
import { slotKey } from '../src/observe'

// The week ahead's fifth way (the forecast follow-ups, Batch 2, item 5: designed, and its criteria frozen, 2026-11-20,
// in the private plan). CLOSED 2026-11-20 at the owner's word, and never built: its tuning found no numbers that meet
// its criteria (stress/RESULTS-11.md). This is the code its simulation ran. It was written in src/ (at 709cb16) so that
// the simulation would run the app's own code, as the challenger's did before it was wired, and was moved here, beside
// the simulation, once the item was closed. Nothing in the app has it.
//
// Its forecast for a slot is the same-block way's, plus the offset of that day's weekday at that check-in where the
// weekday's comparison at that check-in is a steady pattern: the reading at the check-in on that weekday against the
// other days, by the comparison core as it stands, the 21 comparisons (seven weekdays by three check-ins) one family.
// Everything is read from the record before the day forecast. It joins the four's back-test over the same 28 days and
// is used only when it beats them and clears a margin, so a weekday that only looks different is rarely drawn.

export const FIFTH_WAY = 'weekdayPattern'
export type WayId = ModelId | typeof FIFTH_WAY

/** The method's numbers, set on the simulation's tuning seeds. */
export interface FifthNumbers {
  /** How many days before the day forecast the comparisons and offsets look back over; never over 180. */
  window: number
  /** How many days running a comparison must stand at a pattern before it is read (1: the day alone). */
  hold: number
  /** The shrinking: an offset is cut by this many times the square of its uncertainty over its own square (0 to 4). */
  shrink: number
  /** The margin: the least slots where it differed from the same-block way, the least average gain in miss over them in points, and the least that gain must stand clear of its own day-to-day spread. */
  minSlots: number
  minGain: number
  minClear: number
}

export const FIFTH: FifthNumbers = { window: 180, hold: 1, shrink: 4, minSlots: 8, minGain: 1, minClear: 2 }

/** The core's own minimum of occasions on each side: under it an offset is nothing. */
const MIN_SIDE = 8

/** One weekday at one check-in, as the fifth way reads it for a day. */
export interface WeekdayCell {
  block: Block
  /** 0 Sunday to 6 Saturday. */
  weekday: number
  /** Whether its comparison stands at a steady pattern for that day. */
  pattern: boolean
  /** The offset in points the fifth way adds on that weekday at that check-in, where it is read; 0 where it is not. */
  offset: number
}

/**
 * One offset: the average of the same-block way's misses on the weekday's slots, less its average over every slot of
 * the check-in, cut by how unsure that difference is (the challenger's own estimate, src/challenger.ts's sizeOf).
 */
function offsetOf(own: readonly number[], all: readonly number[], shrink: number): number {
  if (own.length < MIN_SIDE || all.length - own.length < MIN_SIDE) return 0
  const mean = (xs: readonly number[]): number => xs.reduce((s, v) => s + v, 0) / xs.length
  const size = mean(own) - mean(all)
  if (size === 0) return 0
  const m = mean(all)
  const spread = all.reduce((s, v) => s + (v - m) ** 2, 0) / (all.length - 1)
  const unsure = spread * (1 / own.length - 1 / all.length)
  return size * Math.max(0, 1 - (shrink * unsure) / (size * size))
}

/** The fifth way over one record. What it works out for a day is kept, since a day's reading of the record before it never changes while the record is held. */
export interface FifthWay {
  /** The 21 cells for a day, from the record before that day (and before `asOf`, for a day not yet come). */
  cells(day: string, asOf?: string): WeekdayCell[]
  /** Whether weekday w at a check-in is read for a day: a steady pattern on that day and on each of the hold − 1 days before. */
  read(day: string, block: Block, asOf?: string): number
  /** Its forecast for a slot; null where the same-block way has none. */
  predict(day: string, block: Block, asOf?: string): number | null
}

export function fifthWayOf(values: ReadonlyMap<string, number>, numbers: FifthNumbers = FIFTH): FifthWay {
  const kept = new Map<string, WeekdayCell[]>()
  const sameBlock = new Map<string, number | null>()
  /** The same-block way's forecast; kept only for a day whose record before it is whole (no `asOf` cuts it short). */
  const sameBlockAt = (day: string, block: Block, asOf?: string): number | null => {
    if (asOf !== undefined && asOf < day) return predict('sameBlock', values, day, block)
    const key = `${day}|${block}`
    if (!sameBlock.has(key)) sameBlock.set(key, predict('sameBlock', values, day, block))
    return sameBlock.get(key) as number | null
  }

  const cells = (day: string, asOf?: string): WeekdayCell[] => {
    const cut = asOf !== undefined && asOf < day ? asOf : day
    const key = `${day}|${cut}`
    const was = kept.get(key)
    if (was) return was
    const out: WeekdayCell[] = []
    const family: { id: string; points: Point[] }[] = []
    const offsets: number[] = []
    let big = false
    for (const block of BLOCKS) {
      const slots: { day: string; outcome: number; weekday: number; miss: number | null }[] = []
      for (let back = numbers.window; back >= 1; back--) {
        const d = addDays(day, -back)
        if (d >= cut) continue
        const v = values.get(slotKey(d, block))
        if (v === undefined) continue
        const p = sameBlockAt(d, block)
        slots.push({ day: d, outcome: v, weekday: weekdayOf(d), miss: p === null ? null : v - p })
      }
      const misses = slots.flatMap((x) => (x.miss === null ? [] : [x.miss]))
      for (let w = 0; w < 7; w++) {
        const points: Point[] = slots.map((x) => ({ day: x.day, event: x.weekday === w, outcome: x.outcome }))
        const own = slots.flatMap((x) => (x.weekday === w && x.miss !== null ? [x.miss] : []))
        offsets.push(offsetOf(own, misses, numbers.shrink))
        const n = points.filter((x) => x.event).length
        const diff = difference(points)
        if (n >= MIN_SIDE && points.length - n >= MIN_SIDE && diff !== null && Math.abs(diff) >= WORTH_POINTS - 1e-9) big = true
        out.push({ block, weekday: w, pattern: false, offset: 0 })
        family.push({ id: `fifth.${block}.${w}`, points })
      }
    }
    // Where none of the 21 has a difference worth saying, none can stand at a pattern, and the chance check is not run.
    if (big) {
      const compared: Compared[] = family.map((f) => compare(f.points, { id: f.id, worth: WORTH_POINTS }))
      standings(compared).forEach((s, i) => {
        if (s.standing === 'pattern') out[i] = { ...out[i], pattern: true, offset: offsets[i] }
      })
    }
    kept.set(key, out)
    return out
  }

  const read = (day: string, block: Block, asOf?: string): number => {
    const w = weekdayOf(day)
    const at = BLOCKS.indexOf(block) * 7 + w
    for (let back = 0; back < numbers.hold; back++) {
      const d = addDays(day, -back)
      const c = cells(d, asOf)[at]
      if (!c.pattern) return 0
    }
    return cells(day, asOf)[at].offset
  }

  return {
    cells,
    read,
    predict: (day, block, asOf) => {
      const base = sameBlockAt(day, block, asOf)
      return base === null ? null : base + read(day, block, asOf)
    },
  }
}

/** The fifth way tried over the same 28 days as the four, set beside the same-block way slot by slot. */
export interface FifthTried {
  /** Its average miss over the days it could forecast; null with none. */
  mae: number | null
  n: number
  /** Past slots where it differed from the same-block way, the days that held them, the average gain in miss over them, and that gain over its own day-to-day spread. */
  slots: number
  days: number
  gain: number | null
  clear: number | null
  /** Actual minus its forecast, for its range. */
  errors: number[]
}

export function tryFifth(fifth: FifthWay, values: ReadonlyMap<string, number>, today: string): FifthTried {
  const errors: number[] = []
  const gains: number[] = []
  let sum = 0
  let slots = 0
  for (let back = BACKTEST_DAYS; back >= 1; back--) {
    const day = addDays(today, -back)
    let dayGain = 0
    let moved = false
    for (const block of BLOCKS) {
      const actual = values.get(slotKey(day, block))
      if (actual === undefined) continue
      const p = fifth.predict(day, block)
      if (p === null) continue
      const s = predict('sameBlock', values, day, block) as number
      errors.push(actual - p)
      sum += Math.abs(actual - p)
      if (p !== s) {
        slots++
        moved = true
        dayGain += Math.abs(actual - s) - Math.abs(actual - p)
      }
    }
    if (moved) gains.push(dayGain)
  }
  const total = gains.reduce((s, g) => s + g, 0)
  let clear: number | null = null
  if (gains.length >= 2) {
    const mean = total / gains.length
    const spread = Math.sqrt((gains.reduce((s, g) => s + (g - mean) ** 2, 0) / (gains.length - 1)) * gains.length)
    clear = spread > 0 ? total / spread : null
  }
  return { mae: errors.length ? sum / errors.length : null, n: errors.length, slots, days: gains.length, gain: slots ? total / slots : null, clear, errors }
}

/** The day's pick of five: the four's pick, unless the fifth way beats each of the four and clears the margin. A tie goes to the four. */
export interface PickOfFive {
  way: WayId
  four: Chosen
  tried: FifthTried
  picked: boolean
}

export function chooseOfFive(values: ReadonlyMap<string, number>, today: string, fifth: FifthWay, numbers: FifthNumbers = FIFTH, four: Chosen | null = chooseModel(values, today)): PickOfFive | null {
  if (!four) return null
  const tried = tryFifth(fifth, values, today)
  const able = four.backtests.filter((b) => b.mae !== null && b.n >= 5).map((b) => b.mae as number)
  const beats = tried.mae !== null && tried.n >= 5 && able.every((m) => tried.mae as number < m)
  const picked = beats && tried.slots >= numbers.minSlots && tried.gain !== null && tried.gain >= numbers.minGain && tried.clear !== null && tried.clear >= numbers.minClear
  return { way: picked ? FIFTH_WAY : four.model, four, tried, picked }
}
