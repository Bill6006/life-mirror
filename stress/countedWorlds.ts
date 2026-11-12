import { BLOCKS, type Block } from '../src/blocks'
import { compare, ratesBy, standings, WORTH_POINTS, type CellPoint, type Compared, type Point, type Stood } from '../src/counted/compare'
import type { Answers } from '../src/readings'
import { bandOf, readingOutOf100 } from '../src/score'
import { scenarioById } from './scenarios'
import { stream } from './stats'
import { BASE, INGREDIENT_READINGS, World, type PersonParams } from './world'

// The counted foundation's worlds (their criteria were frozen on 2026-11-12, before any of this was written). A
// simulated person from world.ts, a year long; things laid over that person's days from seeded streams of their own;
// and the comparison core asked the three families' questions at day 60, day 180 and day 365. Offline only: nothing
// in src/ imports this folder.

export const YEAR = 365
export const LOOKS = [60, 180, 365] as const
export type Family = 'A-day' | 'A-checkin' | 'B'
export const EVENING_THINGS = 12

/** What a thing's chance may depend on. */
interface Occasion {
  d: number
  weekday: number
  /** The check-in, for a check-in thing and an evening thing; null for a day thing. */
  block: Block | null
  /** That evening's reading out of 100, for an evening thing whose evening was answered. */
  evening: number | null
}

export interface CountedWorld {
  id: string
  kind: 'no-pattern' | 'real' | 'reported'
  people: 'base' | 'persistent' | 'sparse'
  families: readonly Family[]
  /** A shift over each of the six readings at every check-in of a day, in steps in its good direction. */
  shift?: (d: number, weekday: number) => number
  /** How a thing happens: independently with a chance at each occasion, or in runs. */
  things: { how: 'chance'; chance: (o: Occasion) => number } | { how: 'runs' }
  /** The first evening thing adds this many steps to each of the six readings the next morning. */
  effect?: number
}

const at = (chance: number): CountedWorld['things'] => ({ how: 'chance', chance: () => chance })
const ALL: readonly Family[] = ['A-day', 'A-checkin', 'B']
const RHYTHM = [0.2, -0.4, -0.2, 0, 0, 0.2, 0.4] // Sunday first: Monday -0.4, Tuesday -0.2, Friday +0.2, Saturday +0.4, Sunday +0.2
const season = (d: number): number => Math.sin((2 * Math.PI * d) / 180)
const SATURDAY = 6

export const COUNTED_WORLDS: readonly CountedWorld[] = [
  { id: 'independent-10', kind: 'no-pattern', people: 'base', families: ALL, things: at(0.1) },
  { id: 'independent-30', kind: 'no-pattern', people: 'base', families: ALL, things: at(0.3) },
  { id: 'independent-50', kind: 'no-pattern', people: 'base', families: ALL, things: at(0.5) },
  { id: 'runs', kind: 'no-pattern', people: 'base', families: ALL, things: { how: 'runs' } },
  { id: 'weekly-rhythm', kind: 'no-pattern', people: 'base', families: ALL, shift: (_d, weekday) => RHYTHM[weekday], things: at(0.3) },
  { id: 'missing-on-state', kind: 'no-pattern', people: 'sparse', families: ALL, things: at(0.3) },
  { id: 'follows-band', kind: 'no-pattern', people: 'base', families: ['B'], things: { how: 'chance', chance: (o) => (o.evening === null ? 0.3 : o.evening < 40 ? 0.5 : o.evening < 60 ? 0.3 : 0.15) } },
  { id: 'runs-persistent', kind: 'no-pattern', people: 'persistent', families: ALL, things: { how: 'runs' } },
  { id: 'season', kind: 'no-pattern', people: 'base', families: ALL, shift: (d) => season(d), things: { how: 'chance', chance: (o) => 0.3 - 0.25 * season(o.d) } },
  { id: 'weekday', kind: 'real', people: 'base', families: ['A-day'], things: { how: 'chance', chance: (o) => (o.weekday === SATURDAY ? 0.6 : 0.3) } },
  { id: 'fifteen-points', kind: 'real', people: 'base', families: ['B'], things: at(0.3), effect: 0.6 },
  { id: 'ten-points', kind: 'reported', people: 'base', families: ['B'], things: at(0.3), effect: 0.4 },
  { id: 'weekday-checkin', kind: 'reported', people: 'base', families: ['A-checkin'], things: { how: 'chance', chance: (o) => (o.weekday === SATURDAY ? 0.6 : 0.3) } },
  { id: 'evening', kind: 'reported', people: 'base', families: ['A-checkin'], things: { how: 'chance', chance: (o) => (o.block === 'evening' ? 0.4 : 0.2) } },
]

