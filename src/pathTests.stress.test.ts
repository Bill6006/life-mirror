import { describe, expect, it } from 'vitest'
import { leverOf, leverRefusal, phi, readTest, TEST_WEEKS, type TestReading, type TestUnit } from './pathTests'

// The slow loop's stress test (P6, 2026-11-07), against the criteria frozen in the plan before any run, on the estimator
// and calls exactly as shipped: 2,000 tests a scenario, twelve weeks of days, a version drawn each day at one half. Every
// criterion the error rates set is met. Three ask more than twelve weeks of days can give any test whatever its
// estimator: (e) Promising on +25 points in 70% of tests, (f) in 50% with a third of days unseen, and (l) no meaningful
// difference called in 40% of no-difference tests while at most 2% at +25. The bounds below prove it, so the slow loop
// stays switched off and the criteria go to the owner (the plan: "one that cannot be met within them is a stop for the owner").

const TESTS = 2000
const PRIOR = (leverOf('planLine') as NonNullable<ReturnType<typeof leverOf>>).prior

/** A fixed stream of draws, so each scenario's run is the same every time. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Scenario {
  /** The chance of the outcome on the version shown now, by the test's week. */
  base: (week: number) => number
  /** What the other version adds, by week. */
  delta: (week: number) => number
  weeks?: number
  /** The share of days whose version was seen. */
  seen?: number
  /** Added to the next day's chance after a day the outcome happened, whatever was drawn. */
  carry?: number
  /** The first week all on the other version, and all done. */
  streak?: boolean
}

function units(s: Scenario, r: () => number): TestUnit[] {
  const out: TestUnit[] = []
  let last = false
  for (let d = 0; d < (s.weeks ?? TEST_WEEKS) * 7; d++) {
    const week = Math.floor(d / 7)
    const streak = s.streak && week === 0
    const version: 0 | 1 = streak ? 1 : r() < 0.5 ? 1 : 0
    const p: number = s.base(week) + (version === 1 ? s.delta(week) : 0) + (s.carry && last ? s.carry : 0)
    const y: 0 | 1 = streak ? 1 : r() < Math.min(1, Math.max(0, p)) ? 1 : 0
    last = y === 1
    if (r() < (s.seen ?? 1)) out.push({ week, version, chance: 0.5, y })
  }
  return out
}

interface Tally {
  up: number
  down: number
  none: number
  cannot: number
  early: number
  results: TestReading[]
}

function run(s: Scenario, seed: number, two = false): Tally {
  const r = rng(seed)
  const t: Tally = { up: 0, down: 0, none: 0, cannot: 0, early: 0, results: [] }
  for (let k = 0; k < TESTS; k++) {
    const res = readTest(units(s, r), PRIOR, s.weeks ?? TEST_WEEKS, () => two)
    t.results.push(res)
    if (res.call.kind === 'promising') res.call.toward === 1 ? t.up++ : t.down++
    else if (res.call.kind === 'noDifference') t.none++
    else t.cannot++
    if (res.call.kind !== 'couldNotTell' && res.weeks < 4) t.early++
  }
  return t
}

const share = (n: number) => n / TESTS
const flat = (x: number) => () => x
const NONE = { base: flat(0.4), delta: flat(0) }

