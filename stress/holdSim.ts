import { eveningPoints, likeForLike } from '../src/associations'
import { comesBefore, EVENING_READINGS, resampledInterval } from '../src/beforeDays'
import type { Block } from '../src/blocks'
import { seedOf, standings, WORTH_POINTS, type Compared } from '../src/counted/compare'
import type { CheckIn } from '../src/db'
import type { Answers, ReadingId } from '../src/readings'
import { scenarioById } from './scenarios'
import { BASE, INGREDIENT_READINGS, World, type PersonParams } from './world'

// The steady pattern hold's simulation (the forecast follow-ups, Batch 2, item 6; its criteria were frozen on
// 2026-11-20, before any of this was written; the plan holds them, and its results file will name their hash). A
// simulated person from world.ts, the app's own sixteen pairs of "What comes before your days" (`comesBefore`: their
// comparison, their family and their interval rule) worked out for every day from the record as it stood that day, and
// each pair's runs of days at a steady pattern kept, so the judge can read the hold at every N. In a useless world the
// person's evenings are another simulated person's, so no evening reading carries anything about the next morning.
// Offline only: nothing in src/ imports this folder.

/** The record is 180 days long, built from a person a year long as Phase 8's people were. */
export const DAYS = 180
const YEAR = 365
/** Day 15, the first day a pair is read as shown (0-based). */
export const FIRST_SHOWN = 14
export const BORROW_OFFSET = 5_000_000
/** The longest hold the criteria read: 60 days, as frozen anew at the owner's word on 2026-11-20 (the first criteria stopped at 30). */
export const MAX_N = 60

type People = 'base' | 'persistent' | 'sparse'

export interface HoldWorld {
  id: string
  kind: 'useless' | 'useful' | 'reported'
  people: People
  /** Whose evenings the record holds: another person's of this kind, or null for the person's own. */
  lender: People | null
  /** A shift over each of the six readings at every check-in of a day, in steps in its good direction. */
  shift?: (d: number, weekday: number) => number
  /** An evening whose stress answer sits at its top two phrases lowers each of the six readings the next morning by this many steps. */
  effect?: number
}

const RHYTHM = [0.2, -0.4, -0.2, 0, 0, 0.2, 0.4] // Sunday first: Monday -0.4, Tuesday -0.2, Friday +0.2, Saturday +0.4, Sunday +0.2
const season = (d: number): number => Math.sin((2 * Math.PI * d) / 180)

export const HOLD_WORLDS: readonly HoldWorld[] = [
  { id: 'plain', kind: 'useless', people: 'base', lender: 'base' },
  { id: 'streaks', kind: 'useless', people: 'persistent', lender: 'persistent' },
  { id: 'sparse', kind: 'useless', people: 'sparse', lender: 'sparse' },
  { id: 'rhythm', kind: 'useless', people: 'base', lender: 'base', shift: (_d, weekday) => RHYTHM[weekday] },
  { id: 'season', kind: 'useless', people: 'base', lender: 'persistent', shift: (d) => season(d) },
  { id: 'fifteen-points', kind: 'useful', people: 'base', lender: 'base', effect: 0.6 },
  { id: 'ten-points', kind: 'reported', people: 'base', lender: 'base', effect: 0.4 },
  { id: 'own', kind: 'reported', people: 'base', lender: null },
  { id: 'own-persistent', kind: 'reported', people: 'persistent', lender: null },
]

export const holdWorldById = (id: string): HoldWorld => {
  const w = HOLD_WORLDS.find((x) => x.id === id)
  if (!w) throw new Error(`no hold world ${id}`)
  return w
}

// The people, exactly as the counted foundation's and Phase 8's simulations take them (stress/countedWorlds.ts).
const PEOPLE: Record<People, PersonParams> = {
  base: BASE,
  persistent: scenarioById('rebound-null').params,
  sparse: scenarioById('missing-null').params,
}

/** The sixteen pairs in `comesBefore`'s own order: each evening reading high, then low. */
export const PAIRS: readonly { reading: ReadingId; level: 'high' | 'low'; id: string }[] = EVENING_READINGS.flatMap((reading) => (['high', 'low'] as const).map((level) => ({ reading, level, id: `before.${reading}.${level}` })))
export const STRESS_HIGH = PAIRS.findIndex((p) => p.id === 'before.stress.high')

const atLevel = (position: number, level: 'high' | 'low'): boolean => (level === 'high' ? position >= 4 : position <= 2)

/**
 * The sixteen pairs' standings on a day, as `comesBefore` gives them: the comparison, the family and the interval
 * rule. The interval is drawn only for a pair whose standing is a pattern, the only one the rule can change; every
 * fiftieth person is checked against the app's own function.
 */
