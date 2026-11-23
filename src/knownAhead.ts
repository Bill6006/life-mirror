import { addDays, BLOCKS, daysBetween, type Block } from './blocks'
import { churchOf } from './church'
import { weekdayOf } from './counted/occasions'
import { askedOf, type CheckIn, type DayContext, type Forecast } from './db'
import { BACKTEST_DAYS, errorBand, HORIZON, LEVEL_READINGS, LEVEL_WEATHER, LEVEL_WEEKDAY, LEVEL_WEEKDAY_WEATHER, loggedDays, MIN_DAYS_TODAY, MIN_DAYS_WEEK, predict, type WayId } from './forecast'
import { fChance, gateOf, WEEK, type DayMiss, type Gate, type WeekNumbers, type WeekRow } from './levelWeekday'
import { slotKey } from './observe'
import { INGREDIENT_IDS, pointsFor, readingOf } from './score'
import { askedReadings, type Depth, type WeekShape, type Weekday } from './settings'
import type { Position } from './readings'

// Stage C of the week ahead, the forecast from what is known about each day (designed 2026-11-21 at the owner's word;
// its criteria were frozen that day before its method was written, and its verdict passed on unread seeds:
// stress/RESULTS-15.md). Moved here from stress/stageC.ts number for number in Stage C-A (2026-11-22), behind a switch
// that is off: while it is off, nothing of Stage C runs in the app (docs/week-ahead-known.md).
//
// Its forecast for a check-in is the same-block way's, plus up to two shifts, each learnt from the same-block way's own
// misses a day ahead, each behind its own test and a hold of 28 days:
//   a weekday shift: the level-plus-weekday way's own where the score's test of its seven weekdays is held, and
//     otherwise the sum of the shifts of the readings whose own tests are held, each at its share of the score;
//   a changed schedule leaves a weekday's earlier days out of every weekday test;
//   a weather shift, which reads only the forecast issued on the day of writing, at the trust its distance has earned.
// On a day none of these is in use, nothing here writes a row, and the four's pick writes the day exactly as before.
// Recurring events were simulated as a fourth term and left out: nothing of them is built here. Everything is read from
// the record before the day of writing.

/**
 * On, at the owner's own word of 2026-11-23, in a commit of its own that changes nothing else of the app's code (Stage
 * C-A built it switched off, 2026-11-22). Switching it off again is the same one line; while it is false the writer never
 * asks Stage C, and the level-plus-weekday way's own switch governs again.
 */
export const KNOWN_AHEAD_ON = true

let forTests: boolean | null = null
/** For tests: the switch as given, or the code's own again with null. */
export function setKnownAheadForTests(on: boolean | null): void {
  forTests = on
}
/** Whether the app runs Stage C. */
export const knownAheadOn = (): boolean => forTests ?? KNOWN_AHEAD_ON

/** The method's numbers, set on the tuning seeds inside the limits the frozen criteria state. A chance of nothing leaves its term out. */
export interface StageCNumbers {
  /** A reading's own weekday test: the most its chance may be, and its shrinking. */
  readingChance: number
  readingShrink: number
  /** Whether a weekday's earlier days are left out once its scheduled kind has changed, and the least weekdays a test may then run on. */
  reset: boolean
  minWeekdays: number
  /** A weather measure's test: the most its chance may be, its shrinking, the days it looks back over, the days its level is taken over, and the least pairs before a distance's trust counts. */
  weatherChance: number
  weatherShrink: number
  weatherWindow: number
  weatherLevel: number
  minPairs: number
  /** An event's three tests: the most each one's chance may be, and the shrinking. Recurring events are not built: the chance stays nothing. */
  eventChance: number
  eventShrink: number
}

/**
 * As the tuning on seeds 1 to 1000 set them (2026-11-22): of the settings where every criterion read there would pass,
 * the one with the most room at its tightest criterion. The recurring events' term is left out (a chance of nothing):
 * on the tuning seeds it met one of its own two criteria and failed the other at every chance tried. With every chance
 * at nothing and the schedule rule off, Stage C is the Stage B system, number for number. Written here before the
 * verdict's seeds were read.
 */
