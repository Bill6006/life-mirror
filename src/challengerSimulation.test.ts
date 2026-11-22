import { beforeAll, describe, expect, it } from 'vitest'
import { BLOCKS, type Block } from './blocks'
import { CHALLENGER, kindsAtPattern, runChallenger, type ChallengerNumbers, type Condition } from './challenger'
import { compare, difference, seeded, seedOf, WORTH_POINTS, type Point } from './counted/compare'
import { LEVEL_WEEKDAY, predict, type ModelId, type WayId } from './forecast'
import { slotKey } from './observe'
import { bandOf } from './score'

// A small seeded simulation of the challenger's pick, so the suite guards the rule every time it runs (2026-11-14).
// The full proof is offline, in stress/RESULTS-9.md: nine worlds, 2,000 people each, with the app's own daily pick
// among the four ways. This is two hundred seeded people of its own in a world where every input says nothing about
// the person's days ahead, and eighty in a world where one thing lifts the next morning by fifteen points. Each is
// 120 days long; the challenger is tried every fifth day from day 15 on the record before that day, beside one fixed
// base way, looking back over the record's own 120 days. Seeded, so its counts are the same on every run; the marks below were set from those counts and from
// what each deliberate break does to them.

const DAYS = 120
const THINGS = 4
const ANSWERED: Record<Block, number> = { morning: 0.9, afternoon: 0.6, evening: 0.85 }
const BASE: ModelId = 'sameBlock'
const dayName = (d: number): string => new Date(Date.UTC(2031, 0, 6 + d)).toISOString().slice(0, 10)
const clamp = (v: number): number => Math.max(0, Math.min(100, Math.round(v)))

interface Person {
  reading: (number | null)[][]
  short: (boolean | null)[]
  things: boolean[][]
}

/** One person's 120 days: a state that carries over, three check-ins a day answered by chance, a sleep answer each answered morning, and four evening things. */
function person(label: string, seed: number, lift: number): Person {
  const next = seeded(seedOf(`${label}|${seed}`))
  const gauss = (): number => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next())
  let state = 9 * gauss()
  const things = Array.from({ length: THINGS }, () => Array.from({ length: DAYS }, () => next() < 0.3))
  const reading: (number | null)[][] = []
  const short: (boolean | null)[] = []
  for (let d = 0; d < DAYS; d++) {
    state = 0.6 * state + 9 * 0.8 * gauss()
    const row = BLOCKS.map((b, i) => {
      const answered = next() < ANSWERED[b]
      const value = 50 + state + 3 * (i - 1) + 6 * gauss() + (lift && i === 0 && d > 0 && things[0][d - 1] ? lift : 0)
      return answered ? clamp(value) : null
    })
    reading.push(row)
    const shortNight = next() < 0.2
    short.push(row[0] === null ? null : shortNight)
  }
  return { reading, short, things }
}

/** One person's tries, each as its slots, gain and clearance: the conditions are the lender's, the things the person's own, through the standing gate. */
type Try = [slots: number, gain: number | null, clear: number | null]
function tries(p: Person, lender: Person, numbers: ChallengerNumbers): Try[] {
  const index = new Map(Array.from({ length: DAYS }, (_, d) => [dayName(d), d]))
  const fixed = (id: string, state: (d: number) => string | null): Condition => ({ id, blocks: BLOCKS, stateOn: (day) => { const d = index.get(day); return d === undefined ? null : state(d) }, moves: () => true })
  const sleep = fixed('sleep', (d) => (lender.short[d] === null ? null : lender.short[d] ? 'short' : 'not'))
  const evening = fixed('evening', (d) => (lender.reading[d][2] === null ? null : bandOf(lender.reading[d][2] as number)))
  const kind = (j: number): Condition => ({ id: `thing.${j}`, blocks: ['morning'], stateOn: (day) => { const d = index.get(day); return d === undefined || p.reading[d][2] === null ? null : p.things[j][d] ? 'yes' : 'no' }, moves: (s) => s === 'yes' })
  const values = new Map<string, number>()
  const memo = new Map<string, number | null>()
  const once = (model: WayId, _v: ReadonlyMap<string, number>, day: string, block: Block): number | null => {
    const key = `${day}|${block}`
    if (!memo.has(key)) memo.set(key, model === LEVEL_WEEKDAY ? null : predict(model, values, day, block))
    return memo.get(key) as number | null
  }
  const out: Try[] = []
  for (let t = 1; t < DAYS; t++) {
    BLOCKS.forEach((b, i) => { const v = p.reading[t - 1][i]; if (v !== null) values.set(slotKey(dayName(t - 1), b), v) })
    if (t < 14 || (t - 14) % 5 !== 0) continue
    // The gate, over the record before day t: the next morning after evenings with a thing against evenings without it.
    const points = Array.from({ length: THINGS }, (_, j): Point[] => {
      const out: Point[] = []
      for (let d = 0; d + 1 < t; d++) {
        const e = p.reading[d][2]
        const m = p.reading[d + 1][0]
        if (e !== null && m !== null) out.push({ day: dayName(d), event: p.things[j][d], outcome: m, band: bandOf(e) })
      }
      return out
    })
    const worth = points.some((x) => Math.abs(difference(x) ?? 0) >= WORTH_POINTS - 1e-9)
    const onList = worth ? kindsAtPattern(points.map((x, j) => compare(x, { id: `thing.${j}`, worth: WORTH_POINTS, shuffles: 200 })), numbers.maxKinds) : []
    const run = runChallenger(BASE, values, dayName(t), [sleep, evening, ...onList.map((id) => kind(Number(id.slice(6))))], numbers, once)
    out.push([run.slots, run.gain, run.clear])
  }
  return out
}

const everyTry = (people: number, lift: number): Try[][] => Array.from({ length: people }, (_, i) => tries(person('person', i + 1, lift), person('lender', i + 1, 0), { ...CHALLENGER, window: DAYS }))
/** How many people are picked on at least one try, by a margin. */
const picked = (all: readonly Try[][], m: Pick<ChallengerNumbers, 'minSlots' | 'minGain' | 'minClear'> = CHALLENGER): number =>
  all.filter((mine) => mine.some(([slots, gain, clear]) => slots >= m.minSlots && gain !== null && gain >= m.minGain && clear !== null && clear >= m.minClear)).length

describe('the challenger’s pick, on seeded people', () => {
  let useless: Try[][] = []
  let lifted: Try[][] = []
  beforeAll(() => {
    useless = everyTry(200, 0)
    lifted = everyTry(80, 15)
  }, 120_000)

  it('rarely picks it when every input says nothing about the days ahead', () => {
    // None of the 200 on these seeds; fewer than one in twenty is the rule, and four is the mark.
    expect(picked(useless)).toBeLessThanOrEqual(4)
  })

  it('a margin that asks for no clearance lets the useless inputs in: the margin is what holds them out', () => {
    // 21 of the same 200 with the clearance and the gain set aside.
    expect(picked(useless, { minSlots: 20, minGain: 0, minClear: 0 })).toBeGreaterThanOrEqual(15)
  })

  it('picks it for a thing that lifts the next morning by fifteen points', () => {
    // 20 of 80 on these seeds, in 120 days tried every fifth day; none of the 200 without the lift.
    expect(picked(lifted)).toBeGreaterThanOrEqual(15)
  })
})
