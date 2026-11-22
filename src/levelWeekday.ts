import { addDays, BLOCKS, type Block } from './blocks'
import { weekdayOf } from './counted/occasions'
import type { Forecast } from './db'
import { BACKTEST_DAYS, errorBand, HORIZON, LEVEL_WEEKDAY, loggedDays, MIN_DAYS_TODAY, MIN_DAYS_WEEK, predict } from './forecast'
import { slotKey } from './observe'

// The week ahead's level-plus-weekday way (designed 2026-11-21 at the owner's word). Its points' and its ranges' criteria
// were frozen that day before its code was written, and both verdicts passed on unread seeds (stress/RESULTS-13.md and
// RESULTS-14.md). Moved here from stress/levelWeekday.ts number for number in Stage A (2026-11-21), behind a switch that
// is off: while it is off, nothing of the way runs in the app (docs/week-ahead-weekdays.md).
//
// Its forecast for a check-in of a day is the same-block way's, plus one shift for that day's weekday, the same at each
// of the day's check-ins and at every distance ahead. The seven shifts are learnt from the same-block way's own misses
// a day ahead, each day counting once. They are used only while one test of the seven weekdays together stands open,
// and has stood open on each of the days of its hold before; otherwise the way is not in use, and the four's pick
// writes the day exactly as before. It joins no back-test. Everything is read from the record before the day forecast.

/**
 * Off (Stage A, 2026-11-21): the way is built, tested and broken on purpose, and nothing of it runs in the app. Switching
 * it on is Stage B, at the owner's own second word, in a commit of its own that changes nothing else in src/; switching it
 * off again is the same one line. While this is false the writer never asks the way.
 */
export const LEVEL_WEEKDAY_ON = false

let forTests: boolean | null = null
/** For tests: the switch as given, or the code's own again with null. */
export function setLevelWeekdayForTests(on: boolean | null): void {
  forTests = on
}
/** Whether the app runs the way. */
export const levelWeekdayOn = (): boolean => forTests ?? LEVEL_WEEKDAY_ON

/** The method's numbers, set on the simulation's tuning seeds inside the limits the frozen criteria state. */
export interface WeekNumbers {
  /** How many days before the day forecast are read (56 to 180). */
  window: number
  /** The gate: the most the chance of the weekdays' spread, with nothing there, may be (never above 1 in 100). */
  chance: number
  /** The least days each weekday must have in the window (never under 4). */
  minDays: number
  /** The hold: the gate must also have stood open on each of this many days before (never under 28). */
  hold: number
  /** The shrinking: each shift is multiplied by 1 less this over F, never under nothing (1 to 4). */
  shrink: number
}

/**
 * As the tuning on seeds 1 to 1000 set them (2026-11-21): of the settings where every criterion read there would pass,
 * the one with the most room at its tightest criterion. Written here before the verdict's seeds were read.
 */
export const WEEK: WeekNumbers = { window: 180, chance: 0.000001, minDays: 4, hold: 28, shrink: 2 }

/** A day's miss of the same-block way, with the day's weekday (0 Sunday to 6 Saturday). */
export interface DayMiss {
  weekday: number
  miss: number
}

export interface Gate {
  open: boolean
  /** The spread between the weekdays over the spread inside them; null where a weekday has too few days. */
  f: number | null
  /** The chance of an F this large with nothing there; null with no F. */
  chance: number | null
  /** Each weekday's shift at its strength, in points; all nothing while the gate is closed. */
  shift: number[]
}

const NONE = [0, 0, 0, 0, 0, 0, 0]

function lnGamma(x: number): number {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.001208650973866179, -0.000005395239384953]
  let y = x
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5)
  let ser = 1.000000000190015
  for (const c of g) ser += c / ++y
  return -tmp + Math.log((2.5066282746310005 * ser) / x)
}

