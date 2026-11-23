import { BLOCKS } from '../src/blocks'
import { BACKTEST_DAYS, errorBand, HORIZON } from '../src/forecast'
import { gateOver, slopeTest, type StageCNumbers } from '../src/knownAhead'
import { gateOf, WEEK, type DayMiss, type Gate, type RangeInputs, type WeekNumbers, type WeekRow } from './levelWeekday'

// Stage C, the week ahead from what is known about each day (designed 2026-11-21 at the owner's word; its criteria were
// frozen that day at 23:30, before this method was written, and the private repository holds the design and the
// criteria). Its numbers, its test over the weekdays that have their days and its slope test moved into the app number
// for number in Stage C-A (2026-11-22): src/knownAhead.ts, behind a switch that is off, with the method in the form the
// app calls. What stays here is the simulation's alone: the method kept day by day, and the recurring events' term,
// which was simulated and left out. The app never calls anything of this file.
//
// Its forecast for a check-in is the same-block way's, plus a weekday shift, a weather shift and an event shift, each
// learnt from the same-block way's own misses behind a strict test and a hold of 28 days, as Stage B's shift is:
//   the weekday shift is Stage B's where the score's own test is held, and otherwise the sum of the shifts of the
//     readings whose own tests are held, each at its share of the score;
//   a changed schedule leaves a weekday's earlier days out of every weekday test;
//   the weather shift reads only a forecast as it was issued on the day of writing, at the trust its distance has earned;
//   the event shift reads only how often a kind of event has happened on each weekday, and lands on the check-in after it.
// On a day none of these is in use, nothing here writes a row. Everything is read from before the day of writing.

export { gateOver, slopeTest, STAGE_C, type StageCNumbers } from '../src/knownAhead'

/** What the simulation gives the day-by-day tracker, each past forecast made once. Days are numbered from the record's first. */
export interface StageCInputs extends RangeInputs {
  /** How many readings make the score, and each one's share of it. */
  readings: number
  share(reading: number): number
  /** A reading's own same-block miss a day ahead on a past slot: its points less its forecast; null where either is missing. */
  readingMiss(day: number, block: number, reading: number): number | null
  /** The scheduled kind of a past day, as its own row froze it. */
  kindOf(day: number): number
  /** The kind the template, as it stands on a day, gives a weekday. */
  kindNow(asOf: number, weekday: number): number
  /** How many weather measures there are; a measure as it was on a past day; and its forecast issued on a day for the day that many days on (0 to 7). */
  measures: number
  observed(measure: number, day: number): number | null
  issued(measure: number, issuedOn: number, ahead: number): number | null
  /** How many kinds of structured event the record holds; the check-in a kind is logged at (0 morning); and whether it happened on a past day: yes, no, or null where it is not known. */
  events: number
  eventBlock(kind: number): number
  eventOn(kind: number, day: number): boolean | null
}

/** Which of Stage C's terms write the day's rows. */
export interface StageCState {
  inUse: boolean
  /** The score's own weekday test is held (the Stage B way). */
  score: boolean
  /** Each reading's own weekday test is held and used (never while the score's is). */
  readings: boolean[]
  /** Each weather measure's term is in use. */
  weather: boolean[]
  /** Each kind of event's term is in use. */
  events: boolean[]
}

export interface StageCTracker {
  stateOn(day: number): StageCState
  rowsOn(day: number): Map<string, WeekRow>
  /** What the system adds to the same-block way's forecast for a slot, as written on a day; nothing where it was not in use that day. */
  shiftOn(writtenOn: number, day: number, block: number): number
}

