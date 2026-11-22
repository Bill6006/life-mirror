import { BLOCKS, type Block } from '../src/blocks'
import type { Answers, ReadingId } from '../src/readings'
import { pointsFor, readingOutOf100 } from '../src/score'
import { scenarioById } from './scenarios'
import { gauss, stream } from './stats'
import { BASE, INGREDIENT_READINGS, World, type PersonParams } from './world'

// Stage C, the week ahead from what is known about each day: its simulated worlds (designed 2026-11-21 at the owner's
// word; design and simulation only). A simulated person is stress/world.ts's, as in every earlier simulation, kept here
// reading by reading, with four things laid over them that a forecast may know ahead: a rhythm by weekday (in every
// reading or in some), a scheduled kind of day that can change, weather that may or may not drive the day, with the
// forecasts as they were issued, and kinds of structured event the record holds as a yes or no for a day, which may or
// may not keep to weekdays and may or may not move the check-in after them. Offline only: nothing in src/ imports this folder.

export const DAYS = 180
/** Days drawn: the record and the days a forecast written on its last day reaches. */
const DRAWN = DAYS + 16
const YEAR = 365
export const READINGS: readonly ReadingId[] = INGREDIENT_READINGS
export const MEASURES = ['sun', 'rain', 'high'] as const
/** The farthest a weather forecast is issued for. */
export const AHEAD = 7

const PEOPLE: Record<'base' | 'persistent' | 'sparse', PersonParams> = {
  base: BASE,
  persistent: scenarioById('rebound-null').params,
  sparse: scenarioById('missing-null').params,
}

const RHYTHM = [0.2, -0.4, -0.2, 0, 0, 0.2, 0.4] // Sunday first: Phase 8's rhythm, in steps
/** The day (0 first) a world's schedule or rhythm changes from. */
export const TURN = 90
/** A weather measure's own spread from day to day, how much of a day carries into the next, and how well a forecast follows what came, by days ahead (0 to 7). */
const SPREAD = [2.5, 3, 4]
const CARRY = 0.5
const SKILL = [0.95, 0.9, 0.85, 0.75, 0.65, 0.5, 0.4, 0.3]

/** A kind of structured event: a yes or no the record holds for a day, logged at one of the day's check-ins. */
export interface CEvent {
  /** The check-in it is logged at: 0 morning, 1 afternoon, 2 evening. It is known only where that check-in was answered. */
  block: number
  /** The chance it happens on a day, by weekday (Sunday first). */
  rate: readonly number[]
  /** Steps it lays on every reading at the check-in after the one it is logged at, when it happens; absent: it moves nothing. */
  effect?: number
  /** A marker, not a cause: the logit of its chance rises by this for each step the check-in it is logged at runs under the person's usual. */
  marker?: number
}

export interface CWorld {
  id: string
  people: 'base' | 'persistent' | 'sparse'
  /** Steps laid on a reading at a check-in of a day, in its good direction, known ahead by the calendar or the schedule. */
  steps?: (d: number, weekday: number, block: Block, reading: ReadingId) => number
  /** The scheduled kind of a day (a number naming it), as the week's template had it then; absent: every day the same kind. */
  kind?: (d: number, weekday: number) => number
  /** Which arrangement of the laid steps holds on a day; one where absent. */
  phase?: (d: number) => number
  /** Steps an hour of sunshine above its usual adds to every reading at every check-in; absent: sunshine drives nothing. */
  sun?: number
  /** How well a forecast follows what came, by days ahead; the usual skill where absent. */
  skill?: readonly number[]
  /** A season in the sunshine itself, in hours, that drives nothing. */
  sunSeason?: (d: number) => number
  /** The kinds of structured event the record holds. */
  events?: readonly CEvent[]
}

