import { BLOCKS, type Block } from '../src/blocks'
import { hasMove, liveMoves, moveById, rungOf, type Window } from '../src/catalogue'
import type { CheckIn } from '../src/db'
import { noTimeCeiling, PRIOR_SD } from '../src/observe'
import { candidatesFor, NOTHING, screen, situationOf, standingSetups, type Situation, type TodayState } from '../src/offers'
import { blockReadings, type ReadingId } from '../src/readings'
import { INGREDIENT_IDS, INGREDIENTS } from '../src/score'
import { gauss, invertSpd, phi, type Rng } from './stats'
import { DAYS, reach, windowOfMove, type Answered, type DayContext, type Response } from './world'

// Engine B: the learning design agreed on 2026-10-10 (REVIEW_EXECUTION_PLAN.md, requirements 1–16),
// prototyped offline for the stress test and never imported by the app.
//
//   record   every decision point kept as it happened: the eligible set, each chance, seen, the answer;
//   compare  randomized offers only, each move against "nothing extra", centred and weighted by the
//            recorded chances (WCLS, Boruvka 2018; Qian 2022), with the day's state as the
//            prediction that cuts noise; uncertainty clustered by day, never below what the
//            arms' own sizes and the record's own spread allow; every one of a move's readings
//            recorded at every moment it was available, whichever reading made the moment;
//   test     one pre-declared reading per test (requirement 1): a running test is one reading of
//            one move, declared when it enters the queue, and the move's other readings are not
//            tested alongside it;
//   believe  a research prior with a small vague part (Schmidli 2014's principle), tags lending to
//            their moves, pre-declared contexts as deviations shrunk toward the general effect,
//            evidence fading over months;
//   decide   Thompson draws by expected net benefit, with floors kept whole for learning: "nothing
//            extra", the running tests' moves, and a fair minimum for every other move;
//   check    "established" only when an anytime-valid confidence sequence (Waudby-Smith et al. 2021,
//            the asymptotic form) excludes zero at the system's error rate shared by every test the
//            queue can hold; early sign and likely from the belief; a call that newer evidence
//            contradicts steps down and is marked revised.

export interface BConfig {
  /** The floor on "nothing extra", every test's comparison arm. */
  nothingFloor: number
  /** The fair minimum chance each real move outside the test queue keeps in a draw: its own, never shared by the other candidates. */
  explore: number
  /** A move already at likely-hurts or worse keeps this share of its floor. */
  lowFloorShare: number
  /** Posterior probability of the direction for an early sign, and for likely. */
  tauEarly: number
  tauLikely: number
  /** The whole system's error rate for established calls, shared evenly by the catalogue's tests; and the number of days each confidence sequence is tightest at. */
  alphaSystem: number
  csNStar: number
  /** Days with both arms, and decisions per arm, before anything is established; decisions per arm before any call. */
  minDays: number
  nEst: number
  minPerArm: number
  /** How sure the belief must be that a context matters before its values get calls of their own. */
  ctxSure: number
  /** Evidence fades with this half-life in days (the belief; the confidence sequence keeps every day). */
  halfLife: number
  /** The worthwhile margin, in steps of the effect when done. */
  delta: number
  /** Tags lend to their moves. */
  pool: boolean
  /** The prior spread of a tag's learned shift, in steps. */
  tagSd: number
  /** The research prior's vague part: its weight and spread. */
  vague: number
  vagueSd: number
  /** The prior spread of a context's deviation, in steps of the effect when done. */
  ctxSd: number
  /** Days in the confidence sequence before any rung is called. */
  minDaysCall: number
  /** The failure hunt's deliberately poor prediction: a constant, so it can be seen to add no evidence. */
  poorPrediction: boolean
  /** Monte Carlo draws behind each offer's chances. */
  draws: number
  /** The fixed reference probability the treatment is centred at. */
  pTilde: number
  /** The test queue (requirement 11): how many tests run at once, the floor each running test's move gets when eligible, how long a test runs without a conclusion, and how many tests the system's error rate is shared by. */
  queueSize: number
  activeFloor: number
  queueMaxDays: number
  queueCap: number
  /** The lower rungs' anytime-valid error rates, per test: likely and early sign need their sequences to exclude zero too. */
  alphaLikely: number
  alphaEarly: number
  /** Sensitivity only, never the verdict: tests (move|reading|window) held in the queue from the first day they exist, without expiry. */
  pinned: string[]
  /**
   * How a test's effect is read from its decisions. 'wcls' divides by the design the draws happened to
   * give; 'ht' by the design the recorded chances promise (the Horvitz–Thompson form of the same weights
   * and centring), so each decision's part is unbiased given the past, whatever the chances were, and a
   * test the draws starved early is not read as a smaller effect (C3; Hadad, Wager and Athey 2021).
   * 'hybrid' reads as the draws fell until both arms in the range hold `hybridMin` decisions, then as the
   * chances promise: with one or two decisions the promised design is ruled by the rare draw (a move
   * offered with a small chance carries a weight of 1/π), and among the tests that have a decision on
   * each arm at all, that reads large; the realized design's self-normalized form holds until both arms
   * have a handful (Hájek's form).
   */
  estimator: 'wcls' | 'ht' | 'hybrid'
  /** Decisions on each arm before 'hybrid' reads as the chances promise. */
  hybridMin: number
  /**
   * The opt-in learning week (requirement 11), or none: the chance the owner says yes to an invitation,
   * the week's days, the days before the next invitation after a week (and after a no, `gapNo` when it is
   * given), how many tests a week runs, and, for the upper-bound probe only, a week that never ends.
   */
  lw: { accept: number; length: number; gap: number; gapNo?: number; tests: number; always: boolean } | null
  /**
   * Every test the catalogue holds declared on the first day, before any of its own sequence (requirement 1). Each
   * test's confidence sequence then counts every randomized decision from day one, whether or not the queue is
   * running it, and the system's error rates, the lower rungs' included, are shared by every test the catalogue
   * holds instead of by the queue's cap. The queue only decides which tests get the running floor and the week.
   */
  declareAll: boolean
  /** A running test with an early sign of helping keeps its place, as one with a likely sign does. */
  keepEarly: boolean
  /**
   * The fair minimum for a multi-day move on the days it can start, in place of `explore`, or null to use `explore`. Such a
   * move can start only once in eight days, outside another's block (requirement 6), so at the everyday minimum it is
   * offered about once in 180 days and its test has nothing to read.
   */
  multiFloor: number | null
  /**
   * How far one person's effect may sit from the average research reports, in steps: added in quadrature to the research
   * prior's own spread (the starting effect checked for scale, requirement 7). 0 keeps the research spread alone.
   */
  priorTau: number
  /**
   * With every test declared on day one, how the system's error rate is shared among them: evenly, or in proportion
   * to the effect research expects of each test's move, fixed before any data (weighted Bonferroni; Genovese, Roeder
   * and Wasserman 2006). Every test keeps a part, never less than a move expected to give 0.05 step would.
   */
  alphaWeights: 'even' | 'research'
  /**
   * How the queue ranks the tests waiting for a place: 'explore' by the expected benefit and half the belief's
   * spread, so uncertain tests come first; 'benefit' by the expected benefit alone, so the tests research and the
   * record most favour run first.
   */
  queueScore: 'explore' | 'benefit'
  /**
   * Requirement 15's thresholds: "The simulation's rates stand until enough calls resolve. Thresholds loosen only when
   * the record shows calls holding, and tighten when it does not." On, a rung whose own record shows its calls not
   * holding tightens (its allowed error halves), and returns to the simulation's value once they hold again; never looser.
   * Off, the thresholds are the simulation's alone, as the verdict judged them. The track record is kept either way.
   */
  trackRule: boolean
}

export const B_DEFAULT: BConfig = {
  nothingFloor: 0.35,
  explore: 0.05,
  lowFloorShare: 0.1,
  tauEarly: 0.8,
  tauLikely: 0.95,
  alphaSystem: 0.05,
  csNStar: 120,
  minDays: 20,
  nEst: 15,
  minPerArm: 5,
  ctxSure: 0.99,
  halfLife: 120,
  delta: 0.25,
  pool: true,
  tagSd: 0.3,
  vague: 0.2,
  vagueSd: 1.0,
  ctxSd: 0.5,
  minDaysCall: 10,
  poorPrediction: false,
  draws: 100,
  pTilde: 0.25,
  queueSize: 2,
  activeFloor: 0.45,
  queueMaxDays: 45,
  queueCap: 10,
  alphaLikely: 0.005,
  alphaEarly: 0.01,
  pinned: [],
  estimator: 'wcls',
  hybridMin: 5,
  lw: null,
  declareAll: false,
  keepEarly: false,
  multiFloor: null,
  priorTau: 0,
  alphaWeights: 'even',
  queueScore: 'explore',
  trackRule: false,
}