export const STAGE_C: StageCNumbers = { readingChance: 0.000005, readingShrink: 2, reset: true, minWeekdays: 5, weatherChance: 0.0001, weatherShrink: 2, weatherWindow: 180, weatherLevel: 28, minPairs: 28, eventChance: 0, eventShrink: 2 }

/** The weather measures, in the order the method takes them: the day's sunshine, its rain and its high. */
export const MEASURES = ['sunshine', 'rain', 'high'] as const
export type Measure = (typeof MEASURES)[number]

const NONE = [0, 0, 0, 0, 0, 0, 0]
const CLOSED: Gate = { open: false, f: null, chance: null, shift: NONE }
const clamp = (v: number): number => Math.max(0, Math.min(100, Math.round(v)))
const rowKey = (day: string, block: string, horizon: number): string => `${day}|${block}|${horizon}`

/**
 * Stage B's test of the weekdays together (item 4), over the weekdays that have their least days. With all seven it is
 * Stage B's own function, number for number. With fewer it is the same F over those weekdays alone, needing at least
 * the stated number of them; a weekday left out takes no shift.
 */
export function gateOver(days: readonly DayMiss[], numbers: WeekNumbers, minWeekdays: number): Gate {
  const n = [0, 0, 0, 0, 0, 0, 0]
  const sum = [0, 0, 0, 0, 0, 0, 0]
  for (const d of days) {
    n[d.weekday]++
    sum[d.weekday] += d.miss
  }
  const has = n.map((k) => k >= numbers.minDays)
  const weekdays = has.filter(Boolean).length
  if (weekdays === 7) return gateOf(days, numbers)
  if (weekdays < Math.max(2, minWeekdays)) return CLOSED
  const used = days.filter((d) => has[d.weekday])
  const total = used.length
  if (total <= weekdays) return CLOSED
  const mean = sum.map((s, w) => (has[w] ? s / n[w] : 0))
  const grand = used.reduce((a, d) => a + d.miss, 0) / total
  const offset = mean.map((m, w) => (has[w] ? m - grand : 0))
  const between = offset.reduce((a, o, w) => a + (has[w] ? n[w] * o * o : 0), 0) / (weekdays - 1)
  let inside = 0
  for (const d of used) inside += (d.miss - mean[d.weekday]) ** 2
  inside /= total - weekdays
  if (!(inside > 0)) return CLOSED
  const f = between / inside
  const chance = fChance(f, weekdays - 1, total - weekdays)
  const open = chance <= numbers.chance
  const strength = Math.max(0, 1 - numbers.shrink / f)
  return { open, f, chance, shift: open ? offset.map((o) => strength * o) : NONE }
}

/** A slope with its test: from the sums of squares and products about the averages, on the stated degrees of freedom. */
export function slopeTest(sxx: number, sxy: number, syy: number, df: number): { slope: number; t2: number; chance: number } | null {
  if (df < 1 || !(sxx > 0)) return null
  const slope = sxy / sxx
  const left = syy - slope * sxy
  if (!(left > 0)) return null
  const t2 = (slope * slope * sxx) / (left / df)
  return { slope, t2, chance: fChance(t2, 1, df) }
}

/** How far forecasts at a distance are trusted (item 6): the slope, through nothing, of what came on what was said, each less its level; kept between 0 and 1, and nothing until the least pairs exist. */
export function trustOf(sff: number, sfo: number, pairs: number, minPairs: number): number {
  return pairs >= minPairs && sff > 0 ? Math.max(0, Math.min(1, sfo / sff)) : 0
}

/** Whether a test has stood open on a day and on each of the days before it that a hold asks for (`days` in all, the day itself counted). */
export function heldOpen(open: (day: string) => boolean, day: string, days: number): boolean {
  for (let back = 0; back < days; back++) if (!open(addDays(day, -back))) return false
  return true
}