const every = (f: (d: number, weekday: number) => number): CWorld['steps'] => (d, weekday) => f(d, weekday)
const energyAndMood = (times: number): CWorld['steps'] => (_d, weekday, _b, reading) => (reading === 'energy' || reading === 'mood' ? times * RHYTHM[weekday] : 0)
const season = (d: number): number => Math.sin((2 * Math.PI * d) / 180)
/** Office days at 0.4 step under, Saturday 0.3 and Sunday 0.2 over; the office days are Tuesday and Thursday, and from the turn Monday and Wednesday. */
const officeDay = (d: number, weekday: number): boolean => (d < TURN ? weekday === 2 || weekday === 4 : weekday === 1 || weekday === 3)
const kindSteps = (d: number, weekday: number): number => (officeDay(d, weekday) ? -0.4 : weekday === 6 ? 0.3 : weekday === 0 ? 0.2 : 0)
/** An event's rates: one weekday high and the rest low; the same every weekday; the weekend high; and following rhythm's steps, more where they run low (1) or high (-1). */
const one = (weekday: number, high: number, low: number): number[] => Array.from({ length: 7 }, (_, w) => (w === weekday ? high : low))
const flat = (p: number): number[] => Array.from({ length: 7 }, () => p)
const WEEKEND = [0.6, 0.1, 0.1, 0.1, 0.1, 0.1, 0.6]
const along = (sign: number): number[] => RHYTHM.map((s) => 0.3 - sign * 0.5 * s)
/** Eight days in ten on Wednesdays, one in ten otherwise: two in ten over the week. */
const WEDNESDAY = one(3, 0.8, 0.1)
const eveningOnly = (f: (weekday: number) => number): CWorld['steps'] => (_d, weekday, b) => (b === 'evening' ? f(weekday) : 0)
/** Sixteen kinds of event that move nothing: four that keep to weekdays, four that do not, and eight markers logged where the check-in runs low, four of them keeping to weekdays. */
const USELESS: readonly CEvent[] = [
  { block: 1, rate: along(1) },
  { block: 2, rate: one(6, 0.7, 0.1) },
  { block: 0, rate: WEEKEND },
  { block: 1, rate: WEDNESDAY },
  { block: 0, rate: flat(0.05) },
  { block: 1, rate: flat(0.2) },
  { block: 2, rate: flat(0.5) },
  { block: 2, rate: flat(0.8) },
  { block: 0, rate: flat(0.1), marker: 3 },
  { block: 1, rate: flat(0.3), marker: 3 },
  { block: 2, rate: flat(0.5), marker: 3 },
  { block: 1, rate: flat(0.2), marker: 3 },
  { block: 1, rate: along(1), marker: 3 },
  { block: 2, rate: one(6, 0.7, 0.1), marker: 3 },
  { block: 0, rate: WEEKEND, marker: 3 },
  { block: 1, rate: along(-1), marker: 3 },
]

