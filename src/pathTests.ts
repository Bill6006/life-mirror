// The slow loop (P6 of the AI-generated Paths design, 2026-11-07), the pure part: a small test of one of a Path's fast,
// reversible levers, randomised per day or per rep, read within its weeks and shrunk toward the population prior. A test
// randomises how a rep is offered, never whether it is (Rule 16): the closed list below is all a test may touch. "Could
// not tell" is the default and a normal result, and Promising is the ceiling, since the outcomes are your own taps.

/** The fast, reversible levers a small test may vary, and nothing else. */
export type LeverId = 'planLine' | 'predictLine'

export interface Lever {
  id: LeverId
  /** One unit of the test: a day the Path's rep was on show, or a rep started. */
  unit: 'day' | 'offer'
  /** The two versions, the one the Path shows now first. Both offer the rep: neither is whether. */
  versions: readonly [string, string]
  /** The population prior on the second version's difference in the outcome's share, discounted. */
  prior: { mean: number; sd: number }
  /** Only on a Path that measures its reps. */
  measuredOnly: boolean
}

export const LEVERS: readonly Lever[] = [
  // An adherence support: the rep's if-then plan shown open with the rep, or folded behind Plan as now. Its prior is
  // implementation intentions' modest benefit on doing what was planned, discounted far below the trials' effects,
  // since here the plan is only shown, never formed.
  { id: 'planLine', unit: 'day', versions: ['folded', 'open'], prior: { mean: 0.03, sd: 0.1 }, measuredOnly: false },
  // An immediate technique variant on a measured Path: the one line before Start, or Start at once. No prior effect.
  { id: 'predictLine', unit: 'offer', versions: ['none', 'line'], prior: { mean: 0, sd: 0.1 }, measuredOnly: true },
]

export function leverOf(id: string): Lever | null {
  return LEVERS.find((l) => l.id === id) ?? null
}

/** What someone might ask a test to vary: a lever by its id, and what each of its versions does. */
export interface LeverAsk {
  id: string
  /** Whether a version leaves the rep out: a test of whether, never allowed. */
  whether?: boolean
  /** Whether it varies a component the Path trains, whose learning carries over and cannot be undone. */
  cumulative?: boolean
  /** Whether a version would offer something unsafe or the Path's own words rule out. */
  unsafe?: boolean
}

/** Why a test of this lever is refused, or null: only a lever on the closed list, as the list defines it. */
export function leverRefusal(ask: LeverAsk): string | null {
  if (ask.whether) return 'a test randomises how a rep is offered, never whether it is'
  if (ask.cumulative) return 'a component the Path trains carries over: it is never varied by a test'
  if (ask.unsafe) return 'nothing unsafe is ever a version'
  if (!leverOf(ask.id)) return `not a lever a test may vary: ${ask.id}`
  return null
}

/** A small test you started on a Path: its lever, when, and when you stopped it if you did. Everything else is read from the record. */
export interface PathTest {
  id?: number
  path: string
  lever: LeverId
  at: string
  /** Its first day: its weeks run in sevens from here. */
  day: string
  stoppedAt?: string
  stoppedDay?: string
}

/** A day a test's version was on show (a lever whose unit is a day): the version it got and the chance it had. */
export interface PathTestDay {
  id?: number
  test: number
  day: string
  version: 0 | 1
  chance: number
  at: string
}

/** One unit of a test: its week from the test's start, the version it got with the chance it had, and the outcome. */
export interface TestUnit {
  week: number
  version: 0 | 1
  chance: number
  y: 0 | 1
}

export const TEST_WEEKS = 12
/** A difference smaller than this is no meaningful difference. */
export const SMALL = 0.1
/**
 * The calls' thresholds and minimums, repaired within the design's principles after the frozen stress test (P6,
 * 2026-11-07; the builder's decision under the owner's instruction of 2026-10-17): the design's 0.9 (0.95 with two tests)
 * after four weeks called a difference that was not there in 9% of tests and Promising in 32% of tests whose difference
 * reversed after six weeks; 0.95 (0.975) after eight weeks holds every no-difference scenario under 5% and the reversal
 * under 4%. No meaningful difference waits eight weeks too. The slow loop stays switched off: three of its frozen
 * criteria ask more than twelve weeks of days can give any test (pathTests.stress.test.ts).
 */
export const PROMISING = { p: 0.95, pTwo: 0.975, weeks: 8, each: 12 } as const
export const NO_DIFFERENCE = { p: 0.9, weeks: 8, each: 20 } as const

export interface Estimate {
  /** The difference in the outcome's share, the second version less the first, from the weeks with both; null with fewer than two. */
  diff: number | null
  se: number | null
  /** Weeks with both versions seen. */
  weeks: number
  /** Units seen on each version. */
  n: [number, number]
  /** The difference shrunk toward the prior. */
  post: { mean: number; sd: number }
  /** The chance the second version's difference is above zero, and that it is smaller than SMALL either way. */
  pUp: number
  pSmall: number
}

/** The standard normal's distribution function (Abramowitz and Stegun 7.1.26, within 1.5e-7). */
export function phi(z: number): number {
  const x = Math.abs(z) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * x)
  const e = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return z >= 0 ? (1 + e) / 2 : (1 - e) / 2
}

