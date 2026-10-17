import { BLOCKS, type Block } from '../src/blocks'
import { hasMove, liveMoves, moveById, rungOf, type Window } from '../src/catalogue'
import type { CheckIn } from '../src/db'
import { noTimeCeiling, PRIOR_SD } from '../src/learning'
import { candidatesFor, NOTHING, situationOf, standingSetups, type TodayState } from '../src/offers'
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
}

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
  ctxCalls: { context: string; value: 0 | 1; level: Level; direction: Direction; est: number }[]
  /** The day the test entered the queue, null while it never has; and whether it left without a conclusion. */
  queuedAt: number | null
  expired: boolean
  /** Eligible moments of the move, by day: how available it is. */
  eligibleDays: number[]
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
  ctx: { context: string; value: 0 | 1; level: Level; direction: Direction; est: number }[]
  /** The probability of the direction called, from the belief. */
  pDir: number
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
  /** The tests running now, and how many have ever run. */
  private queue: Test[] = []
  private queuedEver = 0
  /** The prediction per reading and window (requirement 4): each answered check-in's terms, the pairs trained so far, the fits, and the spread the fit leaves. */
  private readonly q = new Map<number, Float64Array>()
  private readonly qSlots: number[] = []
  private readonly predPtr = new Map<Window, number>()
  private readonly pred = new Map<string, { XtX: Float64Array; Xty: Float64Array; yy: number; n: number; coef: Float64Array | null; spread: number }>()
  private readonly running = new Map<ReadingId, [number, number]>()

  constructor(rng: Rng, cfg: BConfig = B_DEFAULT, awayDays: ReadonlySet<number> = new Set(), declared: { moveId: string; target: ReadingId; window: Window }[] = []) {
    this.rng = rng
    this.cfg = cfg
    this.away = awayDays
    this.declared = declared
    // Each test the queue may ever run, one pre-declared reading, gets an equal part of the system's error rate.
    this.alphaTest = cfg.alphaSystem / cfg.queueCap
  }

  private testFor(moveId: string, target: ReadingId, window: Window): Test {
    const key = `${moveId}|${target}|${window}`
    let t = this.tests.get(key)
    if (!t) {
      t = { key, moveId, target, cls: clsOf(window), window, decisions: [], days: new Map(), n1: 0, n0: 0, comp: 0, compN: 0, csStart: 0, established: null, revised: false, post: { w: [1], m: [0], s: [1] }, theta: null, thetaSe: null, compliance: 0.6, fitAll: null, level: 'none', direction: null, ctxCalls: [], queuedAt: null, expired: false, eligibleDays: [] }
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
    const sd = m ? PRIOR_SD[m.source.strength] : 1
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
    for (const id of candidates) floors.set(id, id === NOTHING ? this.cfg.nothingFloor : low.includes(id) ? this.cfg.explore * this.cfg.lowFloorShare : active.has(id) ? this.cfg.activeFloor : this.cfg.explore)
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
          acc = { S: new Float64Array(P * P), b: new Float64Array(P), yy: 0, w1: 0, w1sq: 0, w0: 0, w0sq: 0, n1: 0, n0: 0, byCtx: CONTEXTS.map(() => [[0, 0], [0, 0]]) }
          t.days.set(dec.d, acc)
        }
        const x = dec.x
        for (let i = 0; i < P; i++) {
          const wi = w * x[i]
          if (wi === 0) continue
          acc.b[i] += wi * y
          for (let j = 0; j < P; j++) acc.S[i * P + j] += wi * x[j]
        }
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
      if (t.queuedAt !== null && t.n1 >= 1 && t.n0 >= 1) calls.push(this.callOf(t))
    }
    this.tendQueue(d)
    return calls
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
      const promising = t.direction === 'helps' && (t.level === 'likely' || t.level === 'established')
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
    if (this.queue.length >= this.cfg.queueSize || this.queuedEver >= this.cfg.queueCap) return
    const busy = new Set(this.queue.map((t) => t.moveId))
    const declaredWaiting = new Set([...this.tests.values()].filter((t) => t.queuedAt === null && this.isDeclared(t)).map((t) => t.moveId))
    const options = [...this.tests.values()].filter((t) => t.queuedAt === null && !busy.has(t.moveId) && t.cls !== 'multi' && (!declaredWaiting.has(t.moveId) || this.isDeclared(t)))
    const score = (t: Test) => {
      const recent = t.eligibleDays.filter((x) => x > d - 28).length
      const sd = Math.sqrt(Math.max(0, t.post.w.reduce((a, w, k) => a + w * (t.post.s[k] ** 2 + t.post.m[k] ** 2), 0) - pMean(t.post) ** 2))
      return recent * Math.max(0, pMean(t.post) * t.compliance + 0.5 * sd)
    }
    options.sort((a, b) => score(b) - score(a))
    for (const t of options) {
      if (this.queue.length >= this.cfg.queueSize || this.queuedEver >= this.cfg.queueCap || busy.has(t.moveId)) continue
      if (t.eligibleDays.filter((x) => x > d - 28).length < 4) continue
      this.enter(t, d)
      this.queue.push(t)
      busy.add(t.moveId)
    }
  }

  /** A test enters the queue: its reading is declared now, and its confidence sequence starts from today. */
  private enter(t: Test, d: number): void {
    t.queuedAt = d
    t.csStart = d
    this.queuedEver++
  }

  /**
   * WCLS over the days from `from`, each day weighted by a half-life: the effect of offering, the
   * context deviations, their standard errors from day-clustered scores, never smaller than the
   * arms' effective sizes and the residual spread allow, and the confidence sequences' half-widths.
   */
  private fit(t: Test, from: number, halfLife: number): Fit | null {
    const M = new Float64Array(P * P)
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
      for (let i = 0; i < P * P; i++) M[i] += w * acc.S[i]
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
    // The residual spread: Σ w (y − xθ)² = Σ w y² − 2 θ·v + θ·Mθ (the ridge aside).
    let rss = yy
    for (let i = 0; i < P; i++) rss -= 2 * theta[i] * v[i]
    for (let i = 0; i < P; i++) for (let j = 0; j < P; j++) rss += theta[i] * (M[i * P + j] - (i === j ? RIDGE[i] : 0)) * theta[j]
    // A few decisions can sit close by chance: the spread is never below what the reading's prediction leaves over the whole record.
    const sigma = Math.max(Math.sqrt(Math.max(rss, 1e-9) / (w1 + w0)), this.spreadOf(t.target, t.window))
    const neff1 = (w1 * w1) / w1sq
    const neff0 = (w0 * w0) / w0sq
    // Day-clustered scores, each day's own: s_d = b_d − S_d θ.
    const infl: Float64Array[] = []
    const s = new Float64Array(P)
    for (const { w, acc } of days) {
      for (let i = 0; i < P; i++) {
        let r = acc.b[i]
        for (let j = 0; j < P; j++) r -= acc.S[i * P + j] * theta[j]
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
    const half = (sd: number) => csHalfWidth(sd * Math.sqrt(n), n, this.alphaTest, this.cfg.csNStar)
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
        return [est, csHalfWidth(Math.max(Math.sqrt(varOf(a)), naiveV) * Math.sqrt(n), n, this.alphaTest / (2 * CONTEXTS.length), this.cfg.csNStar)]
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
    if (t.queuedAt === null) {
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
      const likely = rung(cfg.alphaLikely, cfg.tauLikely)
      const early = likely ? null : rung(cfg.alphaEarly, cfg.tauEarly)
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
          level = opts[0][0] >= cfg.tauLikely ? 'likely' : opts[0][0] >= cfg.tauEarly ? 'early' : 'none'
          direction = level === 'none' ? null : opts[0][1]
        }
        t.ctxCalls.push({ context: k, value: val, level, direction, est })
      }
    })
  }

  private callOf(t: Test): CallB {
    const f = t.fitAll
    const pPos = pAbove(t.post, 0)
    const pDir = t.direction === 'helps' ? pPos : t.direction === 'hurts' ? 1 - pPos : t.direction === 'little' ? pWithin(t.post, this.cfg.delta) : 0
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