export const C_WORLDS: readonly CWorld[] = [
  // Stage B's eight, drawn exactly as its simulations drew them (the season's sunshine carries the season too, and drives nothing).
  { id: 'plain', people: 'base' },
  { id: 'streaks', people: 'persistent' },
  { id: 'sparse', people: 'sparse' },
  { id: 'season', people: 'base', steps: every((d) => season(d)), sunSeason: (d) => 2 * season(d) },
  { id: 'rhythm', people: 'base', steps: every((_d, w) => RHYTHM[w]) },
  { id: 'rhythm-half', people: 'base', steps: every((_d, w) => RHYTHM[w] / 2) },
  { id: 'rhythm-one', people: 'base', steps: (_d, w, b) => (b === 'evening' ? RHYTHM[w] : 0) },
  { id: 'rhythm-turn', people: 'base', steps: every((d, w) => (d < TURN ? RHYTHM[w] : RHYTHM[(w + 3) % 7])), phase: (d) => (d < TURN ? 0 : 1) },
  // Weekday in two of the six readings: at one and a half times rhythm's steps (the score moves as in rhythm-half), and at three times (as in rhythm).
  { id: 'two', people: 'base', steps: energyAndMood(1.5) },
  { id: 'two-strong', people: 'base', steps: energyAndMood(3) },
  // Sunshine drives the day: fully, at half that, and fully with forecasts that are worthless from two days out.
  { id: 'sun', people: 'base', sun: 0.1 },
  { id: 'sun-weak', people: 'base', sun: 0.05 },
  { id: 'sun-bad', people: 'base', sun: 0.1, skill: [0.9, 0.5, 0, 0, 0, 0, 0, 0] },
  // The schedule drives the weekdays, and changes at the turn with the app knowing; and rhythm exactly, with the schedule of its two strongest weekdays changing at the turn and nothing else.
  { id: 'kind-move', people: 'base', steps: every(kindSteps), kind: (d, w) => (officeDay(d, w) ? 1 : 0), phase: (d) => (d < TURN ? 0 : 1) },
  { id: 'kind-idle', people: 'base', steps: every((_d, w) => RHYTHM[w]), kind: (d, w) => (d >= TURN && (w === 1 || w === 6) ? 1 : 0) },
  // Both at once: the weekday in two readings and the sunshine.
  { id: 'all', people: 'base', steps: energyAndMood(1.5), sun: 0.1 },
  // A structured event logged at the afternoon check-in, mostly on Wednesdays, that lowers the evening after it by 0.6 step; and a weaker one, less tied to its weekday.
  { id: 'event', people: 'base', events: [{ block: 1, rate: WEDNESDAY, effect: -0.6 }] },
  { id: 'event-weak', people: 'base', events: [{ block: 1, rate: one(3, 0.6, 0.15), effect: -0.2 }] },
  // The same event over rhythm's weekdays; and rhythm with an event that keeps to Wednesdays and moves nothing.
  { id: 'event-rhythm', people: 'base', steps: every((_d, w) => RHYTHM[w]), events: [{ block: 1, rate: WEDNESDAY, effect: -0.6 }] },
  { id: 'event-idle', people: 'base', steps: every((_d, w) => RHYTHM[w]), events: [{ block: 1, rate: WEDNESDAY }] },
  // The same effect from an event that keeps to no weekday.
  { id: 'event-flat', people: 'base', events: [{ block: 1, rate: flat(0.2), effect: -0.6 }] },
  // A marker and no cause: logged at the evening check-in, far more on Saturdays, and far more when that evening runs low, in people whose state carries over strongly.
  { id: 'event-told', people: 'persistent', events: [{ block: 2, rate: one(6, 0.7, 0.1), marker: 6 }] },
  // The event's effect is real and so is its weekday, but each weekday's evening is otherwise lifted by exactly what the event takes from it on average: no weekday's evening differs.
  { id: 'event-masked', people: 'base', steps: eveningOnly((w) => 0.6 * (WEDNESDAY[w] - 0.2)), events: [{ block: 1, rate: WEDNESDAY, effect: -0.6 }] },
  // Rhythm at the evening check-in alone, and sixteen kinds of event that move nothing.
  { id: 'event-many', people: 'base', steps: eveningOnly((w) => RHYTHM[w]), events: USELESS },
]

export const cWorldById = (id: string): CWorld => {
  const w = C_WORLDS.find((x) => x.id === id)
  if (!w) throw new Error(`no Stage C world ${id}`)
  return w
}

export interface CRecord {
  weekday: number[]
  dayName: string[]
  /** The score out of 100 at each check-in, as the app computes it; null where not answered. */
  score: (number | null)[][]
  /** Each reading's own points out of 100 at each check-in, higher better; null where not answered. */
  points: (number[] | null)[][]
  /** Each weather measure as it was on each day. */
  observed: number[][]
  /** Each measure's forecast issued on a day for the day that many days on (0 to 7). */
  issued: number[][][]
  /** The sunshine's own turn on each day, in hours, its season and usual level taken out: what drives the day where sunshine does. */
  sunTurn: number[]
  /** The scheduled kind of each day as the template had it on that day. */
  kind: number[]
  /** The kind the template, as it stood on a day, gives each weekday. */
  kindNow: (asOf: number, weekday: number) => number
  /** Each kind of event on each day: yes, no, or null where the check-in it is logged at was not answered. */
  events: (boolean | null)[][]
  /** The check-in each kind of event is logged at. */
  eventBlock: number[]
}