/**
 * Rule 16: whether study, faith, church, time with her, the partner and the people paths happen is the
 * owner's, never a draw, so the learning week never tests them.
 */
const COMMITTED_FAMILIES = new Set(['study', 'faith', 'fatherhood', 'partner', 'people', 'charisma'])
const committed = (moveId: string): boolean => !hasMove(moveId) || moveId === 'time-with-her' || moveId === 'church-early' || COMMITTED_FAMILIES.has(moveById(moveId).family)

export type Cls = 'next' | 'day' | 'multi'
export const clsOf = (w: Window): Cls => (w === 'nextBlock' ? 'next' : w === 'sevenDays' ? 'multi' : 'day')
export type Level = 'none' | 'early' | 'likely' | 'established'
export type Direction = 'helps' | 'little' | 'hurts' | null

/** The pre-declared contexts (requirement 7), each centred at a fixed share so the general effect is the effect at the usual mix. */
export const CONTEXTS = ['withHer', 'office', 'weekend', 'shortSleep'] as const
const CENTRE: Record<(typeof CONTEXTS)[number], number> = { withHer: 0.85, office: 0.29, weekend: 0.29, shortSleep: 0.2 }
/**
 * Each test's regression: an intercept, the centred treatment, and its interaction with each context.
 * The day's state enters through the reading's own prediction (requirement 4), subtracted from the
 * outcome, never as terms of the test's own: a test has few decisions, the record has many.
 */
const IDX_BETA = 1
const P = 2 + CONTEXTS.length
/** A light ridge on the context deviations alone. */
const RIDGE = (() => {
  const r = new Float64Array(P)
  for (let i = IDX_BETA + 1; i < P; i++) r[i] = 2
  return r
})()
/** The prediction's terms: intercept, the six ingredient readings now, the block, a slow trend, the contexts. */
const Q = 1 + 6 + 2 + 1 + 4
const PRED_WINDOWS: readonly Window[] = ['nextBlock', 'laterToday', 'evening', 'nextMorning', 'sevenDays']
/** Pairs before a reading's prediction is used; until then, the reading's running mean. */
const PRED_MIN = 20
const COST: Record<string, number> = { low: 0, medium: 0.05, high: 0.1 }

/** A move's readings it may be tested on: its ingredient targets in their good direction, each with its own window. */
export function testsOfMove(moveId: string): { target: ReadingId; window: Window }[] {
  if (!hasMove(moveId)) return []
  const out: { target: ReadingId; window: Window }[] = []
  for (const t of moveById(moveId).targets) {
    if (!INGREDIENTS[t.reading] || t.direction !== INGREDIENTS[t.reading]) continue
    if (!out.some((x) => x.target === t.reading)) out.push({ target: t.reading as ReadingId, window: t.window })
  }
  return out
}

/** Every test the catalogue holds. */
export const CATALOGUE_TESTS = liveMoves.reduce((n, m) => n + testsOfMove(m.id).length, 0)

interface Decision {
  d: number
  slot: number
  A: 0 | 1
  pi: number
  /** The reading's prediction at the decision, from earlier days only (requirement 4). */
  yhat: number
  x: Float64Array
  outSlots: number[]
  seen: boolean | null
  fraction: number | null
  away: boolean
  resolved: boolean
  /** The context values at the decision: withHer, office, weekend, shortSleep. */
  ctx: [boolean, boolean, boolean, boolean]
}

interface DayAcc {
  S: Float64Array
  /** The design the recorded chances promise: the expectation of S given the past ('ht'). */
  E: Float64Array
  b: Float64Array
  /** Σ w y², for the residual spread. */
  yy: number
  /** Weight sums by arm, and squared, for the arms' effective sizes. */
  w1: number
  w1sq: number
  w0: number
  w0sq: number
  n1: number
  n0: number
  /** Decisions by context value and arm: [context][value][arm]. */
  byCtx: number[][][]
}

export interface Fit {
  /** The effect of offering (ITT, among seen), its standard error, and the confidence sequence's half-width, in steps. */
  beta: number
  se: number
  csHalf: number
  nDays: number
  /** The per-day spread behind the confidence sequence, so each rung can draw its own. */
  sigmaDay: number
  /** The context deviations and their standard errors, on the same scale. */
  gamma: number[]
  gammaSe: number[]
  /** The effect within each context value, and its confidence sequence's half-width: [k][value]. */
  ctxEst: [number, number][]
  ctxCs: [number, number][]
  /** Decisions per arm within each context value: [k][value] = [n0, n1]. */
  ctxN: [number, number][][]
}

export interface Test {
  key: string
  moveId: string
  target: ReadingId
  cls: Cls
  window: Window
  decisions: Decision[]
  days: Map<number, DayAcc>
  n1: number
  n0: number
  comp: number
  compN: number
  /** The day the confidence sequence counts from: its start, or the day after a revision. */
  csStart: number
  established: Direction
  revised: boolean
  /** The belief about the effect when done: a two-part normal mixture. */
  post: { w: number[]; m: number[]; s: number[] }
  theta: number | null
  thetaSe: number | null
  compliance: number
  fitAll: Fit | null
  level: Level
  direction: Direction
  ctxCalls: { context: string; value: 0 | 1; level: Level; direction: Direction; est: number; p: number }[]
  /** The day the test entered the queue, null while it never has; and whether it left without a conclusion. */
  queuedAt: number | null
  expired: boolean
  /** Eligible moments of the move, by day: how available it is. */
  eligibleDays: number[]
  /** Days the move fitted a check-in on this test's own reading, whatever reading was lowest: where a learning week could run it. */
  lwDays: number[]
}

export interface CallB {
  key: string
  moveId: string
  target: ReadingId
  cls: Cls
  window: Window
  level: Level
  direction: Direction
  /** The estimate of the effect when done, with its standard error, and the CS on the effect of offering (ITT). */
  theta: number | null
  thetaSe: number | null
  itt: number | null
  csLo: number | null
  csHi: number | null
  compliance: number
  nDays: number
  n1: number
  n0: number
  revised: boolean
  ctx: { context: string; value: 0 | 1; level: Level; direction: Direction; est: number; p: number }[]
  /** The probability of the direction called, from the belief. */
  pDir: number
}

/** A rung of the ladder that makes a call. */
export type Rung = 'early' | 'likely' | 'established'
const RUNG_RANK: Record<Level, number> = { none: 0, early: 1, likely: 2, established: 3 }

/**
 * Requirement 15: "Every early sign, likely and established call is kept with its date, level and probability, and
 * resolved later." A call is kept the first time a test, or one of its context values, reaches a rung in a direction,
 * unless a call of that direction at that rung or higher is still open. It resolves on its own test's evidence: held when
 * the test reaches a higher rung in the same direction, or, for an established call, when it has stood sixty days; not
 * held when the test reaches any rung in another direction, or an established call is withdrawn (revised).
 */
export interface TrackCall {
  /** The test's key, and for a context call its context and value. */
  key: string
  ctx: string | null
  rung: Rung
  direction: Exclude<Direction, null>
  day: number
  /** The probability of the direction called, from the belief. */
  p: number
  /** True when it held, false when it did not, null while it stays open; and the day it resolved. */
  held: boolean | null
  resolved: number | null
}

/** How often each rung is right, as the stress test's criteria promise and the verdict kept (stress/CRITERIA.md). */
export const TESTED_RATES: Readonly<Record<Rung, number>> = { early: 2 / 3, likely: 4 / 5, established: 19 / 20 }
/** How many of a rung's calls must resolve before its own record can move its threshold. */
export const TRACK_ENOUGH = 10
/** Days an established call stands, never withdrawn nor contradicted, to count as held (C13's sixty days). */
export const TRACK_STANDS = 60

/** P(X ≤ k) for X binomial(n, p). */
function binomCdf(k: number, n: number, p: number): number {
  if (p <= 0) return 1
  if (p >= 1) return k >= n ? 1 : 0
  let s = 0
  let logC = 0
  for (let i = 0; i <= k; i++) {
    if (i > 0) logC += Math.log((n - i + 1) / i)
    s += Math.exp(logC + i * Math.log(p) + (n - i) * Math.log(1 - p))
  }
  return s
}

/** The upper end of the exact two-sided 95 % interval of a share, k of n (Clopper and Pearson 1934). */
export function heldUpper(k: number, n: number): number {
  if (n <= 0 || k >= n) return 1
  let lo = k / n
  let hi = 1
  for (let i = 0; i < 60; i++) {
    const p = (lo + hi) / 2
    if (binomCdf(k, n, p) > 0.025) lo = p
    else hi = p
  }
  return (lo + hi) / 2
}

/**
 * One test's (or context value's) calls on one day: each open call resolved on today's call, and a new call kept when
 * today's is a rung in a direction no open call of that rung or higher already holds. `revisedOn` is the day the test's
 * established call was last withdrawn, or null. Resolved calls are marked in place; the calls still open are returned.
 */