describe('the slow loop against its frozen criteria, as shipped', () => {
  it('(a) too little data, three weeks: could not tell in every test', () => {
    const t = run({ ...NONE, weeks: 3 }, 1)
    expect(t.cannot).toBe(TESTS)
  })
  it('(b) no difference: Promising in at most 5%', () => {
    const t = run(NONE, 2)
    expect(share(t.up + t.down)).toBeLessThanOrEqual(0.05)
  })
  it('(c) a time trend, uptake rising from 20% to 60%, no difference: at most 5%', () => {
    const t = run({ base: (w) => 0.2 + (0.4 * w) / (TEST_WEEKS - 1), delta: flat(0) }, 3)
    expect(share(t.up + t.down)).toBeLessThanOrEqual(0.05)
  })
  it('(d) an early misleading streak, no difference: at most 5%, and no call before week four', () => {
    const t = run({ ...NONE, streak: true }, 4)
    expect(share(t.up + t.down)).toBeLessThanOrEqual(0.05)
    expect(t.early).toBe(0)
  })
  it('(e) +25 points on 40%: Promising the wrong way in at most 1%', () => {
    const t = run({ base: flat(0.4), delta: flat(0.25) }, 5)
    expect(share(t.down)).toBeLessThanOrEqual(0.01)
  })
  it('(f) a third of days unseen (35%), no difference: at most 5%', () => {
    const t = run({ ...NONE, seen: 0.65 }, 6)
    expect(share(t.up + t.down)).toBeLessThanOrEqual(0.05)
  })
  it('(g) poor adherence, a 15% base, no difference: at most 5%', () => {
    const t = run({ base: flat(0.15), delta: flat(0) }, 7)
    expect(share(t.up + t.down)).toBeLessThanOrEqual(0.05)
  })
  it('(h) contradictory, +25 for six weeks then −25: any Promising in at most 10%', () => {
    const t = run({ base: flat(0.4), delta: (w) => (w < 6 ? 0.25 : -0.25) }, 8)
    expect(share(t.up + t.down)).toBeLessThanOrEqual(0.1)
  })
  it('(i) a changing context, 30% then 60% from week six, no difference: at most 5%', () => {
    const t = run({ base: (w) => (w < 6 ? 0.3 : 0.6), delta: flat(0) }, 9)
    expect(share(t.up + t.down)).toBeLessThanOrEqual(0.05)
  })
  it('(j) carryover, ten points the day after a done one, no difference: at most 5%', () => {
    const t = run({ ...NONE, carry: 0.1 }, 10)
    expect(share(t.up + t.down)).toBeLessThanOrEqual(0.05)
  })
  it('(k) two tests at once on two Paths, no difference on either: any false Promising across the pair in at most 5%', () => {
    const a = run(NONE, 11, true)
    const b = run(NONE, 12, true)
    const either = a.results.filter((x, k) => x.call.kind === 'promising' || b.results[k].call.kind === 'promising').length
    expect(share(either)).toBeLessThanOrEqual(0.05)
  })
  it('(l) +25 points: no meaningful difference in at most 2%', () => {
    const t = run({ base: flat(0.4), delta: flat(0.25) }, 13)
    expect(share(t.none)).toBeLessThanOrEqual(0.02)
  })
  it('(m) +5 points: could not tell the commonest result, and Promising in at most 30%', () => {
    const t = run({ base: flat(0.4), delta: flat(0.05) }, 14)
    expect(t.cannot).toBeGreaterThan(Math.max(t.up, t.down, t.none))
    expect(share(t.up + t.down)).toBeLessThanOrEqual(0.3)
  })
  it('(n) a lever outside the closed list, on whether, on a cumulative component, or unsafe, is refused in every case', () => {
    expect(leverRefusal({ id: 'promptTiming' })).toMatch(/not a lever/)
    expect(leverRefusal({ id: 'planLine', whether: true })).toMatch(/never whether/)
    expect(leverRefusal({ id: 'predictLine', cumulative: true })).toMatch(/carries over/)
    expect(leverRefusal({ id: 'planLine', unsafe: true })).toMatch(/unsafe/)
    expect(leverRefusal({ id: 'stageOrder' })).toMatch(/not a lever/)
    expect(leverRefusal({ id: 'planLine' })).toBeNull()
    expect(leverRefusal({ id: 'predictLine' })).toBeNull()
  })
})

describe('what twelve weeks of days can give any test (why (e), (f) and (l) cannot be met)', () => {
  // Twelve weeks of days, half on each version: 42 a version, 27 when a third of days go unseen.
  const se = (p0: number, p1: number, n: number) => Math.sqrt((p0 * (1 - p0) + p1 * (1 - p1)) / n)
  /** The most powerful single look at the end, false Promising held to 5% across both directions. */
  const bestPower = (n: number) => phi((0.25 - 1.96 * se(0.4, 0.4, n)) / se(0.4, 0.65, n))
  it('(e): at most 65% find +25 points, where 70% is asked', () => {
    expect(bestPower(42)).toBeLessThan(0.7)
    expect(bestPower(42)).toBeGreaterThan(0.6)
  })
  it('(f): at most 48% with a third of days unseen, where 50% is asked', () => {
    expect(bestPower(42 * 0.65)).toBeLessThan(0.5)
  })
  it('(l): a band that calls +25 no difference in at most 2% calls a true zero so in at most 26%, where 40% is asked', () => {
    // The widest band around zero whose call at +25 stays at 2%, and how often a true zero lands inside it.
    const c = 0.25 - 2.054 * se(0.4, 0.65, 42)
    const atZero = 2 * phi(c / se(0.4, 0.4, 42)) - 1
    expect(atZero).toBeLessThan(0.4)
  })
  it('and the shipped calls land below those bounds: (e), (f) and (l) as run', () => {
    const e = run({ base: flat(0.4), delta: flat(0.25) }, 5)
    const f = run({ base: flat(0.4), delta: flat(0.25), seen: 0.65 }, 15)
    const l = run(NONE, 16)
    expect(share(e.up)).toBeLessThan(bestPower(42))
    expect(share(f.up)).toBeLessThan(bestPower(42 * 0.65))
    expect(share(l.none)).toBeLessThan(0.4)
  })
})