/** Which of a world's layers are laid: the steps known ahead, the sunshine's effect, and the events' effects. */
export interface Layers {
  steps: boolean
  sun: boolean
  events: boolean
}

const logistic = (x: number): number => 1 / (1 + Math.exp(-x))
const logit = (p: number): number => Math.log(p / (1 - p))

/** One simulated person's record in one world. The weather is drawn from streams of its own, so it is the same whichever layers are laid. */
export function cRecordOf(world: CWorld, seed: number, layers: Layers = { steps: true, sun: true, events: true }): CRecord {
  // A year is drawn, as every earlier simulation of these people drew it, so that the same seed is the same person.
  const w = new World(seed, PEOPLE[world.people], new Map(), YEAR)
  const weekday = Array.from({ length: DRAWN }, (_, d) => w.context(d).weekday)
  const dayName = Array.from({ length: DRAWN }, (_, d) => w.dayString(d))
  // The weather: each measure a usual level, a season where the world has one, and a turn of its own that carries from day to day.
  const observed: number[][] = []
  const issued: number[][][] = []
  let sunTurn: number[] = []
  MEASURES.forEach((name, m) => {
    const rng = stream(seed, `stageC|${name}`)
    const turn: number[] = []
    let a = SPREAD[m] * gauss(rng)
    for (let d = 0; d < DRAWN; d++) {
      turn.push(a)
      a = CARRY * a + Math.sqrt(1 - CARRY * CARRY) * SPREAD[m] * gauss(rng)
    }
    const usual = (d: number): number => 5 + (m === 0 && world.sunSeason ? world.sunSeason(d) : 0)
    observed.push(turn.map((v, d) => usual(d) + v))
    const skill = world.skill ?? SKILL
    const noise = stream(seed, `stageC|${name}|issued`)
    issued.push(
      Array.from({ length: DRAWN }, (_, t) =>
        Array.from({ length: AHEAD + 1 }, (_, h) => {
          const z = gauss(noise)
          const d = t + h
          return d < DRAWN ? usual(d) + skill[h] * turn[d] + Math.sqrt(1 - skill[h] * skill[h]) * SPREAD[m] * z : usual(d)
        }),
      ),
    )
    if (m === 0) sunTurn = turn
  })
  for (let d = 0; d < DRAWN; d++) {
    for (const b of BLOCKS) {
      for (const r of READINGS) {
        const steps = (layers.steps && world.steps ? world.steps(d, weekday[d], b, r) : 0) + (layers.sun && world.sun ? world.sun * sunTurn[d] : 0)
        if (steps !== 0) w.add(r, d, b, steps)
      }
    }
  }
  // The events: each kind drawn from a stream of its own, so it happens on the same days whichever layers are laid.
  const happened: boolean[][] = (world.events ?? []).map((e, k) => {
    const rng = stream(seed, `stageC|event|${k}`)
    const draws = Array.from({ length: DRAWN }, () => rng())
    const state = (d: number): number => READINGS.reduce((s, r) => s + w.goodness(r, d, BLOCKS[e.block]), 0) / READINGS.length
    let usual = 0
    if (e.marker) {
      for (let d = 0; d < DRAWN; d++) usual += state(d)
      usual /= DRAWN
    }
    const yes = draws.map((u, d) => u < (e.marker ? logistic(logit(e.rate[weekday[d]]) - e.marker * (state(d) - usual)) : e.rate[weekday[d]]))
    if (layers.events && e.effect) {
      yes.forEach((on, d) => {
        if (!on) return
        const [day, block] = e.block < 2 ? [d, e.block + 1] : [d + 1, 0]
        if (day < DRAWN) for (const r of READINGS) w.add(r, day, BLOCKS[block], e.effect as number)
      })
    }
    return yes
  })
  const score: (number | null)[][] = []
  const points: (number[] | null)[][] = []
  for (let d = 0; d < DRAWN; d++) {
    const s: (number | null)[] = []
    const p: (number[] | null)[] = []
    for (const b of BLOCKS) {
      const c = w.checkin(d, b)
      const value = c ? (readingOutOf100(c.answers as Answers, READINGS)?.value ?? null) : null
      s.push(value)
      p.push(c && value !== null ? READINGS.map((r) => pointsFor(r, (c.answers as Answers)[r] as 1 | 2 | 3 | 4 | 5)) : null)
    }
    score.push(s)
    points.push(p)
  }
  const kindOn = (d: number, wd: number): number => (world.kind ? world.kind(d, wd) : 0)
  const eventBlock = (world.events ?? []).map((e) => e.block)
  const events = happened.map((yes, k) => yes.map((on, d) => (score[d][eventBlock[k]] !== null ? on : null)))
  return { weekday, dayName, score, points, observed, issued, sunTurn, kind: weekday.map((wd, d) => kindOn(d, wd)), kindNow: (asOf, wd) => kindOn(asOf, wd), events, eventBlock }
}