export function trackStep(open: readonly TrackCall[], key: string, ctx: string | null, level: Level, direction: Direction, d: number, p: number, revisedOn: number | null): { still: TrackCall[]; opened: TrackCall | null } {
  const still: TrackCall[] = []
  for (const c of open) {
    let held: boolean | null = null
    if (level !== 'none' && direction !== c.direction) held = false
    else if (c.rung === 'established' && revisedOn !== null && revisedOn > c.day) held = false
    else if (RUNG_RANK[level] > RUNG_RANK[c.rung] && direction === c.direction) held = true
    else if (c.rung === 'established' && d - c.day >= TRACK_STANDS) held = true
    if (held === null) still.push(c)
    else {
      c.held = held
      c.resolved = d
    }
  }
  let opened: TrackCall | null = null
  if (level !== 'none' && direction !== null && !still.some((c) => c.direction === direction && RUNG_RANK[c.rung] >= RUNG_RANK[level])) {
    opened = { key, ctx, rung: level, direction, day: d, p, held: null, resolved: null }
    still.push(opened)
  }
  return { still, opened }
}

/**
 * The thresholds in force (requirement 15): the simulation's own, or, for a rung its record has tightened, its allowed
 * error halved: the probability an early sign or a likely call needs, and the share of established's error rate kept.
 */
export function rungThresholds(cfg: Pick<BConfig, 'tauEarly' | 'tauLikely'>, tight: Readonly<Record<Rung, boolean>>): { early: number; likely: number; estScale: number } {
  return {
    early: tight.early ? 1 - (1 - cfg.tauEarly) / 2 : cfg.tauEarly,
    likely: tight.likely ? 1 - (1 - cfg.tauLikely) / 2 : cfg.tauLikely,
    estScale: tight.established ? 0.5 : 1,
  }
}

/**
 * Requirement 15: "The simulation's rates stand until enough calls resolve. Thresholds loosen only when the record shows
 * calls holding, and tighten when it does not." Once ten of a rung's calls have resolved, the rung tightens while the
 * exact 95 % interval of its share held lies wholly below the rate tested for it, and returns to the simulation's value
 * once the share held is back at that rate. It never loosens past the simulation's value, which requirement 8 fixes in
 * advance ("Thresholds are fixed in advance, from the simulation."). Returns the rungs tightened from today.
 */
export function tightenFrom(track: readonly TrackCall[], before: Readonly<Record<Rung, boolean>>): Record<Rung, boolean> {
  const out: Record<Rung, boolean> = { early: false, likely: false, established: false }
  for (const r of ['early', 'likely', 'established'] as const) {
    let n = 0
    let k = 0
    for (const c of track) {
      if (c.rung !== r || c.held === null) continue
      n++
      if (c.held) k++
    }
    if (n < TRACK_ENOUGH) out[r] = false
    else if (before[r]) out[r] = k / n < TESTED_RATES[r]
    else out[r] = heldUpper(k, n) < TESTED_RATES[r]
  }
  return out
}

export interface OfferMadeB {
  id: number
  moveId: string
  propensity: number
  target: ReadingId
  candidates: string[]
  /** Moves in the draw already at likely-hurts or worse. */
  lowMoves: string[]
}

const slotOf = (d: number, b: Block) => d * 3 + BLOCKS.indexOf(b)
const good = (r: ReadingId, pos: number) => (INGREDIENTS[r] === 'down' ? 6 - pos : pos)

/** The asymptotic confidence sequence's half-width over n days for a per-day spread sigma (Waudby-Smith et al. 2021). */
export function csHalfWidth(sigma: number, n: number, alpha: number, nStar: number): number {
  const rho2 = (-2 * Math.log(alpha) + Math.log(-2 * Math.log(alpha) + 1)) / nStar
  return sigma * Math.sqrt(((2 * (n * rho2 + 1)) / (n * n * rho2)) * Math.log(Math.sqrt(n * rho2 + 1) / alpha))
}

/** Normal-mixture prior times a normal likelihood: the posterior mixture. */
function mixturePosterior(prior: { w: number[]; m: number[]; s: number[] }, est: number | null, se: number | null): { w: number[]; m: number[]; s: number[] } {
  if (est === null || se === null || !Number.isFinite(se) || se <= 0) return prior
  const w: number[] = []
  const m: number[] = []
  const s: number[] = []
  for (let k = 0; k < prior.w.length; k++) {
    const v0 = prior.s[k] ** 2
    const v1 = se * se
    const vk = 1 / (1 / v0 + 1 / v1)
    m.push(vk * (prior.m[k] / v0 + est / v1))
    s.push(Math.sqrt(vk))
    const tot = v0 + v1
    w.push(prior.w[k] * Math.exp(-((est - prior.m[k]) ** 2) / (2 * tot)) / Math.sqrt(tot))
  }
  const z = w.reduce((a, b) => a + b, 0) || 1
  return { w: w.map((x) => x / z), m, s }
}

export const pAbove = (p: { w: number[]; m: number[]; s: number[] }, x: number) => p.w.reduce((acc, w, k) => acc + w * (1 - phi((x - p.m[k]) / p.s[k])), 0)
export const pWithin = (p: { w: number[]; m: number[]; s: number[] }, d: number) => p.w.reduce((acc, w, k) => acc + w * (phi((d - p.m[k]) / p.s[k]) - phi((-d - p.m[k]) / p.s[k])), 0)
export const pMean = (p: { w: number[]; m: number[]; s: number[] }) => p.w.reduce((a, w, k) => a + w * p.m[k], 0)

export class EngineB {
  readonly cfg: BConfig
  private readonly rng: Rng
  private readonly away: ReadonlySet<number>
  private readonly tests = new Map<string, Test>()
  /** Extra tests declared up front for a move and reading: another window than its own (requirement 6). */
  private readonly declared: { moveId: string; target: ReadingId; window: Window }[]
  private readonly answers = new Map<number, Partial<Record<ReadingId, number>>>()
  private readonly offers: { id: number; moveId: string; d: number; block: Block; decisions: Decision[] }[] = []
  private readonly outcomes = new Map<number, Response>()
  private nextId = 1
  private today = 0
  /** The multi-day block a move runs in, to the day it ends. */
  private multiUntil = -1
  /** The error rate each test's confidence sequence is held to: the system's, shared by every test the queue can ever hold. */
  readonly alphaTest: number
  /** The parts the error rate is shared in when every test is declared on day one: how many tests, and their weights' sum. */
  private readonly allTests: number
  private readonly allWeight: number
  /** The tests running now, and how many have ever run. */
  private queue: Test[] = []
  private queuedEver = 0
  /** The prediction per reading and window (requirement 4): each answered check-in's terms, the pairs trained so far, the fits, and the spread the fit leaves. */
  private readonly q = new Map<number, Float64Array>()
  private readonly qSlots: number[] = []
  private readonly predPtr = new Map<Window, number>()
  private readonly pred = new Map<string, { XtX: Float64Array; Xty: Float64Array; yy: number; n: number; coef: Float64Array | null; spread: number }>()
  private readonly running = new Map<ReadingId, [number, number]>()
  /** The learning week: the person's own answers to invitations, the day the running week ends, the first day of the next invitation, and what the weeks did. */
  private readonly optIn: Rng | null
  private lwUntil = -1
  private lwNext = 0
  readonly lwStats = { invited: 0, accepted: 0, days: 0, checkins: 0, moveOffers: 0 }
  /** Requirement 15: every call kept, the ones still open by test (and context value), and the rungs the record has tightened. */
  private readonly track: TrackCall[] = []
  private readonly openTrack = new Map<string, TrackCall[]>()
  private tight: Record<Rung, boolean> = { early: false, likely: false, established: false }

  constructor(rng: Rng, cfg: BConfig = B_DEFAULT, awayDays: ReadonlySet<number> = new Set(), declared: { moveId: string; target: ReadingId; window: Window }[] = [], optIn: Rng | null = null) {
    this.rng = rng
    this.cfg = cfg
    this.away = awayDays
    this.declared = declared
    this.optIn = optIn
    // Each test the queue may ever run, one pre-declared reading, gets an equal part of the system's error rate; with every
    // test declared on day one, each of the catalogue's tests does, and the lower rungs' rates are shared the same way.
    this.allTests = CATALOGUE_TESTS + declared.length
    this.allWeight = liveMoves.reduce((a, m) => a + weightOf(m.id) * testsOfMove(m.id).length, 0) + declared.reduce((a, x) => a + weightOf(x.moveId), 0)
    this.alphaTest = cfg.declareAll ? cfg.alphaSystem / this.allTests : cfg.alphaSystem / cfg.queueCap
  }