export const countedWorldById = (id: string): CountedWorld => {
  const w = COUNTED_WORLDS.find((x) => x.id === id)
  if (!w) throw new Error(`no counted world ${id}`)
  return w
}

const PEOPLE: Record<CountedWorld['people'], PersonParams> = {
  base: BASE,
  persistent: scenarioById('rebound-null').params,
  sparse: scenarioById('missing-null').params,
}

/** Runs: on at the start with chance 0.3, then at each step staying on with chance 0.7 and turning on with chance 9/70. */
const RUN_START = 0.3
const RUN_STAY = 0.7
const RUN_ON = 9 / 70

const STANDING = { tooFew: 0, noPattern: 1, lead: 2, pattern: 3 } as const
const DIRECTION = { lower: -1, none: 0, higher: 1 } as const

/** One comparison as the results keep it: occasions on each side, the difference, the chance, the standing (0 too few, 1 no pattern, 2 lead, 3 pattern), the direction (-1, 0, 1) and the chance after the family's correction. */
export type Row = [n: number, m: number, diff: number | null, p: number | null, standing: number, direction: number, adjusted: number | null]

export interface FamilyResult {
  /** How many of the family's comparisons the core tested. */
  tested: number
  rows: Row[]
}

/** What criteria 3 and 4 need from the record itself, never from the core. */
export interface BoundInputs {
  /** `weekday`: the known Saturdays and the other known days. */
  sat?: number
  other?: number
  /** A real difference: evenings with the first thing and without it (the next morning answered), the pooled spread, and the true difference summed over the evenings with it. */
  n1?: number
  n0?: number
  spread?: number
  trueSum?: number
  trueN?: number
}

export interface CountedPerson {
  seed: number
  looks: Record<string, { families: Partial<Record<Family, FamilyResult>>; bound?: BoundInputs }>
  ms: number
}

const round = (v: number | null): number | null => (v === null ? null : Number(v.toPrecision(7)))

function resultOf(family: readonly Compared[]): FamilyResult {
  const stood: Stood[] = standings(family)
  return {
    tested: stood[0]?.family ?? 0,
    rows: family.map((c, i) => [c.n, c.m, round(c.diff), round(c.p), STANDING[stood[i].standing], DIRECTION[stood[i].direction], round(stood[i].adjusted)]),
  }
}

const MORNING = 0
const EVENING = 2

/** A simulated person's year as the record holds it, with the world's things laid over it. */
export interface CountedRecord {
  weekday: number[]
  dayName: string[]
  /** What each check-in read out of 100, by day and block; null where it was not answered. */
  reading: (number | null)[][]
  /** Each morning as it would have read without the first evening thing's effect. */
  morningWithout: (number | null)[]
  shortNight: (boolean | null)[]
  dayThing: boolean[]
  checkinThing: boolean[]
  eveningThings: boolean[][]
}

/** Family B's occasions for one evening thing at one look: every answered evening whose next morning was answered. */
export function eveningPoints(rec: CountedRecord, H: number, j: number): Point[] {
  const points: Point[] = []
  for (let d = 0; d + 1 < H; d++) {
    const evening = rec.reading[d][EVENING]
    const morning = rec.reading[d + 1][MORNING]
    if (evening === null || morning === null) continue
    points.push({ day: rec.dayName[d], event: rec.eveningThings[j][d], outcome: morning, band: bandOf(evening) })
  }
  return points
}