export function pairStandings(checkins: readonly CheckIn[], today: string): boolean[] {
  const compared: Compared[] = []
  const points = PAIRS.map((p) => eveningPoints(checkins, today, (c) => atLevel(c.answers[p.reading] as number, p.level), (c) => c.answers[p.reading] !== undefined))
  points.forEach((pts, i) => compared.push(likeForLike(pts, { id: PAIRS[i].id, worth: WORTH_POINTS }).compared as Compared))
  return standings(compared).map((s, i) => {
    if (s.standing !== 'pattern') return false
    const p = PAIRS[i]
    const iv = resampledInterval(points[i], 600, seedOf(`${p.reading}:${p.level}:${points[i].length}`))
    return iv !== null && !(iv.lo <= 0 && iv.hi >= 0)
  })
}

/** A pair's runs of days at a steady pattern: the first day (0-based) and how many days running. */
export type Run = [start: number, days: number]

export interface HoldPerson {
  seed: number
  /** For each of the sixteen pairs, in `PAIRS` order, its runs at a steady pattern over days 1 to 179. */
  runs: Run[][]
  ms: number
}

/** One person's record: a check-in for every answered slot, the evenings another person's where the world says so. */
export function checkinsOf(world: HoldWorld, seed: number): { checkins: CheckIn[][]; dayName: string[] } {
  const person = new World(seed, PEOPLE[world.people], new Map(), YEAR)
  const lender = world.lender ? new World(seed + BORROW_OFFSET, PEOPLE[world.lender], new Map(), YEAR) : null
  const dayName = Array.from({ length: DAYS }, (_, d) => person.dayString(d))
  if (world.shift) {
    for (let d = 0; d < YEAR; d++) {
      const weekday = person.context(d).weekday
      for (const b of ['morning', 'afternoon', 'evening'] as const) for (const r of INGREDIENT_READINGS) person.add(r, d, b, world.shift(d, weekday))
    }
  }
  const evenings = Array.from({ length: DAYS }, (_, d) => (lender ?? person).checkin(d, 'evening'))
  // A real difference: an evening with stress at its top two phrases lowers every reading the next morning.
  if (world.effect) {
    for (let d = 0; d + 1 < DAYS; d++) {
      const s = evenings[d]?.answers.stress
      if (s === undefined || s < 4) continue
      for (const r of INGREDIENT_READINGS) person.add(r, d + 1, 'morning', -world.effect)
    }
  }
  const at = (day: string, b: Block): string => `${day}T${b === 'morning' ? '08' : b === 'afternoon' ? '14' : '20'}:00:00.000Z`
  const record = (day: string, b: Block, answers: Partial<Record<ReadingId, number>>): CheckIn => ({ day, block: b, asked: Object.keys(answers) as ReadingId[], answers: answers as Answers, startedAt: at(day, b), completedAt: at(day, b), updatedAt: at(day, b), activeMs: 60_000 })
  const checkins = dayName.map((day, d) => {
    const out: CheckIn[] = []
    for (const b of ['morning', 'afternoon'] as const) {
      const c = person.checkin(d, b)
      if (c) out.push(record(day, b, c.answers))
    }
    const e = evenings[d]
    if (e) out.push(record(day, 'evening', e.answers))
    return out
  })
  return { checkins, dayName }
}

/** One simulated person through one world: every day's standings of the sixteen pairs, kept as runs. */
export function runHold(world: HoldWorld, seed: number): HoldPerson {
  const t0 = performance.now()
  const { checkins, dayName } = checkinsOf(world, seed)
  const runs: Run[][] = PAIRS.map(() => [])
  const open: (number | null)[] = PAIRS.map(() => null)
  const record: CheckIn[] = []
  for (let d = 0; d < DAYS; d++) {
    // The record as it stood on day d: every check-in of the days up to it, so the day's own morning counts.
    record.push(...checkins[d])
    if (d === 0) continue
    const today = dayName[d]
    const pattern = pairStandings(record, today)
    if (seed % 50 === 0 && d % 10 === 0) {
      const own = comesBefore(record, today)
      const byId = new Map(own.map((p) => [`before.${p.reading}.${p.level}`, p.standing === 'pattern']))
      PAIRS.forEach((p, i) => {
        if (byId.get(p.id) !== pattern[i]) throw new Error(`seed ${seed}, day ${d}: ${p.id} differs from the app's comesBefore`)
      })
    }
    pattern.forEach((on, i) => {
      if (on && open[i] === null) open[i] = d
      if (!on && open[i] !== null) {
        runs[i].push([open[i] as number, d - (open[i] as number)])
        open[i] = null
      }
    })
  }
  open.forEach((s, i) => {
    if (s !== null) runs[i].push([s, DAYS - s])
  })
  return { seed, runs, ms: Math.round(performance.now() - t0) }
}

/** Whether a run is shown at a hold of n days on some day from day 15 to day 180: n days long, and held on a day from the first shown. */
export const shownAt = (run: Run, n: number): boolean => run[1] >= n && run[0] + run[1] - 1 >= FIRST_SHOWN && run[0] + n - 1 <= DAYS - 1
