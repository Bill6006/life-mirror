import { addDays, BLOCKS, type Block } from '../src/blocks'
import { hasMove, moveById, NOTHING, type Window } from '../src/catalogue'
import { blockReadings, type ReadingId } from '../src/readings'
import { INGREDIENTS } from '../src/score'
import { gauss, stream, type Rng } from './stats'

// A simulated person for the stress test (stage 2; the criteria frozen 2026-10-16 in
// REVIEW_EXECUTION_PLAN.md). Real-shaped weeks, three check-ins a day, six readings that drift
// from block to block (so a low tends to rebound), a rhythm by block, the day's context, noise,
// and answers as anchors from 1 to 5. Every random draw that does not depend on what an engine
// offers is made up front from the person's seed, so two engines meet the same person: the same
// days, the same moods, the same missed check-ins (common random numbers).

export const DAYS = 180
/** A Monday, far from any real date in the owner's record. */
export const START = '2031-01-06'
export const INGREDIENT_READINGS = Object.keys(INGREDIENTS) as ReadingId[]

export interface PersonParams {
  /** The chance a check-in is answered, by block. */
  checkin: Record<Block, number>
  /** A move offered is seen; of those seen, done or partly; the rest are No. */
  seen: number
  done: number
  partly: number
  /** An answer about a move never given. */
  unanswered: number
  /** The drift: autocorrelation from one block to the next, and its stationary spread, in steps. */
  rho: number
  stateSd: number
  /** Noise in each answer, in steps. */
  noiseSd: number
  /** How strongly the six readings move together. */
  corr: number
  /** The rhythm by block, times this. */
  rhythmScale: number
  /** Days with her: 'most' (every day but alternate weekends) or 'half' (every other day). */
  withHer: 'most' | 'half'
  /** Short sleep on this share of nights. */
  shortSleep: number
  /** Adherence leaning on energy: the logit of done rises by this per step of energy (0: none). */
  adherenceOnEnergy: number
  /** Office days a week, and from which day a second pattern takes over (changing context). */
  officeDays: number
  officeDaysLater?: { from: number; days: number }
  /** Days away on a trip, numbered from 0. */
  away: readonly number[]
  /** Informative missingness: a check-in is answered less often when mood runs low, by this logit per step (0: none). */
  missOnLowMood: number
}

export const BASE: PersonParams = {
  checkin: { morning: 0.9, afternoon: 0.6, evening: 0.85 },
  seen: 0.9,
  done: 0.55,
  partly: 0.15,
  unanswered: 0.1,
  rho: 0.6,
  stateSd: 0.6,
  noiseSd: 0.45,
  corr: 0.4,
  rhythmScale: 1,
  withHer: 'most',
  shortSleep: 0.2,
  adherenceOnEnergy: 0,
  officeDays: 2,
  away: [],
  missOnLowMood: 0,
}

/** A move's true effect on one reading, in steps in that reading's good direction, when done; half when partly done. */
export interface TrueEffect {
  e: number
  /** From this day on the effect becomes another (a response that changes). */
  change?: { day: number; e: number }
  /** The window it lands in, overriding the move's own. */
  window?: Window
  /** Only on days with this context; nothing otherwise. */
  only?: 'withHer'
  /** A multi-day effect's carryover: each later day keeps this share of the day before (seven days in all). */
  carry?: number
}
export type Truth = ReadonlyMap<string, Partial<Record<ReadingId, TrueEffect>>>

export interface DayContext {
  day: string
  weekday: number
  weekend: boolean
  office: boolean
  church: boolean
  studyNight: boolean
  withHer: boolean
  daycare: boolean
  shortSleep: boolean
  away: boolean
}

export interface Answered {
  day: string
  block: Block
  answers: Partial<Record<ReadingId, number>>
}

export interface Response {
  seen: boolean
  /** What was done, whether or not it was told: null when not seen. */
  did: 'done' | 'partly' | 'no' | null
  why: 'noTime' | 'didntWant' | null
  /** Whether the answer was ever given. */
  answered: boolean
}

/** The rhythm by block in each reading's good direction, in steps. */
const RHYTHM: Record<string, Record<Block, number>> = {
  energy: { morning: 0.2, afternoon: -0.3, evening: -0.1 },
  mood: { morning: 0, afternoon: 0, evening: 0.1 },
  focus: { morning: 0.2, afternoon: 0, evening: -0.3 },
  stress: { morning: 0.1, afternoon: -0.2, evening: 0 },
  overwhelm: { morning: 0, afternoon: -0.2, evening: 0.1 },
  irritation: { morning: 0, afternoon: -0.1, evening: -0.1 },
}

const slotOf = (d: number, b: Block) => d * 3 + BLOCKS.indexOf(b)
const clamp15 = (x: number) => Math.min(5, Math.max(1, Math.round(x)))
const logistic = (x: number) => 1 / (1 + Math.exp(-x))
const logit = (p: number) => Math.log(p / (1 - p))