  /** A test's error rates: its confidence sequence's, and the lower rungs', each its part of the system's; established's halved while its record has tightened it. */
  private ratesOf(t: Test): { est: number; likely: number; early: number } {
    const cfg = this.cfg
    const estScale = rungThresholds(cfg, this.tight).estScale
    if (!cfg.declareAll) return { est: this.alphaTest * estScale, likely: cfg.alphaLikely, early: cfg.alphaEarly }
    const share = cfg.alphaWeights === 'research' ? weightOf(t.moveId) / this.allWeight : 1 / this.allTests
    return { est: cfg.alphaSystem * share * estScale, likely: cfg.alphaLikely * cfg.queueCap * share, early: cfg.alphaEarly * cfg.queueCap * share }
  }

  /** The probability a lower rung's belief needs: the simulation's, or its allowed error halved while the record has tightened it. */
  private tauOf(r: 'early' | 'likely'): number {
    return rungThresholds(this.cfg, this.tight)[r]
  }

  /** Requirement 15's thresholds, from the record kept through yesterday (`tightenFrom`). */
  private tighten(): void {
    this.tight = tightenFrom(this.track, this.tight)
  }

  /** Requirement 15: today's calls of every test and context value, each kept the first time and resolved on its own test's evidence. */
  private trackDay(d: number): void {
    for (const t of this.tests.values()) {
      this.trackOne(t.key, null, t.level, t.direction, d, this.pDirOf(t), t.revised ? t.csStart : null)
      for (const c of t.ctxCalls) this.trackOne(t.key, `${c.context}=${c.value}`, c.level, c.direction, d, c.p, null)
    }
  }

  private trackOne(key: string, ctx: string | null, level: Level, direction: Direction, d: number, p: number, revisedOn: number | null): void {
    const id = ctx === null ? key : `${key}|${ctx}`
    const open = this.openTrack.get(id)
    if (!open && level === 'none') return
    const { still, opened } = trackStep(open ?? [], key, ctx, level, direction, d, p, revisedOn)
    if (opened) this.track.push(opened)
    this.openTrack.set(id, still)
  }

  /** The engine's own calls, kept and resolved (requirement 15). */
  trackRecord(): readonly TrackCall[] {
    return this.track
  }

  /** The rungs the record has tightened today (requirement 15). */
  tightened(): Readonly<Record<Rung, boolean>> {
    return this.tight
  }

  /** The tests the queue runs now, by key. */
  runningKeys(): string[] {
    return this.queue.map((t) => t.key)
  }

  private testFor(moveId: string, target: ReadingId, window: Window): Test {
    const key = `${moveId}|${target}|${window}`
    let t = this.tests.get(key)
    if (!t) {
      t = { key, moveId, target, cls: clsOf(window), window, decisions: [], days: new Map(), n1: 0, n0: 0, comp: 0, compN: 0, csStart: 0, established: null, revised: false, post: { w: [1], m: [0], s: [1] }, theta: null, thetaSe: null, compliance: 0.6, fitAll: null, level: 'none', direction: null, ctxCalls: [], queuedAt: null, expired: false, eligibleDays: [], lwDays: [] }
      t.post = this.priorFor(t, 0)
      this.tests.set(key, t)
    }
    return t
  }

  /** A move's readings the record keeps at its moments: its targets in their own windows, and any declared up front in another. */
  private readingsOf(moveId: string): { target: ReadingId; window: Window }[] {
    return [...testsOfMove(moveId), ...this.declared.filter((x) => x.moveId === moveId).map((x) => ({ target: x.target, window: x.window }))]
  }

  private isDeclared(t: Test): boolean {
    return this.declared.some((x) => x.moveId === t.moveId && x.target === t.target && x.window === t.window)
  }

  /** Research says, with a small vague part beside it, shifted by what the move's tags have learned (requirement 7). */
  private priorFor(t: Test, shift: number): { w: number[]; m: number[]; s: number[] } {
    const m = hasMove(t.moveId) ? moveById(t.moveId) : null
    const mu = (m?.prior.effect ?? 0) + shift
    const sd = m ? Math.sqrt(PRIOR_SD[m.source.strength] ** 2 + this.cfg.priorTau ** 2) : 1
    return { w: [1 - this.cfg.vague, this.cfg.vague], m: [mu, 0], s: [sd, this.cfg.vagueSd] }
  }

  // ---- the record -------------------------------------------------------------------------------

  private todayState(day: string, d: number, block: Block, c: DayContext): TodayState {
    const offered = this.offers.filter((o) => o.d === d)
    const told = (id: number) => this.outcomes.get(id)
    const doneAll = this.offers.filter((o) => {
      const r = told(o.id)
      return r?.answered && (r.did === 'done' || r.did === 'partly')
    })
    const doneRungs = new Map<string, number>()
    for (const o of doneAll) {
      const r = rungOf(o.moveId)
      if (r) doneRungs.set(r.ladder[0], Math.max(doneRungs.get(r.ladder[0]) ?? -1, r.index))
    }
    const blockOffers = this.offers.filter((o) => o.block === block).map((o) => ({ id: o.id, moveId: o.moveId, day: dayOf(o.d), block: o.block }))
    const blockOutcomes = blockOffers.map((o) => ({ o, r: told(o.id) })).filter((x) => x.r?.answered && x.r.did === 'no').map((x) => ({ offerId: x.o.id, outcome: 'no' as const, why: x.r?.why ?? null }))
    return {
      doneToday: doneAll.filter((o) => o.d === d).map((o) => o.moveId),
      offeredToday: offered.map((o) => o.moveId),
      hiddenFamilies: new Set(),
      doneRungs,
      studyNight: c.studyNight,
      withHer: c.withHer,
      churchDay: c.church,
      noTimeCeiling: noTimeCeiling(blockOffers as never, blockOutcomes as never, block, day),
      standing: standingSetups(doneAll.filter((o) => told(o.id)?.did === 'done').map((o) => ({ moveId: o.moveId, day: dayOf(o.d) })), {}),
      atOffice: c.office,
      daylight: block !== 'evening',
      pickupTime: c.daycare ? '17:30' : null,
      asleep: false,
      peopleAround: { morning: c.office || c.church, afternoon: c.office, evening: false },
      ...(c.away ? { homeOut: true } : {}),
    }
  }

  // ---- the draw ----------------------------------------------------------------------------------

  /** The prediction's terms at a check-in. */
  private predTerms(a: Answered, d: number, c: DayContext): Float64Array {
    const q = new Float64Array(Q)
    q[0] = 1
    INGREDIENT_IDS.forEach((r, i) => {
      const pos = a.answers[r]
      q[1 + i] = pos === undefined ? 0 : good(r, pos) - 3
    })
    q[7] = a.block === 'morning' ? 1 : 0
    q[8] = a.block === 'afternoon' ? 1 : 0
    q[9] = d / DAYS
    q[10] = c.office ? 1 : 0
    q[11] = c.weekend ? 1 : 0
    q[12] = c.withHer ? 1 : 0
    q[13] = c.shortSleep ? 1 : 0
    return q
  }

  /** What the reading is expected to be over a window from a check-in: its prediction, or its running mean while the record is short. */
  private predict(r: ReadingId, window: Window, slot: number): number {
    if (this.cfg.poorPrediction) return 3
    const m = this.pred.get(`${r}|${window}`)
    const q = this.q.get(slot)
    if (m?.coef && q && m.n >= PRED_MIN) {
      let y = 0
      for (let i = 0; i < Q; i++) y += m.coef[i] * q[i]
      return y
    }
    const run = this.running.get(r)
    return run && run[1] ? run[0] / run[1] : 3
  }

  /** Trains each reading's prediction on every check-in whose window has passed, before the day: earlier data only. */
  private trainPredictions(d: number): void {
    const passed = d * 3 - 1
    for (const window of PRED_WINDOWS) {
      let i = this.predPtr.get(window) ?? 0
      while (i < this.qSlots.length) {
        const slot = this.qSlots[i]
        const outs = reach(Math.floor(slot / 3), BLOCKS[slot % 3], window).map(([x]) => x)
        if (Math.max(...outs) > passed) break
        const q = this.q.get(slot) as Float64Array
        for (const r of INGREDIENT_IDS) {
          let sum = 0
          let n = 0
          for (const x of outs) {
            const pos = this.answers.get(x)?.[r]
            if (pos === undefined) continue
            sum += good(r, pos)
            n++
          }
          if (!n) continue
          const y = sum / n
          const key = `${r}|${window}`
          let m = this.pred.get(key)
          if (!m) {
            m = { XtX: new Float64Array(Q * Q), Xty: new Float64Array(Q), yy: 0, n: 0, coef: null, spread: 0 }
            this.pred.set(key, m)
          }
          for (let a = 0; a < Q; a++) {
            m.Xty[a] += q[a] * y
            for (let b = 0; b < Q; b++) m.XtX[a * Q + b] += q[a] * q[b]
          }
          m.yy += y * y
          m.n++
        }
        i++
      }
      this.predPtr.set(window, i)
    }
    for (const m of this.pred.values()) {
      if (m.n < PRED_MIN) continue
      const A = Float64Array.from(m.XtX)
      for (let a = 1; a < Q; a++) A[a * Q + a] += 1
      const inv = invertSpd(A, Q)
      if (!inv) continue
      const coef = new Float64Array(Q)
      for (let a = 0; a < Q; a++) for (let b = 0; b < Q; b++) coef[a] += inv[a * Q + b] * m.Xty[b]
      m.coef = coef
      // What the prediction leaves unexplained, over the whole record: Σ (y − qβ)² = Σ y² − 2 β·Σ qy + β·(Σ qqᵀ)β.
      let rss = m.yy
      for (let a = 0; a < Q; a++) rss -= 2 * coef[a] * m.Xty[a]
      for (let a = 0; a < Q; a++) for (let b = 0; b < Q; b++) rss += coef[a] * m.XtX[a * Q + b] * coef[b]
      m.spread = m.n > Q ? Math.sqrt(Math.max(rss, 0) / (m.n - Q)) : 0
    }
  }