/**
 * What Stage C's reader is given, from the app's own record (the handoff's A3). Days are named as the record names them;
 * the reader reads nothing on or after the day of writing but the forecast issued that day and the template as it stands.
 */
export interface KnownAheadRecord {
  /** The score by slot: the same values the four are given. */
  values: ReadonlyMap<string, number>
  /** Each of the readings behind the score by slot: its points at every check-in that has a score. */
  readings: readonly ReadonlyMap<string, number>[]
  /** A reading's share of the score at a check-in of a block. */
  share(reading: number, block: Block): number
  /** Whether a past day's scheduled kind is the kind the week's template, as it stands on a day of writing, gives that day's weekday. */
  sameKind(day: string, asOf: string): boolean
  /** A weather measure (`MEASURES`) as it was on a day; null where not known. */
  observed(measure: number, day: string): number | null
  /** A measure's forecast issued on a day for the day that many days on (0 to 7); null where none was kept. */
  issued(measure: number, issuedOn: string, ahead: number): number | null
}

/** Which of Stage C's terms write the day's rows. */
export interface KnownAheadState {
  inUse: boolean
  /** The score's own weekday test is held (the level-plus-weekday way, schedule-aware). */
  score: boolean
  /** Each reading's own weekday test is held and used (never while the score's is). */
  readings: boolean[]
  /** Each weather measure's term is in use: one at most. */
  weather: boolean[]
}

interface WeatherDay {
  open: boolean
  chance: number
  /** The slope at its strength, in points for one of the measure's own units. */
  effect: number
  /** The measure's level on the day of writing; null with too few days. */
  level: number | null
  /** How far a forecast is trusted at each distance, 0 to 7. */
  trust: number[]
}
interface Day {
  score: Gate
  readings: Gate[]
  weather: WeatherDay[]
}
interface Active {
  score: boolean
  readings: boolean[]
  /** The one weather measure used, or -1. */
  measure: number
}
const NO_WEATHER: WeatherDay = { open: false, chance: 1, effect: 0, level: null, trust: [0, 0, 0, 0, 0, 0, 0, 0] }

/** The record as it stood at the end of a day, without copying it: what src/forecast.ts's visibleBefore gives a forecast. */
function upTo(values: ReadonlyMap<string, number>, lastDay: string): ReadonlyMap<string, number> {
  return { get: (k: string) => (k.slice(0, 10) <= lastDay ? values.get(k) : undefined) } as unknown as ReadonlyMap<string, number>
}

/**
 * Everything Stage C works out from the record for one day of writing, each past forecast made once and each day's tests
 * once: its state, the rows it writes when it is in use, and its forecast for a slot as the challenger reads its base.
 * This is the form the app calls, once a run.
 */