export class World {
  readonly p: PersonParams
  readonly truth: Truth
  private readonly base: Record<string, number> = {}
  /** The drift per reading per slot, made up front. */
  private readonly drift: Record<string, Float64Array> = {}
  private readonly noise: Record<string, Float64Array> = {}
  /** Effects scheduled by moves done, per reading per slot. */
  private readonly added: Record<string, Float64Array> = {}
  private readonly ctx: DayContext[] = []
  private readonly answerDraw: Float64Array
  private readonly respDraw: Float64Array
  private readonly extraDraw: Float64Array
  /** Every move done, for the truth and the realized benefit. */
  readonly doneLog: { moveId: string; d: number; block: Block; fraction: number }[] = []

  constructor(seed: number, p: PersonParams, truth: Truth) {
    this.p = p
    this.truth = truth
    const rng = stream(seed, 'world')
    const n = DAYS * 3 + 30
    for (const r of INGREDIENT_READINGS) {
      this.base[r] = 0.4 * gauss(rng)
      this.drift[r] = new Float64Array(n)
      this.noise[r] = new Float64Array(n)
      this.added[r] = new Float64Array(n)
    }
    // The drift: correlated innovations, autocorrelated from block to block.
    const s = p.stateSd * Math.sqrt(1 - p.rho * p.rho)
    const a: Record<string, number> = {}
    for (const r of INGREDIENT_READINGS) a[r] = p.stateSd * gauss(rng)
    for (let t = 0; t < n; t++) {
      const common = gauss(rng)
      for (const r of INGREDIENT_READINGS) {
        a[r] = p.rho * a[r] + s * (Math.sqrt(p.corr) * common + Math.sqrt(1 - p.corr) * gauss(rng))
        this.drift[r][t] = a[r]
        this.noise[r][t] = p.noiseSd * gauss(rng)
      }
    }
    const away = new Set(p.away)
    for (let d = 0; d < DAYS + 10; d++) {
      const weekday = (1 + d) % 7 // START is a Monday: 1
      const weekend = weekday === 0 || weekday === 6
      const office = officeOn(weekday, d >= (p.officeDaysLater?.from ?? Infinity) ? (p.officeDaysLater?.days ?? p.officeDays) : p.officeDays)
      const withHer = p.withHer === 'half' ? d % 2 === 0 : !(weekend && Math.floor(d / 7) % 2 === 1)
      this.ctx.push({ day: addDays(START, d), weekday, weekend, office: office && !away.has(d), church: weekday === 0, studyNight: weekday === 3, withHer: withHer && !away.has(d), daycare: !weekend && !away.has(d), shortSleep: rng() < p.shortSleep, away: away.has(d) })
    }
    this.answerDraw = new Float64Array(n)
    this.respDraw = new Float64Array(n * 4)
    this.extraDraw = new Float64Array(n * 8)
    for (let i = 0; i < n; i++) this.answerDraw[i] = rng()
    for (let i = 0; i < n * 4; i++) this.respDraw[i] = rng()
    for (let i = 0; i < n * 8; i++) this.extraDraw[i] = rng()
  }

  dayString(d: number): string {
    return this.ctx[d].day
  }

  context(d: number): DayContext {
    return this.ctx[d]
  }

  /** The good-direction state of a reading at a slot, before noise: base, rhythm, context, drift and what moves added. */
  goodness(r: ReadingId, d: number, b: Block): number {
    const c = this.ctx[d]
    const t = slotOf(d, b)
    let g = this.base[r] + this.p.rhythmScale * (RHYTHM[r]?.[b] ?? 0) + this.drift[r][t] + this.added[r][t]
    if (c.office && b === 'afternoon') g += r === 'stress' ? -0.3 : r === 'overwhelm' ? -0.2 : r === 'focus' ? -0.1 : 0
    if (c.weekend) g += r === 'stress' ? 0.2 : r === 'overwhelm' ? 0.1 : 0
    if (!c.withHer && r === 'mood') g -= 0.15
    if (c.shortSleep) {
      if (b === 'morning') g += r === 'energy' ? -0.4 : r === 'focus' ? -0.3 : r === 'mood' ? -0.2 : 0
      if (b === 'afternoon' && r === 'energy') g -= 0.2
    }
    if (c.church && b === 'morning' && r === 'mood') g += 0.1
    return g
  }

  /** The check-in at a slot, if one is answered: every reading its block asks, as anchors from 1 to 5. Away days are answered too; learning leaves them out. */
  checkin(d: number, b: Block): Answered | null {
    const t = slotOf(d, b)
    let chance = this.p.checkin[b]
    if (this.p.missOnLowMood) chance = logistic(logit(Math.min(0.999, Math.max(0.001, chance))) + this.p.missOnLowMood * this.goodness('mood', d, b))
    if (this.answerDraw[t] >= chance) return null
    const answers: Partial<Record<ReadingId, number>> = {}
    for (const r of blockReadings(b)) {
      if (INGREDIENTS[r]) {
        const g = this.goodness(r, d, b) + this.noise[r][t]
        answers[r] = INGREDIENTS[r] === 'down' ? clamp15(3 - g) : clamp15(3 + g)
      } else answers[r] = this.otherAnswer(r, d, b, t)
    }
    return { day: this.ctx[d].day, block: b, answers }
  }

