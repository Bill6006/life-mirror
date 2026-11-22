import { addDays, BLOCKS } from '../src/blocks'
import { weekdayOf } from '../src/counted/occasions'
import { BACKTEST_DAYS, errorBand, HORIZON, predict } from '../src/forecast'
import { gateOf, stateFrom, WEEK, type DayMiss, type Gate, type WeekNumbers, type WeekRow, type WeekState } from '../src/levelWeekday'
import { slotKey } from '../src/observe'

// The week ahead's level-plus-weekday way, as its simulation reads it (designed 2026-11-21 at the owner's word; its
// criteria were frozen that day before the way's code was written, and the private repository holds them). The way's own
// code moved into the app in Stage A (2026-11-21), number for number: src/levelWeekday.ts, behind a switch that is off.
// What stays here is the simulation's alone: the day-by-day trackers, and the slow second implementation that works each
// day out from the record alone, which the simulation sets beside them. The app never calls anything of this file.
//
// Its forecast for a check-in of a day is the same-block way's, plus one shift for that day's weekday, the same at each
// of the day's check-ins and at every distance ahead. The seven shifts are learnt from the same-block way's own misses
// a day ahead, each day counting once. They are used only while one test of the seven weekdays together stands open,
// and has stood open on each of the days of its hold before; otherwise the way is not in use, and the four's pick
// stands exactly as today. It joins no back-test. Everything is read from the record before the day forecast.

export { LEVEL_WEEKDAY } from '../src/forecast'
export { fChance, gateOf, incompleteBeta, levelWeekdayReader, levelWeekdayRows, WEEK, type DayMiss, type Gate, type WeekNumbers, type WeekRow, type WeekState } from '../src/levelWeekday'

const NONE = [0, 0, 0, 0, 0, 0, 0]

/** A day's miss of the same-block way (item 3): over its answered check-ins, the reading less that way's forecast from the record before the day; null with none. */
export function dayMiss(values: ReadonlyMap<string, number>, day: string): number | null {
  let sum = 0
  let n = 0
  for (const block of BLOCKS) {
    const v = values.get(slotKey(day, block))
    if (v === undefined) continue
    const p = predict('sameBlock', values, day, block)
    if (p === null) continue
    sum += v - p
    n++
  }
  return n ? sum / n : null
}

/** The gate for forecasts written on a day, from the record before it alone. */
export function gateOn(values: ReadonlyMap<string, number>, today: string, numbers: WeekNumbers = WEEK): Gate {
  const days: DayMiss[] = []
  for (let back = numbers.window; back >= 1; back--) {
    const day = addDays(today, -back)
    const miss = dayMiss(values, day)
    if (miss !== null) days.push({ weekday: weekdayOf(day), miss })
  }
  return gateOf(days, numbers)
}

/** The way's state for forecasts written on a day, worked out from the record alone, as the app would. */
export function weekStateOf(values: ReadonlyMap<string, number>, today: string, numbers: WeekNumbers = WEEK): WeekState {
  const gate = gateOn(values, today, numbers)
  let held = gate.open
  for (let back = 1; held && back <= numbers.hold; back++) held = gateOn(values, addDays(today, -back), numbers).open
  return stateFrom(gate, held)
}

/** The way's forecast for a slot written on a day: the same-block way's from the record before that day, plus the day's weekday's shift where the way is in use; the same-block way's, number for number, where it is not. */
export function predictLevelWeekday(values: ReadonlyMap<string, number>, today: string, day: string, block: (typeof BLOCKS)[number], numbers: WeekNumbers = WEEK): number | null {
  const flat = predict('sameBlock', values, day, block)
  if (flat === null) return null
  const state = weekStateOf(values, today, numbers)
  return state.inUse ? flat + state.shift[weekdayOf(day)][BLOCKS.indexOf(block)] : flat
}

/** The same state kept day by day, for the simulation: each day's misses are taken in once, in order, and each day's state asked once, in order. */
export interface WeekTracker {
  take(day: number, weekday: number, misses: readonly (number | null)[]): void
  stateOn(day: number): WeekState
}