/** One simulated person's year in one world. */
export function recordOf(spec: CountedWorld, seed: number): CountedRecord {
  const world = new World(seed, PEOPLE[spec.people], new Map(), YEAR)
  const weekday = Array.from({ length: YEAR }, (_, d) => world.context(d).weekday)
  const dayName = Array.from({ length: YEAR }, (_, d) => world.dayString(d))
  if (spec.shift) for (let d = 0; d < YEAR; d++) for (const b of BLOCKS) for (const r of INGREDIENT_READINGS) world.add(r, d, b, spec.shift(d, weekday[d]))

  // The record: which check-ins were answered, what each read out of 100, and whether the night before was short.
  const reading: (number | null)[][] = []
  const shortNight: (boolean | null)[] = []
  const read = (d: number, b: Block): number | null => {
    const c = world.checkin(d, b)
    return c ? (readingOutOf100(c.answers as Answers, INGREDIENT_READINGS)?.value ?? null) : null
  }
  for (let d = 0; d < YEAR; d++) {
    reading.push(BLOCKS.map((b) => read(d, b)))
    const morning = world.checkin(d, 'morning')
    shortNight.push(morning ? (morning.answers.sleepHours ?? 9) <= 2 : null)
  }

  // The things, each from a stream of its own, drawn for the whole year up front.
  const laid = (label: string, steps: number, occasion: (step: number) => Occasion): boolean[] => {
    const rng = stream(seed, `counted|${spec.id}|${label}`)
    const out: boolean[] = []
    let on = false
    for (let i = 0; i < steps; i++) {
      const u = rng()
      const rule = spec.things
      on = rule.how === 'runs' ? u < (i === 0 ? RUN_START : on ? RUN_STAY : RUN_ON) : u < rule.chance(occasion(i))
      out.push(on)
    }
    return out
  }
  const has = (f: Family): boolean => spec.families.includes(f)
  const dayThing = has('A-day') ? laid('day', YEAR, (d) => ({ d, weekday: weekday[d], block: null, evening: null })) : []
  const checkinThing = has('A-checkin') ? laid('checkin', YEAR * 3, (t) => ({ d: Math.floor(t / 3), weekday: weekday[Math.floor(t / 3)], block: BLOCKS[t % 3], evening: null })) : []
  const eveningThings = has('B') ? Array.from({ length: EVENING_THINGS }, (_, j) => laid(`evening|${j}`, YEAR, (d) => ({ d, weekday: weekday[d], block: 'evening', evening: reading[d][EVENING] }))) : []

  // A real difference: the first evening thing lifts every reading the next morning, recorded or not. The morning
  // without it is kept, so the true difference is known exactly.
  const morningWithout = reading.map((r) => r[MORNING])
  if (spec.effect && has('B')) {
    for (let d = 0; d + 1 < YEAR; d++) {
      if (!eveningThings[0][d]) continue
      for (const r of INGREDIENT_READINGS) world.add(r, d + 1, 'morning', spec.effect)
      reading[d + 1][MORNING] = read(d + 1, 'morning')
    }
  }
  return { weekday, dayName, reading, morningWithout, shortNight, dayThing, checkinThing, eveningThings }
}