  /** The readings that are never a target: plausible answers, short sleep where the night was short. */
  private otherAnswer(r: ReadingId, d: number, b: Block, t: number): number {
    const u = this.extraDraw[t * 8 + (r.length % 8)]
    const c = this.ctx[d]
    if (r === 'sleepHours') return c.shortSleep ? 2 : u < 0.5 ? 3 : 4
    if (r === 'sleepQuality') return c.shortSleep ? 2 : u < 0.3 ? 3 : 4
    if (r === 'hunger') return 2 + Math.floor(u * 3)
    return clamp15(3 + this.goodness('mood', d, b) * 0.5 + (u - 0.5))
  }

  /** How an offer went: seen or not, what was done, and whether it was ever answered. The same person answers the same way under either engine. */
  respond(moveId: string, d: number, b: Block): Response {
    const t = slotOf(d, b)
    const u = (k: number) => this.respDraw[t * 4 + k]
    const seen = u(0) < this.p.seen
    const answered = u(3) >= this.p.unanswered
    if (!seen) return { seen, did: null, why: null, answered }
    let done = this.p.done
    let partly = this.p.partly
    if (moveId === NOTHING) {
      done = 0.9
      partly = 0
    } else if (this.p.adherenceOnEnergy) {
      done = logistic(logit(done) + this.p.adherenceOnEnergy * this.goodness('energy', d, b))
      partly = Math.min(partly, 1 - done)
    }
    const x = u(1)
    const did = x < done ? 'done' : x < done + partly ? 'partly' : 'no'
    const why = did === 'no' && moveId !== NOTHING ? (u(2) < 0.5 ? 'noTime' : 'didntWant') : null
    return { seen, did, why, answered }
  }

  /** A move done (or partly) lands its true effects in the slots its window reaches. */
  apply(moveId: string, d: number, b: Block, fraction: number): void {
    if (moveId === NOTHING || fraction <= 0) return
    this.doneLog.push({ moveId, d, block: b, fraction })
    const effects = this.truth.get(moveId)
    if (!effects) return
    for (const [r, eff] of Object.entries(effects) as [ReadingId, TrueEffect][]) {
      if (!eff || !this.added[r]) continue
      const e = effectOn(eff, d, this.ctx[d]) * fraction
      if (e === 0) continue
      const window = eff.window ?? windowOfMove(moveId, r)
      for (const [slot, share] of reach(d, b, window, eff.carry)) if (slot < this.added[r].length) this.added[r][slot] += e * share
    }
  }

  /** The true effect of doing a move on a reading on a day, in steps: what every estimate is judged against. */
  trueEffect(moveId: string, r: ReadingId, d: number): number {
    const eff = this.truth.get(moveId)?.[r]
    return eff ? effectOn(eff, d, this.ctx[d]) : 0
  }
}

function officeOn(weekday: number, perWeek: number): boolean {
  const order = [2, 4, 1, 3, 5] // Tuesday, Thursday, then Monday, Wednesday, Friday
  return order.slice(0, Math.max(0, Math.min(5, perWeek))).includes(weekday)
}

function effectOn(eff: TrueEffect, d: number, c: DayContext): number {
  const e = eff.change && d >= eff.change.day ? eff.change.e : eff.e
  if (eff.only === 'withHer' && !c.withHer) return 0
  return e
}

export function windowOfMove(moveId: string, r: ReadingId): Window {
  if (!hasMove(moveId)) return 'nextBlock'
  const m = moveById(moveId)
  return m.targets.find((t) => t.reading === r)?.window ?? m.targets[0]?.window ?? 'nextBlock'
}

/** The slots a window reaches from a move done at (d, b), each with its share of the effect. */
export function reach(d: number, b: Block, window: Window, carry?: number): [number, number][] {
  const i = BLOCKS.indexOf(b)
  const at = (dd: number, bb: number): number => dd * 3 + bb
  switch (window) {
    case 'nextBlock':
      return [[i < 2 ? at(d, i + 1) : at(d + 1, 0), 1]]
    case 'laterToday':
      return i < 2 ? BLOCKS.slice(i + 1).map((_, k) => [at(d, i + 1 + k), 1] as [number, number]) : [[at(d + 1, 0), 1]]
    case 'evening':
      return [[i < 2 ? at(d, 2) : at(d + 1, 0), 1]]
    case 'nextMorning':
      return [[at(d + 1, 0), 1]]
    case 'sevenDays': {
      const out: [number, number][] = []
      for (let k = 1; k <= 7; k++) for (let bb = 0; bb < 3; bb++) out.push([at(d + k, bb), carry === undefined ? 1 : carry ** (k - 1)])
      return out
    }
  }
}