/**
 * The estimate: in each week with both versions, the difference in the outcome's share, each unit weighted by the
 * inverse of its recorded chance; the weeks averaged by their size, so a trend across weeks cancels within them; its
 * uncertainty read from the spread between the weeks, never below what the counts themselves allow; then a normal
 * prior and likelihood.
 */
export function estimate(units: readonly TestUnit[], prior: { mean: number; sd: number }): Estimate {
  const n: [number, number] = [units.filter((u) => u.version === 0).length, units.filter((u) => u.version === 1).length]
  const byWeek = new Map<number, TestUnit[]>()
  for (const u of units) byWeek.set(u.week, [...(byWeek.get(u.week) ?? []), u])
  const weeks: { size: number; d: number; nA: number; nB: number; ys: number }[] = []
  for (const us of byWeek.values()) {
    const share = (v: 0 | 1) => {
      const mine = us.filter((u) => u.version === v)
      const w = mine.reduce((s, u) => s + 1 / u.chance, 0)
      return mine.length ? { m: mine.reduce((s, u) => s + u.y / u.chance, 0) / w, n: mine.length } : null
    }
    const a = share(0)
    const b = share(1)
    if (a && b) weeks.push({ size: us.length, d: b.m - a.m, nA: a.n, nB: b.n, ys: us.reduce((s, u) => s + u.y, 0) })
  }
  const priorOnly = (): Estimate => ({ diff: null, se: null, weeks: weeks.length, n, post: { ...prior }, pUp: phi(prior.mean / prior.sd), pSmall: phi((SMALL - prior.mean) / prior.sd) - phi((-SMALL - prior.mean) / prior.sd) })
  if (weeks.length < 2) return priorOnly()
  const total = weeks.reduce((s, w) => s + w.size, 0)
  const diff = weeks.reduce((s, w) => s + w.size * w.d, 0) / total
  const k = weeks.length
  const between = (k / (k - 1)) * weeks.reduce((s, w) => s + (w.size / total) ** 2 * (w.d - diff) ** 2, 0)
  // The counts' own floor: a spread of zero between a few weeks is chance, never certainty.
  const share = weeks.reduce((s, w) => s + w.ys, 0) / total
  const floor = weeks.reduce((s, w) => s + (w.size / total) ** 2 * Math.max(share * (1 - share), 0.05) * (1 / w.nA + 1 / w.nB), 0)
  const v = Math.max(between, floor)
  const precision = 1 / prior.sd ** 2 + 1 / v
  const mean = (prior.mean / prior.sd ** 2 + diff / v) / precision
  const sd = 1 / Math.sqrt(precision)
  return { diff, se: Math.sqrt(v), weeks: k, n, post: { mean, sd }, pUp: phi(mean / sd), pSmall: phi((SMALL - mean) / sd) - phi((-SMALL - mean) / sd) }
}

export type TestCall = { kind: 'couldNotTell' } | { kind: 'promising'; toward: 0 | 1 } | { kind: 'noDifference' }

/** The calls' thresholds and minimums, as shipped. */
export const RULES = { promising: PROMISING, noDifference: NO_DIFFERENCE, weeks: TEST_WEEKS }
export type Rules = { promising: { p: number; pTwo: number; weeks: number; each: number }; noDifference: { p: number; weeks: number; each: number }; weeks: number }

/** The call on a test's units after so many whole weeks: Promising first, then no meaningful difference, else could not tell. */
export function callOf(e: Estimate, weeksDone: number, twoTests: boolean, rules: Rules = RULES): TestCall {
  const P = rules.promising
  const N = rules.noDifference
  const pr = twoTests ? P.pTwo : P.p
  if (e.diff !== null && weeksDone >= P.weeks && e.n[0] >= P.each && e.n[1] >= P.each) {
    if (e.pUp >= pr) return { kind: 'promising', toward: 1 }
    if (1 - e.pUp >= pr) return { kind: 'promising', toward: 0 }
  }
  if (e.diff !== null && weeksDone >= N.weeks && e.n[0] >= N.each && e.n[1] >= N.each && e.pSmall >= N.p) return { kind: 'noDifference' }
  return { kind: 'couldNotTell' }
}

export interface TestReading {
  call: TestCall
  /** The whole weeks read, and whether the test has stopped: at its first call, or at twelve weeks. */
  weeks: number
  stopped: boolean
  estimate: Estimate
}

/**
 * A test read at the end of each whole week, as it runs: the first call that holds stops it, and at twelve weeks it
 * stops with what stands. `twoTestsAt` says whether another test was running in a week, so a call there needs more.
 */
export function readTest(units: readonly TestUnit[], prior: Lever['prior'], weeksDone: number, twoTestsAt: (week: number) => boolean = () => false, rules: Rules = RULES): TestReading {
  const upTo = Math.min(weeksDone, rules.weeks)
  for (let w = 1; w <= upTo; w++) {
    const e = estimate(units.filter((u) => u.week < w), prior)
    const call = callOf(e, w, twoTestsAt(w - 1), rules)
    if (call.kind !== 'couldNotTell') return { call, weeks: w, stopped: true, estimate: e }
  }
  const e = estimate(units.filter((u) => u.week < upTo), prior)
  return { call: { kind: 'couldNotTell' }, weeks: upTo, stopped: upTo >= rules.weeks, estimate: e }
}