  /** The spread a reading's outcome keeps after its prediction, from the whole record: the least any test on it may claim. */
  private spreadOf(r: ReadingId, window: Window): number {
    const m = this.pred.get(`${r}|${window}`)
    return m?.coef && m.n >= PRED_MIN ? m.spread : 0
  }

  checkIn(a: Answered, d: number, c: DayContext): OfferMadeB | null {
    const here = slotOf(d, a.block)
    this.answers.set(here, a.answers)
    this.q.set(here, this.predTerms(a, d, c))
    this.qSlots.push(here)
    for (const r of INGREDIENT_IDS) {
      const pos = a.answers[r]
      if (pos === undefined) continue
      const run = this.running.get(r) ?? [0, 0]
      run[0] += good(r, pos)
      run[1]++
      this.running.set(r, run)
    }
    const checkin = { day: a.day, block: a.block, asked: [...blockReadings(a.block)], answers: a.answers, activeMs: 20000, startedAt: '', completedAt: 'x', updatedAt: '' } as unknown as CheckIn
    const situation = situationOf(checkin)
    if (!situation) return null
    const t = this.todayState(a.day, d, a.block, c)
    let candidates = candidatesFor(situation, t).candidates.map((x) => x.id)
    // A day's window is randomized per day: one such move a day. Several days run in blocks with a gap after, one at a time (requirement 6).
    const offeredClasses = new Set(this.offers.filter((o) => o.d === d && o.moveId !== NOTHING).map((o) => clsOf(windowOfMove(o.moveId, situation.target))))
    // The learning week (requirement 11): a running test's move is offered on its own declared reading at every moment it
    // fits, whatever reading is lowest now. Still one suggestion per check-in, no new check-in (Rule 17), no committed
    // practice (Rule 16), and each move at most once a day.
    const weekFits = this.cfg.lw ? this.queue.filter((tt) => this.fitsWeek(tt, situation, t, offeredClasses)) : []
    for (const tt of weekFits) if (tt.lwDays[tt.lwDays.length - 1] !== d) tt.lwDays.push(d)
    if (weekFits.length && d < this.lwUntil) return this.weekDraw(weekFits, a, d, c, here, situation.target)
    candidates = candidates.filter((id) => {
      if (id === NOTHING) return true
      const cls = clsOf(windowOfMove(id, situation.target))
      if (cls === 'day' && offeredClasses.has('day')) return false
      if (cls === 'multi' && (d % 8 !== 0 || d <= this.multiUntil)) return false
      return true
    })
    if (!candidates.includes(NOTHING)) candidates.push(NOTHING)
    const real = candidates.filter((id) => id !== NOTHING)
    const own = new Map(real.map((id) => [id, this.testFor(id, situation.target, windowOfMove(id, situation.target))]))
    // How available each test is: its move eligible at this moment, counted once a day.
    for (const id of real)
      for (const { target, window } of this.readingsOf(id)) {
        const tt = this.testFor(id, target, window)
        if (tt.eligibleDays[tt.eligibleDays.length - 1] !== d) tt.eligibleDays.push(d)
      }
    const active = new Set(this.queue.map((x) => x.moveId))
    // Thompson by expected net benefit on the moment's own reading: the effect when done, times the chance of doing it, less its cost.
    const wins = new Map<string, number>(candidates.map((id) => [id, 0]))
    for (let k = 0; k < this.cfg.draws; k++) {
      let best = NOTHING
      let bestV = 0
      for (const id of real) {
        const tt = own.get(id) as Test
        const v = drawMixture(tt.post, this.rng) * tt.compliance - (COST[moveById(id).effort] ?? 0)
        if (v > bestV) {
          bestV = v
          best = id
        }
      }
      wins.set(best, (wins.get(best) ?? 0) + 1)
    }
    const low = real.filter((id) => {
      const tt = own.get(id) as Test
      return (tt.direction === 'hurts' && (tt.level === 'likely' || tt.level === 'established')) || (tt.level === 'established' && tt.direction === 'little')
    })
    // Requirement 10's floors, each kept whole: "nothing extra", every test's comparison; a running test's move; and every
    // other move its own fair minimum, never shared away as more moves become candidates. The draws share the rest.
    const floors = new Map<string, number>()
    const everyday = (id: string) => (this.cfg.multiFloor !== null && clsOf(windowOfMove(id, situation.target)) === 'multi' ? this.cfg.multiFloor : this.cfg.explore)
    for (const id of candidates) floors.set(id, id === NOTHING ? this.cfg.nothingFloor : low.includes(id) ? this.cfg.explore * this.cfg.lowFloorShare : active.has(id) ? this.cfg.activeFloor : everyday(id))
    // Every set of chances stays valid: floors never take more than 0.9 of the whole.
    const floorSum = [...floors.values()].reduce((a, b) => a + b, 0)
    const scale = floorSum > 0.9 ? 0.9 / floorSum : 1
    const free = 1 - floorSum * scale
    const p = new Map(candidates.map((id) => [id, (floors.get(id) as number) * scale + (free * (wins.get(id) ?? 0)) / this.cfg.draws]))
    let u = this.rng()
    let chosen = NOTHING
    for (const id of candidates) {
      u -= p.get(id) as number
      if (u < 0) {
        chosen = id
        break
      }
    }
    const offerId = this.nextId++
    const decisions: Decision[] = []
    const p0 = p.get(NOTHING) as number
    const isAway = this.away.has(d)
    const ctx: [boolean, boolean, boolean, boolean] = [c.withHer, c.office, c.weekend, c.shortSleep]
    // Every reading of the move is recorded at this moment, whichever reading made it: the record keeps them all, and a running
    // test reads its one pre-declared reading from it (requirement 1).
    for (const id of real) {
      if (chosen !== id && chosen !== NOTHING) continue
      const pm = p.get(id) as number
      const A: 0 | 1 = chosen === id ? 1 : 0
      for (const { target, window } of this.readingsOf(id)) {
        const test = this.testFor(id, target, window)
        const dec: Decision = { d, slot: here, A, pi: pm / (pm + p0), yhat: this.predict(target, window, here), x: this.features(c, A), outSlots: reach(d, a.block, window).map(([s]) => s), seen: null, fraction: null, away: isAway, resolved: false, ctx }
        test.decisions.push(dec)
        decisions.push(dec)
      }
    }
    if (chosen !== NOTHING && clsOf(windowOfMove(chosen, situation.target)) === 'multi') this.multiUntil = d + 7
    this.offers.push({ id: offerId, moveId: chosen, d, block: a.block, decisions })
    return { id: offerId, moveId: chosen, propensity: p.get(chosen) as number, target: situation.target, candidates, lowMoves: low }
  }

  /** A running test the learning week can run at this moment: open, not a committed practice, not believed to hurt, and its move fits on its own reading. */
  private fitsWeek(tt: Test, s: Situation, t: TodayState, offeredClasses: ReadonlySet<Cls>): boolean {
    if (tt.established || tt.cls === 'multi' || committed(tt.moveId) || lowTest(tt)) return false
    if (tt.cls === 'day' && offeredClasses.has('day')) return false
    return screen(moveById(tt.moveId), { ...s, target: tt.target }, t) === null
  }