/** The continued fraction of the incomplete beta function (Lentz's method). */
function betaFraction(a: number, b: number, x: number): number {
  const TINY = 1e-300
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < TINY) d = TINY
  d = 1 / d
  let h = d
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < TINY) d = TINY
    c = 1 + aa / c
    if (Math.abs(c) < TINY) c = TINY
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < TINY) d = TINY
    c = 1 + aa / c
    if (Math.abs(c) < TINY) c = TINY
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-13) break
  }
  return h
}

/** The regularized incomplete beta function. */
export function incompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const front = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  return x < (a + 1) / (a + b + 2) ? (front * betaFraction(a, b, x)) / a : 1 - (front * betaFraction(b, a, 1 - x)) / b
}

/** The chance of an F at least this large with nothing there, on d1 and d2 degrees of freedom. */
export function fChance(f: number, d1: number, d2: number): number {
  if (!(f > 0)) return 1
  return incompleteBeta(d2 / 2, d1 / 2, d2 / (d2 + d1 * f))
}

/**
 * The seven shifts, the gate and the strength, from the days' misses in the window (the design's items 4, 5 and 7).
 * A shift is its weekday's average miss less the average over all the days. F is the sum over weekdays of its days
 * times its shift squared, over 6; over the sum over days of the day's miss less its weekday's average, squared, over
 * the days less 7. The gate is open when every weekday has its least days and the chance of that F is small enough.
 */
export function gateOf(days: readonly DayMiss[], numbers: WeekNumbers = WEEK): Gate {
  const n = [0, 0, 0, 0, 0, 0, 0]
  const sum = [0, 0, 0, 0, 0, 0, 0]
  for (const d of days) {
    n[d.weekday]++
    sum[d.weekday] += d.miss
  }
  const total = days.length
  if (n.some((k) => k < numbers.minDays) || total <= 7) return { open: false, f: null, chance: null, shift: NONE }
  const mean = sum.map((s, w) => s / n[w])
  const grand = sum.reduce((a, b) => a + b, 0) / total
  const offset = mean.map((m) => m - grand)
  const between = offset.reduce((a, o, w) => a + n[w] * o * o, 0) / 6
  let inside = 0
  for (const d of days) inside += (d.miss - mean[d.weekday]) ** 2
  inside /= total - 7
  if (!(inside > 0)) return { open: false, f: null, chance: null, shift: NONE }
  const f = between / inside
  const chance = fChance(f, 6, total - 7)
  const open = chance <= numbers.chance
  const strength = Math.max(0, 1 - numbers.shrink / f)
  return { open, f, chance, shift: open ? offset.map((o) => strength * o) : NONE }
}

export interface WeekState {
  /** The gate, from the record before the day. */
  open: boolean
  /** Open today and on each day of the hold before. */
  held: boolean
  /** Whether the week ahead is written by this way today: held (item 8). */
  inUse: boolean
  /** The shift for each weekday (0 Sunday to 6 Saturday) at each check-in, in points; the same at each check-in; nothing where the gate is closed. */
  shift: readonly (readonly number[])[]
}

/** The way's state from the gate of the day and whether it is held: in use exactly when held. */
export const stateFrom = (gate: Gate, held: boolean): WeekState => ({ open: gate.open, held, inUse: held, shift: gate.shift.map((s) => BLOCKS.map(() => s)) })

// ---- The way's ranges and its rows (written 2026-11-21, after the ranges' criteria were frozen). ----
//
// The range of a row the way writes, as each of the four takes its own (horizonBand, src/forecast.ts): around its
// point, the 20th to 80th band of the way's own misses at the row's distance over the 28 days before the day of
// writing; today's rows and tomorrow's take its misses a day out. Each miss is as the way would have made that forecast
// then: the reading, less the same-block way's forecast from the record as it stood that many days before the day, less
// the shift the gate gave on that record for the day's weekday (nothing where the gate was closed on that record). With
// fewer than five misses at a distance, the band of its misses a day out.

/** A row as the app stores it: the point, the low and the high, each rounded and kept to 0 to 100. */
export interface WeekRow {
  point: number
  lo: number
  hi: number
}