const NONE = [0, 0, 0, 0, 0, 0, 0]
const clamp = (v: number): number => Math.max(0, Math.min(100, Math.round(v)))
const memo = <T>(f: (x: number) => T): ((x: number) => T) => {
  const kept = new Map<number, T>()
  return (x) => {
    if (!kept.has(x)) kept.set(x, f(x))
    return kept.get(x) as T
  }
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
interface EventDay {
  open: boolean
  /** The chance of "it matters". */
  chance: number
  /** The shift for the following check-in by the weekday of the event's own day. */
  shift: number[]
}
interface Day {
  score: Gate
  readings: Gate[]
  weather: WeatherDay[]
  events: EventDay[]
}
interface Active {
  score: boolean
  readings: boolean[]
  /** The one weather measure used, or -1. */
  measure: number
  /** For each following check-in (morning, afternoon, evening), the one kind of event used, or -1. */
  kinds: number[]
}
const NO_WEATHER: WeatherDay = { open: false, chance: 1, effect: 0, level: null, trust: [0, 0, 0, 0, 0, 0, 0, 0] }
const NO_EVENT: EventDay = { open: false, chance: 1, shift: NONE }

/** The method kept day by day for the simulation: each day's tests are worked out once, from the days before it alone. */
export function stageCTrackerOf(numbers: StageCNumbers, inputs: StageCInputs): StageCTracker {
  const HOLD = WEEK.hold
  const WINDOW = WEEK.window
  const readingNumbers: WeekNumbers = { ...WEEK, chance: numbers.readingChance, shrink: numbers.readingShrink }
  const eventNumbers: WeekNumbers = { ...WEEK, chance: numbers.eventChance, shrink: numbers.eventShrink }
  const withReadings = numbers.readingChance > 0
  const withWeather = numbers.weatherChance > 0
  const withEvents = numbers.eventChance > 0

  const dayMean = (misses: (number | null)[], weekday: number): DayMiss | null => {
    const got = misses.filter((m): m is number => m !== null)
    return got.length ? { weekday, miss: got.reduce((a, b) => a + b, 0) / got.length } : null
  }
  /** A day's miss of the same-block way, for the score and for each reading (item 3). */
  const scoreDay = memo((x) => dayMean(BLOCKS.map((_, i) => inputs.flatMiss(x, i, 1)), inputs.weekday(x)))
  const readingDay = Array.from({ length: inputs.readings }, (_, r) => memo((x) => dayMean(BLOCKS.map((_, i) => inputs.readingMiss(x, i, r)), inputs.weekday(x))))

  /** A weekday test for forecasts written on day t (items 3 and 4): a past day counts only where its scheduled kind is the kind its weekday has now. */
  const weekdayGate = (series: (x: number) => DayMiss | null, t: number, gate: WeekNumbers): Gate => {
    const days: DayMiss[] = []
    for (let x = Math.max(0, t - WINDOW); x < t; x++) {
      const m = series(x)
      if (!m) continue
      if (numbers.reset && inputs.kindOf(x) !== inputs.kindNow(t, m.weekday)) continue
      days.push(m)
    }
    return gateOver(days, gate, numbers.minWeekdays)
  }

  /** A weather measure's level on a day: its average over the level's days just before; null with fewer than half of them (item 6). */
  const level = Array.from({ length: inputs.measures }, (_, m) =>
    memo((s): number | null => {
      let sum = 0
      let n = 0
      for (let d = Math.max(0, s - numbers.weatherLevel); d < s; d++) {
        const v = inputs.observed(m, d)
        if (v === null) continue
        sum += v
        n++
      }
      return n >= Math.ceil(numbers.weatherLevel / 2) ? sum / n : null
    }),
  )
  const weatherOn = (m: number, t: number): WeatherDay => {
    let n = 0
    let sx = 0
    let sy = 0
    let sxx = 0
    let sxy = 0
    let syy = 0
    for (let x = Math.max(0, t - numbers.weatherWindow); x < t; x++) {
      const y = scoreDay(x)
      const was = inputs.observed(m, x)
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
      for (let d = Math.max(0, t - numbers.weatherWindow); d < t; d++) {
        const u = d - h
        if (u < 0) continue
        const lv = level[m](u)
        const said = inputs.issued(m, u, h)
        const came = inputs.observed(m, d)
        if (lv === null || said === null || came === null) continue
        pairs++
        sff += (said - lv) * (said - lv)
        sfo += (said - lv) * (came - lv)
      }
      trust.push(pairs >= numbers.minPairs && sff > 0 ? Math.max(0, Math.min(1, sfo / sff)) : 0)
    }
    return { open: true, chance: test.chance, effect: test.slope * Math.max(0, 1 - numbers.weatherShrink / test.t2), level: level[m](t), trust }
  }

  /** The contrast at a check-in of a day (item 7): the same-block way's miss there, less its average over the day's other answered check-ins. */
  const contrast = BLOCKS.map((_, target) =>
    memo((day): number | null => {
      const at = inputs.flatMiss(day, target, 1)
      if (at === null) return null
      let sum = 0
      let n = 0
      for (let j = 0; j < BLOCKS.length; j++) {
        if (j === target) continue
        const v = inputs.flatMiss(day, j, 1)
        if (v === null) continue
        sum += v
        n++
      }
      return n ? at - sum / n : null
    }),
  )
  const eventOn = (k: number, t: number): EventDay => {
    const own = inputs.eventBlock(k)
    const target = (own + 1) % BLOCKS.length
    /** The last event day whose following check-in lies before the day of writing. */
    const last = own < BLOCKS.length - 1 ? t - 1 : t - 2
    const follows = (d: number): number | null => contrast[target](own < BLOCKS.length - 1 ? d : d + 1)
    // It recurs: the rates by weekday, tested together as Stage B tests the weekdays.
    const known: DayMiss[] = []
    const n = [0, 0, 0, 0, 0, 0, 0]
    const yes = [0, 0, 0, 0, 0, 0, 0]
    for (let d = Math.max(0, t - WINDOW); d <= last; d++) {
      const x = inputs.eventOn(k, d)
      if (x === null) continue
      const w = inputs.weekday(d)
      known.push({ weekday: w, miss: x ? 1 : 0 })
      n[w]++
      if (x) yes[w]++
    }
    const recurs = gateOf(known, eventNumbers)
    if (!recurs.open) return NO_EVENT
    const rate = yes.map((y, w) => y / n[w])
    // It matters: the contrast on the yes or no, each from its own weekday's average.
    const g = Array.from({ length: 7 }, () => ({ n: 0, sx: 0, sy: 0, sxx: 0, sxy: 0, syy: 0 }))
    // Its rhythm shows: the contrast on the weekday's rate, over every day whose contrast is known.
    let m = 0
    let rx = 0
    let ry = 0
    let rxx = 0
    let rxy = 0
    let ryy = 0
    for (let d = Math.max(0, t - WINDOW); d <= last; d++) {
      const y = follows(d)
      if (y === null) continue
      const w = inputs.weekday(d)
      m++
      rx += rate[w]
      ry += y
      rxx += rate[w] * rate[w]
      rxy += rate[w] * y
      ryy += y * y
      const x = inputs.eventOn(k, d)
      if (x === null) continue
      const v = x ? 1 : 0
      const c = g[w]
      c.n++
      c.sx += v
      c.sy += y
      c.sxx += v * v
      c.sxy += v * y
      c.syy += y * y
    }
    let pairs = 0
    let groups = 0
    let sxx = 0
    let sxy = 0
    let syy = 0
    for (const c of g) {
      if (!c.n) continue
      pairs += c.n
      groups++
      sxx += c.sxx - (c.sx * c.sx) / c.n
      sxy += c.sxy - (c.sx * c.sy) / c.n
      syy += c.syy - (c.sy * c.sy) / c.n
    }
    const matters = slopeTest(sxx, sxy, syy, pairs - groups - 1)
    const shows = m >= 3 ? slopeTest(rxx - (rx * rx) / m, rxy - (rx * ry) / m, ryy - (ry * ry) / m, m - 2) : null
    if (!matters || !shows) return NO_EVENT
    if (!(matters.chance <= numbers.eventChance) || !(shows.chance <= numbers.eventChance) || !(matters.slope * shows.slope > 0)) return NO_EVENT
    const size = matters.slope * Math.max(0, 1 - numbers.eventShrink / matters.t2)
    return { open: true, chance: matters.chance, shift: recurs.shift.map((s) => size * s) }
  }

  /** Every test for forecasts written on a day, from the days before it; null before the record begins. */
  const dayOf = memo((t): Day | null =>
    t < 0
      ? null
      : {
          score: weekdayGate(scoreDay, t, WEEK),
          readings: withReadings ? readingDay.map((series) => weekdayGate(series, t, readingNumbers)) : [],
          weather: withWeather ? Array.from({ length: inputs.measures }, (_, m) => weatherOn(m, t)) : [],
          events: withEvents ? Array.from({ length: inputs.events }, (_, k) => eventOn(k, t)) : [],
        },
  )
  /** How many days running a test has stood open, the day itself counted: the hold asks for one more than its days. */
  const running = (open: (d: Day) => boolean): ((t: number) => number) => {
    const run: (t: number) => number = memo((t) => {
      const d = dayOf(t)
      return d && open(d) ? run(t - 1) + 1 : 0
    })
    return run
  }
  const scoreRun = running((d) => d.score.open)
  const readingRun = Array.from({ length: withReadings ? inputs.readings : 0 }, (_, r) => running((d) => d.readings[r].open))
  const weatherRun = Array.from({ length: withWeather ? inputs.measures : 0 }, (_, m) => running((d) => d.weather[m].open))
  const eventRun = Array.from({ length: withEvents ? inputs.events : 0 }, (_, k) => running((d) => d.events[k].open))

  /**
   * The terms that write on a day (held: open that day and on each day of the hold before), or, for a past forecast's
   * miss as it would have been made then (item 8), the terms open on that day's record. The readings' only where the
   * score's own is not; one weather measure at most, the one with the smallest chance; one kind of event at most for
   * each following check-in, the one whose "it matters" chance is smallest.
   */
  const activeMemo = new Map<string, Active | null>()
  const active = (s: number, held: boolean): Active | null => {
    const key = `${held ? 'h' : 'o'}${s}`
    if (!activeMemo.has(key)) {
      const d = dayOf(s)
      let a: Active | null = null
      if (d) {
        const on = (run: (t: number) => number): boolean => run(s) >= (held ? HOLD + 1 : 1)
        const score = on(scoreRun)
        const readings = readingRun.map((run) => !score && on(run))
        let measure = -1
        weatherRun.forEach((run, m) => {
          if (on(run) && (measure < 0 || d.weather[m].chance < d.weather[measure].chance)) measure = m
        })
        const kinds = BLOCKS.map(() => -1)
        eventRun.forEach((run, k) => {
          if (!on(run)) return
          const target = (inputs.eventBlock(k) + 1) % BLOCKS.length
          if (kinds[target] < 0 || d.events[k].chance < d.events[kinds[target]].chance) kinds[target] = k
        })
        a = { score, readings, measure, kinds }
      }
      activeMemo.set(key, a)
    }
    return activeMemo.get(key) as Active | null
  }
  const anyOf = (a: Active | null): boolean => a !== null && (a.score || a.readings.some(Boolean) || a.measure >= 0 || a.kinds.some((k) => k >= 0))

  /** What is added to the same-block way's forecast for a slot, as written on day s (item 2). */
  const shift = (s: number, held: boolean, day: number, block: number): number => {
    const a = active(s, held)
    const d = dayOf(s)
    if (!a || !d) return 0
    const w = inputs.weekday(day)
    let v = 0
    if (a.score) v += d.score.shift[w]
    else
      a.readings.forEach((on, r) => {
        if (on) v += inputs.share(r) * d.readings[r].shift[w]
      })
    if (a.measure >= 0) {
      const wm = d.weather[a.measure]
      const h = day - s
      const said = h >= 0 && h <= HORIZON ? inputs.issued(a.measure, s, h) : null
      if (said !== null && wm.level !== null) v += wm.effect * wm.trust[h] * (said - wm.level)
    }
    a.kinds.forEach((k, target) => {
      if (k < 0) return
      // The event's own day: the day before for a morning that follows an evening, the same day otherwise.
      const own = target === 0 ? day - 1 : day
      if (own < 0) return
      const size = d.events[k].shift[inputs.weekday(own)]
      // While the score's weekday shift carries the day's average, the event's is laid about it: two thirds on the following check-in, a third off each other one.
      if (a.score) v += block === target ? (2 * size) / 3 : -size / 3
      else if (block === target) v += size
    })
    return v
  }

  const stateOn = (t: number): StageCState => {
    const a = active(t, true)
    return {
      inUse: anyOf(a),
      score: a ? a.score : false,
      readings: Array.from({ length: inputs.readings }, (_, r) => (a ? Boolean(a.readings[r]) : false)),
      weather: Array.from({ length: inputs.measures }, (_, m) => (a ? a.measure === m : false)),
      events: Array.from({ length: inputs.events }, (_, k) => (a ? a.kinds.includes(k) : false)),
    }
  }
  /** The system's misses at a distance over the 28 days before a day of writing, each as it would have been made then (item 8). */
  const misses = (t: number, ahead: number): number[] => {
    const out: number[] = []
    for (let back = 1; back <= BACKTEST_DAYS; back++) {
      const x = t - back
      if (x < 0) continue
      const written = x - (Math.max(1, ahead) - 1)
      for (let i = 0; i < BLOCKS.length; i++) {
        const e = inputs.flatMiss(x, i, ahead)
        if (e !== null) out.push(e - shift(written, false, x, i))
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
      const out = new Map<string, WeekRow>()
      if (!anyOf(active(t, true))) return out
      for (let h = 0; h <= HORIZON; h++) {
        const d = t + h
        const b = band(t, Math.max(1, h))
        BLOCKS.forEach((block, i) => {
          const flat = inputs.flatForecast(t, d, i)
          if (flat === null) return
          const p = flat + shift(t, true, d, i)
          out.set(`${inputs.dayName(d)}|${block}|${h}`, { point: clamp(p), lo: clamp(p + b.lo), hi: clamp(p + b.hi) })
        })
      }
      return out
    },
    shiftOn: (writtenOn, day, block) => (anyOf(active(writtenOn, true)) ? shift(writtenOn, true, day, block) : 0),
  }
}