/**
 * What a forecast told the truth is told, in the score's points: the laid steps' effect by arrangement, weekday and
 * check-in (an event's effect with them, as its average over the days of a weekday: the told forecast knows how often
 * it happens on a weekday and what it does, never whether it will), and the points an hour of sunshine is worth. Read from the first tuning people: each answered check-in's
 * score with a layer less the same person's score without it (the same draws, so the difference is the layer's own).
 */
export interface CTruth {
  steps: number[][][]
  sun: number
  skill: readonly number[]
}

export const TRUTH_SEEDS = 300

export function cTruthOf(world: CWorld, people = TRUTH_SEEDS): CTruth {
  const phases = world.phase ? 2 : 1
  const sum = Array.from({ length: phases }, () => Array.from({ length: 7 }, () => BLOCKS.map(() => 0)))
  const n = Array.from({ length: phases }, () => Array.from({ length: 7 }, () => BLOCKS.map(() => 0)))
  let sxy = 0
  let sxx = 0
  const moving = Boolean(world.steps) || (world.events ?? []).some((e) => e.effect)
  if (moving || world.sun) {
    for (let seed = 1; seed <= people; seed++) {
      const bare = cRecordOf(world, seed, { steps: false, sun: false, events: false })
      const stepped = moving ? cRecordOf(world, seed, { steps: true, sun: false, events: true }) : bare
      const full = world.sun ? cRecordOf(world, seed, { steps: true, sun: true, events: true }) : stepped
      for (let d = 0; d < DAYS; d++) {
        const p = world.phase ? world.phase(d) : 0
        for (let i = 0; i < BLOCKS.length; i++) {
          const a = bare.score[d][i]
          const b = stepped.score[d][i]
          const c = full.score[d][i]
          if (a === null || b === null || c === null) continue
          sum[p][bare.weekday[d]][i] += b - a
          n[p][bare.weekday[d]][i]++
          sxy += (c - b) * bare.sunTurn[d]
          sxx += bare.sunTurn[d] * bare.sunTurn[d]
        }
      }
    }
  }
  return { steps: sum.map((byWeekday, p) => byWeekday.map((byBlock, w) => byBlock.map((s, i) => (n[p][w][i] ? s / n[p][w][i] : 0)))), sun: world.sun && sxx ? sxy / sxx : 0, skill: world.skill ?? SKILL }
}