export function knownAheadReader(record: KnownAheadRecord, today: string, numbers: StageCNumbers = STAGE_C) {
  if (numbers.eventChance > 0) throw new Error('the recurring events’ term is not built')
  const HOLD = WEEK.hold
  const WINDOW = WEEK.window
  const readingNumbers: WeekNumbers = { ...WEEK, chance: numbers.readingChance, shrink: numbers.readingShrink }
  const withReadings = numbers.readingChance > 0
  const withWeather = numbers.weatherChance > 0
  const { values } = record
  /** The record before the day of writing: the same-block way's forecasts for the day's rows are made from it. */
  const prior = upTo(values, addDays(today, -1))
  const memo = <T>(f: (day: string) => T): ((day: string) => T) => {
    const kept = new Map<string, T>()
    return (day) => {
      if (!kept.has(day)) kept.set(day, f(day))
      return kept.get(day) as T
    }
  }

  const missMemo = new Map<string, number | null>()
  /** The same-block way's miss on a past slot as it would have been forecast that many days out: the reading less the forecast. */
  const flatMiss = (day: string, block: Block, ahead: number): number | null => {
    const key = `${day}|${block}|${ahead}`
    if (!missMemo.has(key)) {
      const actual = values.get(slotKey(day, block))
      const p = actual === undefined ? null : predict('sameBlock', ahead <= 1 ? values : upTo(values, addDays(day, -ahead)), day, block)
      missMemo.set(key, actual === undefined || p === null ? null : actual - p)
    }
    return missMemo.get(key) as number | null
  }
  /** A reading's own same-block miss a day ahead on a past slot: its points less its own forecast. */
  const readingMiss = (day: string, block: Block, r: number): number | null => {
    const series = record.readings[r]
    const actual = series.get(slotKey(day, block))
    const p = actual === undefined ? null : predict('sameBlock', series, day, block)
    return actual === undefined || p === null ? null : actual - p
  }
  const dayMean = (misses: (number | null)[], day: string): DayMiss | null => {
    const got = misses.filter((m): m is number => m !== null)
    return got.length ? { weekday: weekdayOf(day), miss: got.reduce((a, b) => a + b, 0) / got.length } : null
  }
  /** A day's miss of the same-block way, for the score and for each reading (item 3). */
  const scoreDay = memo((x) => dayMean(BLOCKS.map((b) => flatMiss(x, b, 1)), x))
  const readingDay = record.readings.map((_, r) => memo((x) => dayMean(BLOCKS.map((b) => readingMiss(x, b, r)), x)))

  /** A weekday test for forecasts written on day t (items 3 and 4): a past day counts only where its scheduled kind is the kind its weekday has now. */
  const weekdayGate = (series: (x: string) => DayMiss | null, t: string, gate: WeekNumbers): Gate => {
    const days: DayMiss[] = []
    for (let back = WINDOW; back >= 1; back--) {
      const x = addDays(t, -back)
      const m = series(x)
      if (!m) continue
      if (numbers.reset && !record.sameKind(x, t)) continue
      days.push(m)
    }
    return gateOver(days, gate, numbers.minWeekdays)
  }

  /** A weather measure's level on a day: its average over the level's days just before; null with fewer than half of them (item 6). */
  const level = MEASURES.map((_, m) =>
    memo((s): number | null => {
      let sum = 0
      let n = 0
      for (let back = numbers.weatherLevel; back >= 1; back--) {
        const v = record.observed(m, addDays(s, -back))
        if (v === null) continue
        sum += v
        n++
      }
      return n >= Math.ceil(numbers.weatherLevel / 2) ? sum / n : null
    }),
  )
  const weatherOn = (m: number, t: string): WeatherDay => {
    let n = 0
    let sx = 0
    let sy = 0
    let sxx = 0
    let sxy = 0
    let syy = 0
    for (let back = numbers.weatherWindow; back >= 1; back--) {
      const x = addDays(t, -back)
      const y = scoreDay(x)
      const was = record.observed(m, x)
      const lv = level[m](x)
      if (!y || was === null || lv === null) continue
      const a = was - lv
      n++
      sx += a
      sy += y.miss
      sxx += a * a
      sxy += a * y.miss
      syy += y.miss * y.miss
    }
    const test = n >= 3 ? slopeTest(sxx - (sx * sx) / n, sxy - (sx * sy) / n, syy - (sy * sy) / n, n - 2) : null
    if (!test || !(test.chance <= numbers.weatherChance)) return NO_WEATHER
    const trust: number[] = []
    for (let h = 0; h <= HORIZON; h++) {
      let pairs = 0
      let sff = 0
      let sfo = 0
      for (let back = numbers.weatherWindow; back >= 1; back--) {
        const d = addDays(t, -back)
        const u = addDays(d, -h)
        const lv = level[m](u)
        const said = record.issued(m, u, h)
        const came = record.observed(m, d)
        if (lv === null || said === null || came === null) continue
        pairs++
        sff += (said - lv) * (said - lv)
        sfo += (said - lv) * (came - lv)
      }
      trust.push(trustOf(sff, sfo, pairs, numbers.minPairs))
    }
    return { open: true, chance: test.chance, effect: test.slope * Math.max(0, 1 - numbers.weatherShrink / test.t2), level: level[m](t), trust }
  }

  /** Every test for forecasts written on a day, from the days before it. */
  const dayOf = memo(
    (t): Day => ({
      score: weekdayGate(scoreDay, t, WEEK),
      readings: withReadings ? readingDay.map((series) => weekdayGate(series, t, readingNumbers)) : [],
      weather: withWeather ? MEASURES.map((_, m) => weatherOn(m, t)) : [],
    }),
  )
  /** Whether a test has stood open on a day and on each of the days before it a hold needs: counted no further than it asks. */
  const openRun = (open: (d: Day) => boolean, s: string, days: number): boolean => heldOpen((x) => open(dayOf(x)), s, days)
  /** The weather's shift can be laid on a day of writing only where a forecast was issued that day and the measure's level stands. */
  const laid = (m: number, s: string): boolean => record.issued(m, s, 0) !== null && level[m](s) !== null

  /**
   * The terms that write on a day (held: open that day and on each day of the hold before), or, for a past forecast's
   * miss as it would have been made then (item 8), the terms open on that day's record. The readings' only where the
   * score's own is not; one weather measure at most, the one with the smallest chance, and only where its shift can be laid.
   */
  const activeMemo = new Map<string, Active>()
  const active = (s: string, held: boolean): Active => {
    const key = `${held ? 'h' : 'o'}${s}`
    let a = activeMemo.get(key)
    if (!a) {
      const d = dayOf(s)
      const days = held ? HOLD + 1 : 1
      const score = openRun((x) => x.score.open, s, days)
      const readings = withReadings ? record.readings.map((_, r) => !score && openRun((x) => x.readings[r].open, s, days)) : []
      let measure = -1
      if (withWeather)
        MEASURES.forEach((_, m) => {
          if (openRun((x) => x.weather[m].open, s, days) && laid(m, s) && (measure < 0 || d.weather[m].chance < d.weather[measure].chance)) measure = m
        })
      a = { score, readings, measure }
      activeMemo.set(key, a)
    }
    return a
  }
  const anyOf = (a: Active): boolean => a.score || a.readings.some(Boolean) || a.measure >= 0

  /** What is added to the same-block way's forecast for a slot, as written on day s (item 2). */
  const shift = (s: string, held: boolean, day: string, block: Block): number => {
    const a = active(s, held)
    const d = dayOf(s)
    const w = weekdayOf(day)
    let v = 0
    if (a.score) v += d.score.shift[w]
    else
      a.readings.forEach((on, r) => {
        if (on) v += record.share(r, block) * d.readings[r].shift[w]
      })
    if (a.measure >= 0) {
      const wm = d.weather[a.measure]
      const h = daysBetween(s, day)
      const said = h >= 0 && h <= HORIZON ? record.issued(a.measure, s, h) : null
      if (said !== null && wm.level !== null) v += wm.effect * wm.trust[h] * (said - wm.level)
    }
    return v
  }

  const state = (): KnownAheadState => {
    const a = active(today, true)
    return { inUse: anyOf(a), score: a.score, readings: record.readings.map((_, r) => Boolean(a.readings[r])), weather: MEASURES.map((_, m) => a.measure === m) }
  }
  /** The system's misses at a distance over the 28 days before a day of writing, each as it would have been made then (item 8). */
  const misses = (t: string, ahead: number): number[] => {
    const out: number[] = []
    for (let back = 1; back <= BACKTEST_DAYS; back++) {
      const x = addDays(t, -back)
      const written = addDays(x, -(Math.max(1, ahead) - 1))
      for (const block of BLOCKS) {
        const e = flatMiss(x, block, ahead)
        if (e !== null) out.push(e - shift(written, false, x, block))
      }
    }
    return out
  }
  const band = (t: string, ahead: number): { lo: number; hi: number } => {
    if (ahead > 1) {
      const far = misses(t, ahead)
      if (far.length >= 5) return errorBand(far)
    }
    return errorBand(misses(t, 1))
  }
  /** The rows Stage C writes on the day of writing: every slot of it and the next seven days the same-block way can forecast; null where it is not in use. */
  const rows = (): Map<string, WeekRow> | null => {
    if (!anyOf(active(today, true))) return null
    const logged = loggedDays(values)
    const maxHorizon = logged >= MIN_DAYS_WEEK ? HORIZON : logged >= MIN_DAYS_TODAY ? 0 : -1
    const out = new Map<string, WeekRow>()
    for (let h = 0; h <= maxHorizon; h++) {
      const day = addDays(today, h)
      const b = band(today, Math.max(1, h))
      for (const block of BLOCKS) {
        const flat = predict('sameBlock', prior, day, block)
        if (flat === null) continue
        const p = flat + shift(today, true, day, block)
        out.set(rowKey(day, block, h), { point: clamp(p), lo: clamp(p + b.lo), hi: clamp(p + b.hi) })
      }
    }
    return out
  }
  /**
   * Stage C's forecast for a slot as the challenger reads its base (A6): the same-block way's forecast, plus what Stage C
   * added on the day the forecast was written: the day itself for a day before the day of writing, and the day of
   * writing for a day from it on; the same-block way's, number for number, where Stage C was not in use that day.
   */
  const forecast = (day: string, block: Block): number | null => {
    const flat = predict('sameBlock', prior, day, block)
    if (flat === null) return null
    const s = day < today ? day : today
    return anyOf(active(s, true)) ? flat + shift(s, true, day, block) : flat
  }
  /** For tests: the tests open on the day of writing, before any hold. */
  const opens = (): { score: boolean; readings: boolean[]; weather: boolean[] } => {
    const d = dayOf(today)
    return { score: d.score.open, readings: record.readings.map((_, r) => Boolean(d.readings[r]?.open)), weather: MEASURES.map((_, m) => Boolean(d.weather[m]?.open)) }
  }
  /** For tests: what the terms open on the record of a day of writing add to a slot, as a past forecast's miss is taken for the ranges (item 8). */
  const shiftOn = (writtenOn: string, day: string, block: Block): number => shift(writtenOn, false, day, block)
  return { state, rows, forecast, opens, shiftOn }
}