  /**
   * A learning week's check-in: each running test that fits gets an equal chance, and "nothing extra", every test's
   * comparison, the same chance again, so each test's decision is an even coin between its move and nothing.
   */
  private weekDraw(fits: readonly Test[], a: Answered, d: number, c: DayContext, here: number, situationTarget: ReadingId): OfferMadeB {
    const share = 1 / (fits.length + 1)
    let u = this.rng()
    let chosen = NOTHING
    for (const tt of fits) {
      u -= share
      if (u < 0) {
        chosen = tt.moveId
        break
      }
    }
    const offerId = this.nextId++
    const decisions: Decision[] = []
    const isAway = this.away.has(d)
    const ctx: [boolean, boolean, boolean, boolean] = [c.withHer, c.office, c.weekend, c.shortSleep]
    for (const tt of fits) {
      // The move is available here: every one of its readings is recorded at this moment, as at every other.
      for (const { target, window } of this.readingsOf(tt.moveId)) {
        const test = this.testFor(tt.moveId, target, window)
        if (test.eligibleDays[test.eligibleDays.length - 1] !== d) test.eligibleDays.push(d)
        if (chosen !== tt.moveId && chosen !== NOTHING) continue
        const A: 0 | 1 = chosen === tt.moveId ? 1 : 0
        const dec: Decision = { d, slot: here, A, pi: 0.5, yhat: this.predict(target, window, here), x: this.features(c, A), outSlots: reach(d, a.block, window).map(([sl]) => sl), seen: null, fraction: null, away: isAway, resolved: false, ctx }
        test.decisions.push(dec)
        decisions.push(dec)
      }
    }
    this.offers.push({ id: offerId, moveId: chosen, d, block: a.block, decisions })
    this.lwStats.checkins++
    if (chosen !== NOTHING) this.lwStats.moveOffers++
    const target = chosen === NOTHING ? situationTarget : (fits.find((x) => x.moveId === chosen) as Test).target
    return { id: offerId, moveId: chosen, propensity: share, target, candidates: [...fits.map((x) => x.moveId), NOTHING], lowMoves: [] }
  }

  /** The decision point's terms: the intercept, the centred treatment, and its context interactions. */
  private features(c: DayContext, A: 0 | 1): Float64Array {
    const x = new Float64Array(P)
    x[0] = 1
    const at = A - this.cfg.pTilde
    x[IDX_BETA] = at
    const vals = [c.withHer, c.office, c.weekend, c.shortSleep]
    CONTEXTS.forEach((k, i) => {
      x[IDX_BETA + 1 + i] = at * ((vals[i] ? 1 : 0) - CENTRE[k])
    })
    return x
  }

  respond(offerId: number, r: Response): void {
    this.outcomes.set(offerId, r)
    const o = this.offers[offerId - 1]
    if (!o) return
    for (const dec of o.decisions) {
      dec.seen = r.seen
      if (dec.A === 1 && r.answered) dec.fraction = r.did === 'done' ? 1 : r.did === 'partly' ? 0.5 : 0
    }
  }

  // ---- learning ----------------------------------------------------------------------------------

  /** The daily run: resolve every decision whose outcome slots have passed, fit, believe, and call. */
  learn(d: number): CallB[] {
    this.today = d
    if (this.cfg.trackRule) this.tighten()
    this.trainPredictions(d)
    const lastSlotPassed = d * 3 - 1
    for (const t of this.tests.values()) {
      for (const dec of t.decisions) {
        if (dec.resolved) continue
        if (Math.max(...dec.outSlots) > lastSlotPassed) continue
        dec.resolved = true
        if (dec.A === 1 && dec.fraction !== null && dec.seen) {
          t.comp += dec.fraction
          t.compN++
        }
        if (!dec.seen || dec.away) continue
        let sum = 0
        let n = 0
        for (const s of dec.outSlots) {
          const pos = this.answers.get(s)?.[t.target]
          if (pos === undefined) continue
          sum += good(t.target, pos)
          n++
        }
        if (!n) continue
        // The outcome less what the reading's prediction expected: the prediction cuts noise, never adds evidence.
        const y = sum / n - dec.yhat
        const w = dec.A ? this.cfg.pTilde / dec.pi : (1 - this.cfg.pTilde) / (1 - dec.pi)
        let acc = t.days.get(dec.d)
        if (!acc) {
          acc = { S: new Float64Array(P * P), E: new Float64Array(P * P), b: new Float64Array(P), yy: 0, w1: 0, w1sq: 0, w0: 0, w0sq: 0, n1: 0, n0: 0, byCtx: CONTEXTS.map(() => [[0, 0], [0, 0]]) }
          t.days.set(dec.d, acc)
        }
        const x = dec.x
        for (let i = 0; i < P; i++) {
          const wi = w * x[i]
          if (wi === 0) continue
          acc.b[i] += wi * y
          for (let j = 0; j < P; j++) acc.S[i * P + j] += wi * x[j]
        }
        // What the recorded chances promise for this decision, whatever the draw gave: E[w] = 1 on the intercept,
        // E[w (A − p̃)²] = p̃(1 − p̃) on the treatment terms, and E[w (A − p̃)] = 0 across.
        const z = [1, ...CONTEXTS.map((k, i) => (dec.ctx[i] ? 1 : 0) - CENTRE[k])]
        const pq = this.cfg.pTilde * (1 - this.cfg.pTilde)
        acc.E[0] += 1
        for (let i = 0; i < z.length; i++) for (let j = 0; j < z.length; j++) acc.E[(IDX_BETA + i) * P + IDX_BETA + j] += pq * z[i] * z[j]
        acc.yy += w * y * y
        if (dec.A) {
          acc.w1 += w
          acc.w1sq += w * w
          acc.n1++
          t.n1++
        } else {
          acc.w0 += w
          acc.w0sq += w * w
          acc.n0++
          t.n0++
        }
        dec.ctx.forEach((v, k) => {
          acc.byCtx[k][v ? 1 : 0][dec.A]++
        })
      }
    }
    const fitted = [...this.tests.values()].filter((t) => t.n1 >= 1 && t.n0 >= 1)
    for (const t of fitted) {
      t.compliance = (t.comp + 0.6 * 4) / (t.compN + 4)
      const decayed = this.fit(t, 0, this.cfg.halfLife)
      t.fitAll = this.fit(t, t.csStart, Infinity)
      t.theta = decayed ? decayed.beta / t.compliance : null
      // The effect when done is the effect of offering over the share done, and both are estimates (the delta method).
      const compVar = (t.compliance * (1 - t.compliance)) / (t.compN + 4)
      t.thetaSe = decayed ? Math.sqrt(decayed.se ** 2 / t.compliance ** 2 + (decayed.beta ** 2 * compVar) / t.compliance ** 4) : null
    }
    // Tags lend to their moves: the precision-weighted shift of the tag's other moves from research, shrunk (requirement 7).
    const shiftOf = this.cfg.pool ? this.tagShifts(fitted) : () => 0
    const calls: CallB[] = []
    for (const t of this.tests.values()) {
      t.post = mixturePosterior(this.priorFor(t, shiftOf(t)), t.theta, t.thetaSe)
      this.call(t)
      if ((t.queuedAt !== null || this.cfg.declareAll) && t.n1 >= 1 && t.n0 >= 1) calls.push(this.callOf(t))
    }
    this.trackDay(d)
    this.tendQueue(d)
    this.tendWeek(d)
    return calls
  }

  /**
   * The learning week's invitation (requirement 11; opt-in each time, the owner's decision of 2026-10-10). It earns its
   * place (Rule 3): it is asked only when a running test, still open, fitted a check-in on at least three of the last
   * seven days, so the week would run it, and never sooner than `gap` days after the last week or the last no.
   */
  private tendWeek(d: number): void {
    const lw = this.cfg.lw
    if (!lw) return
    if (lw.always) {
      if (this.lwUntil !== Infinity) {
        this.lwUntil = Infinity
        this.tendQueue(d)
      }
      this.lwStats.days++
      return
    }
    if (d < this.lwUntil) {
      this.lwStats.days++
      return
    }
    if (d < this.lwNext) return
    const worth = this.queue.some((t) => !t.established && t.cls !== 'multi' && !committed(t.moveId) && !lowTest(t) && t.lwDays.filter((x) => x > d - 7).length >= 3)
    if (!worth) return
    this.lwStats.invited++
    if (this.optIn && this.optIn() < lw.accept) {
      this.lwStats.accepted++
      this.lwStats.days++
      this.lwUntil = d + lw.length
      this.lwNext = d + lw.length + lw.gap
      // A week runs up to its own number of tests.
      this.tendQueue(d)
    } else this.lwNext = d + (lw.gapNo ?? lw.gap)
  }