/** As the app stores a number of a row (src/forecast.ts's clamp). */
const clamp = (v: number): number => Math.max(0, Math.min(100, Math.round(v)))
const rowKey = (day: string, block: string, horizon: number): string => `${day}|${block}|${horizon}`

/** The record as it stood at the end of a day, without copying it: what src/forecast.ts's visibleBefore gives a forecast. */
function upTo(values: ReadonlyMap<string, number>, lastDay: string): ReadonlyMap<string, number> {
  return { get: (k: string) => (k.slice(0, 10) <= lastDay ? values.get(k) : undefined) } as unknown as ReadonlyMap<string, number>
}

/**
 * Everything the way works out from the record for one day of writing, each past forecast made once: its state (the
 * gate, the hold, the shifts) and the rows it writes when it is in use. This is the form the app would call.
 */
export function levelWeekdayReader(values: ReadonlyMap<string, number>, numbers: WeekNumbers = WEEK) {
  const missMemo = new Map<string, number | null>()
  /** The same-block way's miss on a past slot as it would have been forecast that many days out: the reading less the forecast. */
  const flatMiss = (day: string, block: (typeof BLOCKS)[number], ahead: number): number | null => {
    const key = `${day}|${block}|${ahead}`
    if (!missMemo.has(key)) {
      const actual = values.get(slotKey(day, block))
      const p = actual === undefined ? null : predict('sameBlock', ahead <= 1 ? values : upTo(values, addDays(day, -ahead)), day, block)
      missMemo.set(key, actual === undefined || p === null ? null : actual - p)
    }
    return missMemo.get(key) as number | null
  }
  const dayMemo = new Map<string, DayMiss | null>()
  const missOfDay = (day: string): DayMiss | null => {
    if (!dayMemo.has(day)) {
      const got = BLOCKS.map((b) => flatMiss(day, b, 1)).filter((m): m is number => m !== null)
      dayMemo.set(day, got.length ? { weekday: weekdayOf(day), miss: got.reduce((a, b) => a + b, 0) / got.length } : null)
    }
    return dayMemo.get(day) as DayMiss | null
  }
  const gateMemo = new Map<string, Gate>()
  /** The gate for forecasts written on a day, from the days before it within the window. */
  const gate = (day: string): Gate => {
    let g = gateMemo.get(day)
    if (!g) {
      const days: DayMiss[] = []
      for (let back = numbers.window; back >= 1; back--) {
        const m = missOfDay(addDays(day, -back))
        if (m) days.push(m)
      }
      g = gateOf(days, numbers)
      gateMemo.set(day, g)
    }
    return g
  }
  const state = (today: string): WeekState => {
    const g = gate(today)
    let held = g.open
    for (let back = 1; held && back <= numbers.hold; back++) held = gate(addDays(today, -back)).open
    return stateFrom(g, held)
  }
  /** The way's misses at a distance over the 28 days before a day of writing, each as it would have been made then. */
  const misses = (today: string, ahead: number): number[] => {
    const out: number[] = []
    for (let back = 1; back <= BACKTEST_DAYS; back++) {
      const x = addDays(today, -back)
      const shift = gate(addDays(x, -(Math.max(1, ahead) - 1))).shift[weekdayOf(x)]
      for (const b of BLOCKS) {
        const e = flatMiss(x, b, ahead)
        if (e !== null) out.push(e - shift)
      }
    }
    return out
  }
  const band = (today: string, ahead: number): { lo: number; hi: number } => {
    if (ahead > 1) {
      const far = misses(today, ahead)
      if (far.length >= 5) return errorBand(far)
    }
    return errorBand(misses(today, 1))
  }
  /** The rows the way writes on a day: every slot of today and the next seven days the same-block way can forecast; null where the way is not in use. */
  const rows = (today: string): Map<string, WeekRow> | null => {
    const s = state(today)
    if (!s.inUse) return null
    const logged = loggedDays(values)
    const maxHorizon = logged >= MIN_DAYS_WEEK ? HORIZON : logged >= MIN_DAYS_TODAY ? 0 : -1
    const out = new Map<string, WeekRow>()
    for (let h = 0; h <= maxHorizon; h++) {
      const day = addDays(today, h)
      const b = band(today, Math.max(1, h))
      BLOCKS.forEach((block, i) => {
        const flat = predict('sameBlock', values, day, block)
        if (flat === null) return
        const p = flat + s.shift[weekdayOf(day)][i]
        out.set(rowKey(day, block, h), { point: clamp(p), lo: clamp(p + b.lo), hi: clamp(p + b.hi) })
      })
    }
    return out
  }
  /**
   * The way's forecast for a slot as the challenger reads its base: the same-block way's forecast, plus the day's
   * weekday's shift where the way was in use on the day the forecast was written: the day itself for a day before
   * today, and today for a day from today on. Where the way was not in use it is the same-block way's, number for
   * number (the points' criterion 6 was simulated on exactly this rule, stress/weekSim.ts's predictOf).
   */
  const forecast = (today: string, day: string, block: (typeof BLOCKS)[number]): number | null => {
    const flat = predict('sameBlock', values, day, block)
    if (flat === null) return null
    const s = state(day < today ? day : today)
    return s.inUse ? flat + s.shift[weekdayOf(day)][BLOCKS.indexOf(block)] : flat
  }
  return { state, rows, gate, forecast }
}