/** The ways a row Stage C writes names (section 4): the level-plus-weekday way where the score's own test is held and no weather, and its three own. */
export const KNOWN_AHEAD_WAYS: readonly WayId[] = [LEVEL_WEEKDAY, LEVEL_READINGS, LEVEL_WEATHER, LEVEL_WEEKDAY_WEATHER]

/** Stage C's reader for one run of the writer, asked once a run. */
export type KnownAheadReader = ReturnType<typeof knownAheadReader>

/** The way a day's rows name, by the terms in use that day (the handoff's section 4); null where Stage C is not in use. */
export function wayOfState(s: KnownAheadState): WayId | null {
  if (!s.inUse) return null
  const weekday = s.score || s.readings.some(Boolean)
  const weather = s.weather.some(Boolean)
  if (weekday && weather) return LEVEL_WEEKDAY_WEATHER
  if (weather) return LEVEL_WEATHER
  return s.score ? LEVEL_WEEKDAY : LEVEL_READINGS
}

/** The weather measure a day's rows use, by its name; null where the weather's term is not in use. */
export function measureOfState(s: KnownAheadState): Measure | null {
  const m = s.weather.indexOf(true)
  return m < 0 ? null : MEASURES[m]
}

// ---- What the reader is given, from the app's own record (A3) ---------------------------------------------------------