  /**
   * The test queue (requirement 11): a test leaves once it is established, or after its time with no
   * conclusion; the free places go to the tests whose answer matters most: a move often available,
   * whose belief says it may help on that reading, not yet settled. A test is one reading of one move,
   * declared as it enters, before any of its own sequence (requirement 1): the move's other readings
   * are not tested alongside it, and a reading declared up front is its move's test. One test per move
   * at a time, each test once. At most queueCap tests ever run, so the system's error rate is shared
   * by a known number of them.
   */
  private tendQueue(d: number): void {
    this.queue = this.queue.filter((t) => {
      if (t.established) return false
      if (this.cfg.pinned.includes(t.key)) return true
      const age = d - (t.queuedAt as number)
      // A test that looks promising keeps its place, up to three times as long; one that does not leaves at its time.
      const promising = t.direction === 'helps' && (t.level === 'likely' || t.level === 'established' || (this.cfg.keepEarly && t.level === 'early'))
      if (age >= this.cfg.queueMaxDays * (promising ? 3 : 1)) {
        t.expired = true
        return false
      }
      return true
    })
    // Sensitivity only: a pinned test enters the queue the first day it exists, ahead of the rest.
    for (const key of this.cfg.pinned) {
      const t = this.tests.get(key)
      if (!t || t.queuedAt !== null) continue
      this.enter(t, d)
      this.queue.unshift(t)
    }
    // A learning week runs two or three tests (requirement 11); the rest of the time the queue keeps its own size.
    const size = this.cfg.lw && d < this.lwUntil ? Math.max(this.cfg.queueSize, this.cfg.lw.tests) : this.cfg.queueSize
    // With every test declared on day one the error rate is already shared by them all, so the cap does not bind.
    const capped = () => !this.cfg.declareAll && this.queuedEver >= this.cfg.queueCap
    if (this.queue.length >= size || capped()) return
    const busy = new Set(this.queue.map((t) => t.moveId))
    const declaredWaiting = new Set([...this.tests.values()].filter((t) => t.queuedAt === null && this.isDeclared(t)).map((t) => t.moveId))
    const options = [...this.tests.values()].filter((t) => t.queuedAt === null && !busy.has(t.moveId) && t.cls !== 'multi' && (!declaredWaiting.has(t.moveId) || this.isDeclared(t)))
    const score = (t: Test) => {
      const recent = t.eligibleDays.filter((x) => x > d - 28).length
      if (this.cfg.queueScore === 'benefit') return recent * Math.max(0, pMean(t.post) * t.compliance)
      const sd = Math.sqrt(Math.max(0, t.post.w.reduce((a, w, k) => a + w * (t.post.s[k] ** 2 + t.post.m[k] ** 2), 0) - pMean(t.post) ** 2))
      return recent * Math.max(0, pMean(t.post) * t.compliance + 0.5 * sd)
    }
    options.sort((a, b) => score(b) - score(a))
    for (const t of options) {
      if (this.queue.length >= size || capped() || busy.has(t.moveId)) continue
      if (t.eligibleDays.filter((x) => x > d - 28).length < 4) continue
      this.enter(t, d)
      this.queue.push(t)
      busy.add(t.moveId)
    }
  }

  /** A test enters the queue: its reading is declared now, and its confidence sequence starts from today (from day one when every test was declared then). */
  private enter(t: Test, d: number): void {
    t.queuedAt = d
    if (!this.cfg.declareAll) t.csStart = d
    this.queuedEver++
  }

  /**
   * WCLS over the days from `from`, each day weighted by a half-life: the effect of offering, the
   * context deviations, their standard errors from day-clustered scores, never smaller than the
   * arms' effective sizes and the residual spread allow, and the confidence sequences' half-widths.
   */
  private fit(t: Test, from: number, halfLife: number): Fit | null {
    let ht = this.cfg.estimator === 'ht'
    if (this.cfg.estimator === 'hybrid') {
      let a1 = 0
      let a0 = 0
      for (const [dd, acc] of t.days) {
        if (dd < from) continue
        a1 += acc.n1
        a0 += acc.n0
      }
      ht = a1 >= this.cfg.hybridMin && a0 >= this.cfg.hybridMin
    }
    // The design the estimate divides by ('wcls': as the draws fell; 'ht': as the chances promise), and the realized one, for the residual spread.
    const M = new Float64Array(P * P)
    const R = new Float64Array(P * P)
    const v = new Float64Array(P)
    const days: { w: number; acc: DayAcc }[] = []
    let yy = 0
    let w1 = 0
    let w1sq = 0
    let w0 = 0
    let w0sq = 0
    const ctxN: [number, number][][] = CONTEXTS.map(() => [[0, 0], [0, 0]])
    for (const [dd, acc] of t.days) {
      if (dd < from) continue
      const w = Number.isFinite(halfLife) ? 0.5 ** ((this.today - dd) / halfLife) : 1
      days.push({ w, acc })
      for (let i = 0; i < P * P; i++) {
        M[i] += w * (ht ? acc.E[i] : acc.S[i])
        R[i] += w * acc.S[i]
      }
      for (let i = 0; i < P; i++) v[i] += w * acc.b[i]
      yy += w * acc.yy
      w1 += w * acc.w1
      w1sq += w * w * acc.w1sq
      w0 += w * acc.w0
      w0sq += w * w * acc.w0sq
      acc.byCtx.forEach((vals, k) => {
        for (const val of [0, 1]) {
          ctxN[k][val][0] += vals[val][0]
          ctxN[k][val][1] += vals[val][1]
        }
      })
    }
    const n = days.length
    if (n < 2 || !(w1 > 0) || !(w0 > 0)) return null
    for (let i = 0; i < P; i++) M[i * P + i] += RIDGE[i]
    const Minv = invertSpd(M, P)
    if (!Minv) return null
    const theta = new Float64Array(P)
    for (let i = 0; i < P; i++) for (let j = 0; j < P; j++) theta[i] += Minv[i * P + j] * v[j]
    // The residual spread: Σ w (y − xθ)² = Σ w y² − 2 θ·v + θ·Rθ, over the realized design.
    let rss = yy
    for (let i = 0; i < P; i++) rss -= 2 * theta[i] * v[i]
    for (let i = 0; i < P; i++) for (let j = 0; j < P; j++) rss += theta[i] * R[i * P + j] * theta[j]
    // A few decisions can sit close by chance: the spread is never below what the reading's prediction leaves over the whole record.
    const sigma = Math.max(Math.sqrt(Math.max(rss, 1e-9) / (w1 + w0)), this.spreadOf(t.target, t.window))
    const neff1 = (w1 * w1) / w1sq
    const neff0 = (w0 * w0) / w0sq
    // Day-clustered scores, each day's own: s_d = b_d − S_d θ (with the promised design for 'ht').
    const infl: Float64Array[] = []
    const s = new Float64Array(P)
    for (const { w, acc } of days) {
      const D = ht ? acc.E : acc.S
      for (let i = 0; i < P; i++) {
        let r = acc.b[i]
        for (let j = 0; j < P; j++) r -= D[i * P + j] * theta[j]
        s[i] = w * r
      }
      const psi = new Float64Array(P)
      for (let i = 0; i < P; i++) for (let j = 0; j < P; j++) psi[i] += Minv[i * P + j] * s[j]
      infl.push(psi)
    }
    const varOf = (a: Float64Array): number => {
      let total = 0
      for (const psi of infl) {
        let x = 0
        for (let i = 0; i < P; i++) x += a[i] * psi[i]
        total += x * x
      }
      return total * (n / (n - 1))
    }
    const unit = (i: number) => {
      const a = new Float64Array(P)
      a[i] = 1
      return a
    }
    // Never more certain than the arms' own sizes allow: the treatment term scales the arm difference by its centring.
    const naive = sigma * Math.sqrt(1 / neff1 + 1 / neff0)
    const se = Math.max(Math.sqrt(varOf(unit(IDX_BETA))), naive)
    const alpha = this.ratesOf(t).est
    const half = (sd: number) => csHalfWidth(sd * Math.sqrt(n), n, alpha, this.cfg.csNStar)
    const gamma: number[] = []
    const gammaSe: number[] = []
    const ctxEst: [number, number][] = []
    const ctxCs: [number, number][] = []
    CONTEXTS.forEach((k, i) => {
      const gi = IDX_BETA + 1 + i
      const [[n00, n01], [n10, n11]] = ctxN[i]
      const naiveG = sigma * Math.sqrt(1 / Math.max(n00, 1) + 1 / Math.max(n01, 1) + 1 / Math.max(n10, 1) + 1 / Math.max(n11, 1))
      gamma.push(theta[gi])
      gammaSe.push(Math.max(Math.sqrt(varOf(unit(gi))), naiveG))
      const pair = [0, 1].map((val) => {
        const a = unit(IDX_BETA)
        a[gi] = val - CENTRE[k]
        let est = 0
        for (let j = 0; j < P; j++) est += a[j] * theta[j]
        const [m0, m1] = ctxN[i][val]
        const naiveV = sigma * Math.sqrt(1 / Math.max(m0, 1) + 1 / Math.max(m1, 1))
        // Each context value's call shares the test's error rate with the other seven.
        return [est, csHalfWidth(Math.max(Math.sqrt(varOf(a)), naiveV) * Math.sqrt(n), n, alpha / (2 * CONTEXTS.length), this.cfg.csNStar)]
      })
      ctxEst.push([pair[0][0], pair[1][0]])
      ctxCs.push([pair[0][1], pair[1][1]])
    })
    return { beta: theta[IDX_BETA], se, csHalf: half(se), nDays: n, sigmaDay: se * Math.sqrt(n), gamma, gammaSe, ctxEst, ctxCs, ctxN }
  }