/** The rows the way writes on a day, from the record alone; null where it is not in use. */
export function levelWeekdayRows(values: ReadonlyMap<string, number>, today: string, numbers: WeekNumbers = WEEK): Map<string, WeekRow> | null {
  return levelWeekdayReader(values, numbers).rows(today)
}

/** The way's reader for one run of the writer, asked once a run. */
export type LevelWeekdayReader = ReturnType<typeof levelWeekdayReader>

/** A row the pick wrote, taking the way's point, low and high and the way's name, and keeping what the four would have written. */
const asTheWays = (f: Forecast, w: WeekRow): Forecast => ({ ...f, model: LEVEL_WEEKDAY, point: w.point, lo: w.lo, hi: w.hi, four: { model: f.model, point: f.point, lo: f.lo, hi: f.hi } })

/**
 * The rows written on a day the way is in use (Stage A, 2026-11-21): the pick's rows as `forecastsDue` gave them, so its
 * skips hold as they are. Each of them the way has a row for takes the way's point, low and high and the way's name,
 * keeps its what-if and its key order, and keeps what the four would have written (`four`). A slot the way has a row for
 * and the pick has none, under the same skips (a row at that distance already there, a slot already logged), is the
 * way's own row, with no `four`; a slot the pick has a row for and the way has none stays the pick's. Only rows being
 * added: a row already written is never touched.
 */
export function rowsWithTheWay(due: readonly Forecast[], way: ReadonlyMap<string, WeekRow>, existing: readonly Forecast[], logged: ReadonlyMap<string, number>, today: string, whatIfOf: (day: string, block: Block) => number | null): Forecast[] {
  const have = new Set(existing.map((f) => rowKey(f.day, f.block, f.horizon)))
  const pick = new Map(due.map((f) => [rowKey(f.day, f.block, f.horizon), f]))
  const out: Forecast[] = []
  for (let h = 0; h <= HORIZON; h++) {
    const day = addDays(today, h)
    for (const block of BLOCKS) {
      const key = rowKey(day, block, h)
      const f = pick.get(key)
      const w = way.get(key)
      if (f) out.push(w ? asTheWays(f, w) : f)
      else if (w && !have.has(key) && !logged.has(slotKey(day, block))) out.push({ day, block, horizon: h, madeOn: today, model: LEVEL_WEEKDAY, point: w.point, lo: w.lo, hi: w.hi, whatIf: whatIfOf(day, block) })
    }
  }
  return out
}