/** A day's scheduled kind, part by part: office day, the church day and which church, study night, daycare with a pickup. A part a row does not hold is absent. */
export interface DayKind {
  office?: boolean
  churchDay?: boolean
  church?: 'sabbath' | 'third' | 'none'
  study?: boolean
  daycare?: boolean
}

/**
 * A past day's scheduled kind, as its own row froze it: never `atOffice` nor anything marked by hand. A day inside a
 * trip takes the church, the study night and the pickup from what the trip kept aside (`awayFromHome.held`); its office
 * day stays on the row. The church is held only by a row made under the church schedule (`schedule`).
 */
export function kindOfDay(ctx: DayContext): DayKind {
  const held = ctx.awayFromHome?.held
  const churchDay = held ? held.churchDay : ctx.churchDay
  const church = held ? held.church : ctx.church
  const study = held ? held.studyNight : ctx.studyNight
  const pickup = held ? held.pickupTime : ctx.pickupTime
  return {
    ...(typeof ctx.officeDay === 'boolean' ? { office: ctx.officeDay } : {}),
    ...(typeof churchDay === 'boolean' ? { churchDay } : {}),
    ...(ctx.schedule === 1 ? { church: church ?? 'none' } : {}),
    ...(typeof study === 'boolean' ? { study } : {}),
    ...(pickup !== undefined ? { daycare: pickup !== null } : {}),
  }
}