  private tagShifts(fitted: readonly Test[]): (t: Test) => number {
    const tagsOf = (id: string) => (hasMove(id) ? [...moveById(id).tags.ingredients, ...moveById(id).tags.reward] : [])
    const byTag = new Map<string, { num: number; den: number; parts: Map<string, [number, number]> }>()
    for (const t of fitted) {
      if (t.theta === null || t.thetaSe === null || !(t.thetaSe > 0) || t.n1 < this.cfg.minPerArm) continue
      const mu = hasMove(t.moveId) ? moveById(t.moveId).prior.effect : 0
      const w = 1 / t.thetaSe ** 2
      for (const tag of tagsOf(t.moveId)) {
        const e = byTag.get(`${tag}|${t.target}`) ?? { num: 0, den: 0, parts: new Map() }
        e.num += w * (t.theta - mu)
        e.den += w
        e.parts.set(t.key, [w * (t.theta - mu), w])
        byTag.set(`${tag}|${t.target}`, e)
      }
    }
    const k = 1 / this.cfg.tagSd ** 2
    return (t: Test) => {
      const tags = tagsOf(t.moveId)
      if (!tags.length) return 0
      let total = 0
      for (const tag of tags) {
        const e = byTag.get(`${tag}|${t.target}`)
        if (!e) continue
        // Leave the move's own evidence out of what its tags lend it.
        const own = e.parts.get(t.key) ?? [0, 0]
        total += (e.num - own[0]) / (e.den - own[1] + k)
      }
      return total / tags.length
    }
  }

  /** The ladder (requirement 8): established from the confidence sequence on randomized offers only; likely and early sign from the belief; a call newer evidence contradicts steps down, marked revised. */
  private call(t: Test): void {
    const cfg = this.cfg
    const pPos = pAbove(t.post, 0)
    const pNeg = 1 - pPos
    const pLittle = pWithin(t.post, cfg.delta)
    if (t.established && (t.established === 'helps' ? pPos : t.established === 'hurts' ? pNeg : pLittle) < 0.5) {
      t.established = null
      t.revised = true
      t.csStart = this.today
      t.fitAll = this.fit(t, t.csStart, Infinity)
    }
    if (t.queuedAt === null && !cfg.declareAll) {
      t.level = 'none'
      t.direction = null
      t.ctxCalls = []
      return
    }
    const f = t.fitAll
    // Decisions per arm within the sequence's own range: what every rung rests on.
    const n1 = f ? f.ctxN[0][0][1] + f.ctxN[0][1][1] : 0
    const n0 = f ? f.ctxN[0][0][0] + f.ctxN[0][1][0] : 0
    const enough = !!f && n1 >= cfg.minPerArm && n0 >= cfg.minPerArm && f.nDays >= cfg.minDaysCall
    if (!t.established && f && f.nDays >= cfg.minDays) {
      if (n1 >= cfg.nEst && n0 >= cfg.nEst) {
        const lo = f.beta - f.csHalf
        const hi = f.beta + f.csHalf
        const margin = cfg.delta * t.compliance
        if (lo > 0 && pPos >= 0.5) t.established = 'helps'
        else if (hi < 0 && pNeg >= 0.5) t.established = 'hurts'
        else if (lo > -margin && hi < margin && pLittle >= 0.5) t.established = 'little'
      }
    }
    if (t.established) {
      t.level = 'established'
      t.direction = t.established
    } else if (!enough || !f) {
      t.level = 'none'
      t.direction = null
    } else {
      // A lower rung needs both: the belief's direction, and the record's own anytime-valid sequence at the rung's error rate.
      const rung = (alpha: number, tau: number): Direction => {
        const h = csHalfWidth(f.sigmaDay, f.nDays, alpha, cfg.csNStar)
        const margin = cfg.delta * t.compliance
        if (f.beta - h > 0 && pPos >= tau) return 'helps'
        if (f.beta + h < 0 && pNeg >= tau) return 'hurts'
        if (f.beta - h > -margin && f.beta + h < margin && pLittle >= tau) return 'little'
        return null
      }
      const rates = this.ratesOf(t)
      const likely = rung(rates.likely, this.tauOf('likely'))
      const early = likely ? null : rung(rates.early, this.tauOf('early'))
      t.level = likely ? 'likely' : early ? 'early' : 'none'
      t.direction = likely ?? early
    }
    // Contexts: a deviation the belief is sure of opens calls for each of the context's values; otherwise the general call stands alone.
    t.ctxCalls = []
    if (!enough || !f || t.thetaSe === null) return
    const c = t.compliance
    CONTEXTS.forEach((k, i) => {
      const g = f.gamma[i] / c
      const gs = f.gammaSe[i] / c
      if (!(gs > 0)) return
      const vPost = 1 / (1 / cfg.ctxSd ** 2 + 1 / gs ** 2)
      const mPost = vPost * (g / gs ** 2)
      const pSure = Math.max(phi(mPost / Math.sqrt(vPost)), 1 - phi(mPost / Math.sqrt(vPost)))
      if (pSure < cfg.ctxSure) return
      for (const val of [0, 1] as const) {
        const est = pMean(t.post) + mPost * (val - CENTRE[k])
        const sd = Math.sqrt((t.thetaSe as number) ** 2 + vPost * (val - CENTRE[k]) ** 2)
        const pp = 1 - phi(-est / sd)
        const lit = phi((cfg.delta - est) / sd) - phi((-cfg.delta - est) / sd)
        const lo = f.ctxEst[i][val] - f.ctxCs[i][val]
        const hi = f.ctxEst[i][val] + f.ctxCs[i][val]
        const [m0, m1] = f.ctxN[i][val]
        let level: Level = 'none'
        let direction: Direction = null
        if (f.nDays >= cfg.minDays && m0 >= cfg.nEst && m1 >= cfg.nEst && (lo > 0 || hi < 0)) {
          level = 'established'
          direction = lo > 0 ? 'helps' : 'hurts'
        } else if (m0 >= cfg.minPerArm && m1 >= cfg.minPerArm) {
          const opts: [number, Direction][] = [[pp, 'helps'], [1 - pp, 'hurts'], [lit, 'little']]
          opts.sort((a, b) => b[0] - a[0])
          level = opts[0][0] >= this.tauOf('likely') ? 'likely' : opts[0][0] >= this.tauOf('early') ? 'early' : 'none'
          direction = level === 'none' ? null : opts[0][1]
        }
        const p = direction === 'helps' ? pp : direction === 'hurts' ? 1 - pp : direction === 'little' ? lit : 0
        t.ctxCalls.push({ context: k, value: val, level, direction, est, p })
      }
    })
  }

  /** The probability of the direction a test calls, from its belief; 0 while it calls none. */
  private pDirOf(t: Test): number {
    if (t.direction === null) return 0
    const pPos = pAbove(t.post, 0)
    return t.direction === 'helps' ? pPos : t.direction === 'hurts' ? 1 - pPos : pWithin(t.post, this.cfg.delta)
  }

  private callOf(t: Test): CallB {
    const f = t.fitAll
    const pDir = this.pDirOf(t)
    return { key: t.key, moveId: t.moveId, target: t.target, cls: t.cls, window: t.window, level: t.level, direction: t.direction, theta: t.theta, thetaSe: t.thetaSe, itt: f?.beta ?? null, csLo: f ? f.beta - f.csHalf : null, csHi: f ? f.beta + f.csHalf : null, compliance: t.compliance, nDays: f?.nDays ?? 0, n1: t.n1, n0: t.n0, revised: t.revised, ctx: t.ctxCalls, pDir }
  }

  /** A test's state as a call reads, whether or not it is running. */
  callOfTest(t: Test): CallB {
    return this.callOf(t)
  }

  /** The tests as they stand, for the metrics' deeper reads (the posterior, the decisions). */
  testsNow(): ReadonlyMap<string, Test> {
    return this.tests
  }
}

/** What research expects of a move, as its part of the error rate when it is shared by research: never under 0.05 step. */
const weightOf = (moveId: string): number => Math.max(hasMove(moveId) ? moveById(moveId).prior.effect : 0, 0.05)

/** A test already believed to hurt, or settled at little difference: the floors give it only a sliver, and the learning week none. */
const lowTest = (t: Test): boolean => (t.direction === 'hurts' && (t.level === 'likely' || t.level === 'established')) || (t.level === 'established' && t.direction === 'little')

function drawMixture(p: { w: number[]; m: number[]; s: number[] }, rng: Rng): number {
  let u = rng()
  for (let k = 0; k < p.w.length; k++) {
    u -= p.w[k]
    if (u < 0 || k === p.w.length - 1) return p.m[k] + p.s[k] * gauss(rng)
  }
  return 0
}

const DAY_STRINGS = Array.from({ length: DAYS + 20 }, (_, d) => new Date(Date.UTC(2031, 0, 6 + d)).toISOString().slice(0, 10))
const dayOf = (d: number) => DAY_STRINGS[d] ?? new Date(Date.UTC(2031, 0, 6 + d)).toISOString().slice(0, 10)