/** One simulated person through one world: every family the world holds, at every look. */
export function runCounted(spec: CountedWorld, seed: number): CountedPerson {
  const t0 = performance.now()
  const rec = recordOf(spec, seed)
  const { weekday, dayName, reading, morningWithout, shortNight, dayThing, checkinThing, eveningThings } = rec
  const has = (f: Family): boolean => spec.families.includes(f)
  const answered = (d: number, b: number): boolean => reading[d][b] !== null
  const anyAnswered = (d: number): boolean => reading[d].some((v) => v !== null)

  const looks: CountedPerson['looks'] = {}
  for (const H of LOOKS) {
    const tag = `${spec.id}|${seed}|${H}`
    const families: Partial<Record<Family, FamilyResult>> = {}
    const bound: BoundInputs = {}

    /** The what-came-before cell of a day: a short night, and a low evening the day before; null where the record cannot say. */
    const shortCell = (d: number): string | null => (shortNight[d] === null ? null : shortNight[d] ? 'yes' : 'no')
    const lowCell = (d: number): string | null => {
      const v = d > 0 ? reading[d - 1][EVENING] : null
      return v === null ? null : v < 40 ? 'yes' : 'no'
    }

    if (has('A-day')) {
      const byWeekday: CellPoint[] = []
      const byShort: CellPoint[] = []
      const byLow: CellPoint[] = []
      for (let d = 0; d < H; d++) {
        if (!anyAnswered(d)) continue
        const happened = dayThing[d]
        byWeekday.push({ day: dayName[d], cell: String(weekday[d]), happened })
        const s = shortCell(d)
        if (s) byShort.push({ day: dayName[d], cell: s, happened })
        const l = lowCell(d)
        if (l) byLow.push({ day: dayName[d], cell: l, happened })
      }
      families['A-day'] = resultOf([
        ...ratesBy(byWeekday, { id: `${tag}|day.weekday`, within: 'stretch', cells: ['0', '1', '2', '3', '4', '5', '6'] }),
        ...ratesBy(byShort, { id: `${tag}|day.short`, within: 'stretch', cells: ['yes'] }),
        ...ratesBy(byLow, { id: `${tag}|day.low`, within: 'stretch', cells: ['yes'] }),
      ])
      if (spec.id === 'weekday') {
        bound.sat = byWeekday.filter((p) => p.cell === String(SATURDAY)).length
        bound.other = byWeekday.length - bound.sat
      }
    }

    if (has('A-checkin')) {
      const byWeekday: CellPoint[] = []
      const byBlock: CellPoint[] = []
      const byShort: CellPoint[] = []
      const byLow: CellPoint[] = []
      for (let d = 0; d < H; d++) {
        for (let b = 0; b < 3; b++) {
          if (!answered(d, b)) continue
          const happened = checkinThing[d * 3 + b]
          byWeekday.push({ day: dayName[d], cell: String(weekday[d]), happened })
          byBlock.push({ day: dayName[d], cell: BLOCKS[b], happened })
          const s = shortCell(d)
          if (s) byShort.push({ day: dayName[d], cell: s, happened })
          const l = lowCell(d)
          if (l) byLow.push({ day: dayName[d], cell: l, happened })
        }
      }
      families['A-checkin'] = resultOf([
        ...ratesBy(byWeekday, { id: `${tag}|checkin.weekday`, within: 'stretch', cells: ['0', '1', '2', '3', '4', '5', '6'] }),
        ...ratesBy(byBlock, { id: `${tag}|checkin.block`, within: 'day', cells: BLOCKS }),
        ...ratesBy(byShort, { id: `${tag}|checkin.short`, within: 'stretch', cells: ['yes'] }),
        ...ratesBy(byLow, { id: `${tag}|checkin.low`, within: 'stretch', cells: ['yes'] }),
      ])
    }

    if (has('B')) {
      const compared: Compared[] = []
      for (let j = 0; j < EVENING_THINGS; j++) {
        const points = eveningPoints(rec, H, j)
        compared.push(compare(points, { id: `${tag}|evening.${j}`, worth: WORTH_POINTS }))
        if (j === 0 && spec.effect) {
          // The pooled spread around each group's own mean, a group being the evenings of one band with the thing or without it.
          const groups = new Map<string, number[]>()
          for (const p of points) {
            const key = `${p.band}|${p.event}`
            const g = groups.get(key)
            if (g) g.push(p.outcome)
            else groups.set(key, [p.outcome])
          }
          let ss = 0
          for (const g of groups.values()) {
            const mean = g.reduce((s, v) => s + v, 0) / g.length
            for (const v of g) ss += (v - mean) ** 2
          }
          const df = points.length - groups.size
          bound.n1 = points.filter((p) => p.event).length
          bound.n0 = points.length - bound.n1
          bound.spread = df > 0 ? Math.sqrt(ss / df) : 0
          bound.trueSum = 0
          bound.trueN = 0
          for (let d = 0; d + 1 < H; d++) {
            const without = morningWithout[d + 1]
            const withIt = reading[d + 1][MORNING]
            if (!eveningThings[0][d] || reading[d][EVENING] === null || without === null || withIt === null) continue
            bound.trueSum += withIt - without
            bound.trueN++
          }
        }
      }
      families.B = resultOf(compared)
    }
    looks[String(H)] = Object.keys(bound).length ? { families, bound } : { families }
  }
  return { seed, looks, ms: Math.round(performance.now() - t0) }
}