/** The kind the week's template gives a weekday, as a new day is made from it (db.ts's contextFromWeek). */
export function kindOfWeekday(week: WeekShape, weekday: Weekday): Required<DayKind> {
  return {
    office: week.officeDays[weekday],
    churchDay: week.churchDay === weekday,
    church: churchOf(week, weekday).church ?? 'none',
    study: week.studyNights[weekday],
    daycare: (week.daycareDays[weekday] ? week.pickupTime : null) !== null,
  }
}

/** Whether a past day's kind is the template's for its weekday: every part the row holds the same. */
export function sameKindAs(past: DayKind, now: Required<DayKind>): boolean {
  return (Object.keys(past) as (keyof DayKind)[]).every((k) => past[k] === now[k])
}

/** What the record holds of the app's own days, for Stage C's reader. */
export interface KnownAheadSources {
  /** The score by slot: the four's own values. */
  values: ReadonlyMap<string, number>
  /** The check-ins those values were taken from: a trip's days already left out. */
  checkins: readonly CheckIn[]
  /** The days' records: a trip's days already left out. */
  days: readonly DayContext[]
  /** The week's template as it stands on the day of writing. */
  week: WeekShape
  depth: Depth
  retired: readonly string[]
  /** The learned weights in force, or null where the readings weigh alike. */
  weights: Readonly<Record<string, number>> | null
}

/**
 * The record Stage C's reader is given (A3): the score by slot; each of the six readings behind it by slot, at every
 * check-in with a score; a reading's share of the score, its weight among the six a block asks at the current depth, as
 * `readingOutOf100` weighs them; each past day's scheduled kind against the template as it stands on the day of writing
 * (the app keeps no earlier template); the weather as it was, each day's own; and the forecasts as issued, from the
 * record of the day of issue (Stage C0's `weatherIssued`).
 */
export function knownAheadRecordOf(src: KnownAheadSources): KnownAheadRecord {
  const readings = INGREDIENT_IDS.map(() => new Map<string, number>())
  for (const c of src.checkins) {
    if (!readingOf(c)) continue
    const asked = askedOf(c)
    INGREDIENT_IDS.forEach((id, r) => {
      const a = c.answers[id]
      if (asked.includes(id) && a !== undefined) readings[r].set(slotKey(c.day, c.block), pointsFor(id, a as Position))
    })
  }
  const weight = (id: string): number => (src.weights ? (src.weights[id] ?? 1) : 1)
  const shares = new Map(
    BLOCKS.map((block) => {
      const asked = askedReadings(block, src.depth, src.retired).filter((id) => INGREDIENT_IDS.includes(id))
      const total = asked.reduce((s, id) => s + weight(id), 0)
      return [block, INGREDIENT_IDS.map((id) => (asked.includes(id) && total > 0 ? weight(id) / total : 0))] as const
    }),
  )
  const byDay = new Map(src.days.map((d) => [d.day, d]))
  const now = ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map((w) => kindOfWeekday(src.week, w))
  const weatherOf = (m: number, w: { sun: number; rain: number; high: number }): number => (m === 0 ? w.sun : m === 1 ? w.rain : w.high)
  return {
    values: src.values,
    readings,
    share: (r, block) => shares.get(block)?.[r] ?? 0,
    sameKind: (day) => {
      const ctx = byDay.get(day)
      return ctx ? sameKindAs(kindOfDay(ctx), now[weekdayOf(day)]) : true
    },
    observed: (m, day) => {
      const w = byDay.get(day)?.weather
      return w ? weatherOf(m, w) : null
    },
    issued: (m, issuedOn, ahead) => {
      const kept = byDay.get(issuedOn)?.weatherIssued
      const f = kept?.days.find((d) => d.day === addDays(issuedOn, ahead))
      return f ? weatherOf(m, f) : null
    },
  }
}