export function trackerOf(numbers: WeekNumbers = WEEK): WeekTracker {
  const taken: (DayMiss | null)[] = []
  const open: boolean[] = []
  return {
    take(day, weekday, misses) {
      if (day !== taken.length) throw new Error(`the tracker was given day ${day} after ${taken.length} days`)
      const got = misses.filter((m): m is number => m !== null)
      taken.push(got.length ? { weekday, miss: got.reduce((a, b) => a + b, 0) / got.length } : null)
    },
    stateOn(day) {
      if (day !== open.length || day !== taken.length) throw new Error(`the tracker was asked for day ${day} with ${taken.length} days taken and ${open.length} asked`)
      const days = taken.slice(Math.max(0, day - numbers.window), day).filter((d): d is DayMiss => d !== null)
      const gate = gateOf(days, numbers)
      open.push(gate.open)
      let held = gate.open
      for (let back = 1; held && back <= numbers.hold; back++) held = day - back >= 0 && open[day - back]
      return stateFrom(gate, held)
    },
  }
}

// ---- The way's rows, kept day by day for the simulation (written 2026-11-21, after the ranges' criteria were frozen). ----

/** As the app stores a number of a row (src/forecast.ts's clamp). */
const clamp = (v: number): number => Math.max(0, Math.min(100, Math.round(v)))
const rowKey = (day: string, block: string, horizon: number): string => `${day}|${block}|${horizon}`

/** What the day-by-day tracker is given by the simulation, each past forecast made once. */
export interface RangeInputs {
  /** The reading at a check-in (0 morning) of a day (0 first), or null. */
  reading(day: number, block: number): number | null
  /** The same-block way's miss on a past slot as it would have been forecast that many days out (1: from the record before the day): the reading less the forecast; null where either is missing. */
  flatMiss(day: number, block: number, ahead: number): number | null
  /** The same-block way's forecast, written on day t from the record before it, for a slot on or after t; null where it has none. */
  flatForecast(t: number, day: number, block: number): number | null
  weekday(day: number): number
  dayName(day: number): string
}

export interface RangeTracker {
  stateOn(day: number): WeekState
  rowsOn(day: number): Map<string, WeekRow>
}

/** The same state and rows kept day by day, for the simulation: the days are numbered from the record's first. */
export function rangeTrackerOf(numbers: WeekNumbers, inputs: RangeInputs): RangeTracker {
  const dayMiss: (DayMiss | null)[] = []
  const gates: Gate[] = []
  const missOfDay = (x: number): DayMiss | null => {
    const got = BLOCKS.map((_, i) => inputs.flatMiss(x, i, 1)).filter((m): m is number => m !== null)
    return got.length ? { weekday: inputs.weekday(x), miss: got.reduce((a, b) => a + b, 0) / got.length } : null
  }
  /** The gate for forecasts written on day k, from the days before it; closed before the record begins. */
  const gateOn = (k: number): Gate => {
    if (k < 0) return { open: false, f: null, chance: null, shift: NONE }
    while (gates.length <= k) {
      const d = gates.length
      while (dayMiss.length < d) dayMiss.push(missOfDay(dayMiss.length))
      gates.push(gateOf(dayMiss.slice(Math.max(0, d - numbers.window), d).filter((m): m is DayMiss => m !== null), numbers))
    }
    return gates[k]
  }
  const stateOn = (t: number): WeekState => {
    const g = gateOn(t)
    let held = g.open
    for (let back = 1; held && back <= numbers.hold; back++) held = gateOn(t - back).open
    return stateFrom(g, held)
  }
  const misses = (t: number, ahead: number): number[] => {
    const out: number[] = []
    for (let back = 1; back <= BACKTEST_DAYS; back++) {
      const x = t - back
      if (x < 0) continue
      const shift = gateOn(x - (Math.max(1, ahead) - 1)).shift[inputs.weekday(x)]
      for (let i = 0; i < BLOCKS.length; i++) {
        const e = inputs.flatMiss(x, i, ahead)
        if (e !== null) out.push(e - shift)
      }
    }
    return out
  }
  const band = (t: number, ahead: number): { lo: number; hi: number } => {
    if (ahead > 1) {
      const far = misses(t, ahead)
      if (far.length >= 5) return errorBand(far)
    }
    return errorBand(misses(t, 1))
  }
  return {
    stateOn,
    rowsOn(t) {
      const s = stateOn(t)
      const out = new Map<string, WeekRow>()
      if (!s.inUse) return out
      for (let h = 0; h <= HORIZON; h++) {
        const d = t + h
        const b = band(t, Math.max(1, h))
        BLOCKS.forEach((block, i) => {
          const flat = inputs.flatForecast(t, d, i)
          if (flat === null) return
          const p = flat + s.shift[inputs.weekday(d)][i]
          out.set(rowKey(inputs.dayName(d), block, h), { point: clamp(p), lo: clamp(p + b.lo), hi: clamp(p + b.hi) })
        })
      }
      return out
    },
  }
}