// ---- The rows the writer adds on a day Stage C is in use (A4, A5, A7) ---------------------------------------------------

/** What Stage C gives the writer for a day it is in use: its way's name, its rows, the Stage B way's rows by its own test where that way is in use, and the weather measure used. */
export interface KnownAheadDay {
  way: WayId
  rows: ReadonlyMap<string, WeekRow>
  stageB: ReadonlyMap<string, WeekRow> | null
  weather: Measure | null
}

/** What a Stage C row keeps beside its own numbers: the Stage B way's row for the slot, and the weather measure used. */
function keptOf(day: KnownAheadDay, key: string): Pick<Forecast, 'stageB' | 'weather'> {
  const b = day.stageB?.get(key)
  return { ...(b ? { stageB: { point: b.point, lo: b.lo, hi: b.hi } } : {}), ...(day.weather ? { weather: day.weather } : {}) }
}

/**
 * The rows written on a day Stage C is in use (Stage C-A, 2026-11-22), as Stage A's `rowsWithTheWay` writes the
 * level-plus-weekday way's: the pick's rows as `forecastsDue` gave them, so its skips hold as they are. Each of them
 * Stage C has a row for takes its point, low and high and the day's way, keeps its what-if and its key order, and keeps
 * what the four would have written (`four`), what the Stage B way would have (`stageB`) and the weather measure used. A
 * slot Stage C has a row for and the pick has none, under the same skips, is Stage C's own row, with no `four`; a slot
 * the pick has a row for and Stage C has none stays the pick's. A day inside a planned trip has no row at all (the
 * design's item 5). Only rows being added: a row already written is never touched.
 */
export function rowsWithKnownAhead(due: readonly Forecast[], ahead: KnownAheadDay, existing: readonly Forecast[], logged: ReadonlyMap<string, number>, today: string, whatIfOf: (day: string, block: Block) => number | null, onTrip: (day: string) => boolean): Forecast[] {
  const have = new Set(existing.map((f) => rowKey(f.day, f.block, f.horizon)))
  const pick = new Map(due.map((f) => [rowKey(f.day, f.block, f.horizon), f]))
  const out: Forecast[] = []
  for (let h = 0; h <= HORIZON; h++) {
    const day = addDays(today, h)
    if (onTrip(day)) continue
    for (const block of BLOCKS) {
      const key = rowKey(day, block, h)
      const f = pick.get(key)
      const w = ahead.rows.get(key)
      if (f) out.push(w ? { ...f, model: ahead.way, point: w.point, lo: w.lo, hi: w.hi, four: { model: f.model, point: f.point, lo: f.lo, hi: f.hi }, ...keptOf(ahead, key) } : f)
      else if (w && !have.has(key) && !logged.has(slotKey(day, block))) out.push({ day, block, horizon: h, madeOn: today, model: ahead.way, point: w.point, lo: w.lo, hi: w.hi, whatIf: whatIfOf(day, block), ...keptOf(ahead, key) })
    }
  }
  return out
}
