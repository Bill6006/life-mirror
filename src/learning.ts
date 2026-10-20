import { daysBetween } from './blocks'
import { hasMove, learnedTags, moveById, NOTHING, type Move } from './catalogue'
import { PRIOR_SD, type Observation } from './observe'
import { type ReadingId } from './readings'
import { INGREDIENTS } from './score'

// The learning engine, pure. An effect is what happened minus what the app expected without the
// move, over the move's own window, in anchor steps, helpful direction positive. Beliefs keep
// "research says" (the Phase 9 prior) and "your record says" apart and combine them by
// precision, recent days weighing more; thin tags shrink toward "don't know"; no belief flips
// on one day. Everything here is a calculation from the record and says so.

export const RECORD_HALF_LIFE_DAYS = 14
export const OBSERVATION_SD = 1
export const TAG_SHRINK_K = 5
export const SIGN_FLIP_MIN_N = 4
export const SIGN_FLIP_MIN_MEAN = 0.3
export const LEND_MIN_N = 1.5

export interface Belief {
  mean: number
  sd: number
  n: number
}

export const FLAT: Belief = { mean: 0, sd: 1, n: 0 }

/** Research says: the Phase 9 starting belief, its spread set by the source's strength. */
export function priorOf(move: Move): Belief {
  return { mean: move.prior.effect, sd: PRIOR_SD[move.source.strength], n: 0 }
}

/** Your record says: the recency-weighted mean of the effects, recent days weighing more; null with no record. */
export function recordOf(obs: readonly Observation[], today: string): Belief | null {
  let sum = 0
  let weight = 0
  for (const o of obs) {
    const age = Math.max(0, daysBetween(o.day, today))
    const w = o.weight * 0.5 ** (age / RECORD_HALF_LIFE_DAYS)
    sum += w * o.effect
    weight += w
  }
  if (weight <= 0) return null
  return { mean: sum / weight, sd: Math.max(0.2, OBSERVATION_SD / Math.sqrt(weight)), n: weight }
}

/** The two combined by precision: a strong prior moves slowly, a long record moves it. */
export function combine(prior: Belief, record: Belief | null): Belief {
  if (!record) return { ...prior }
  const p0 = 1 / prior.sd ** 2
  const p1 = record.n / OBSERVATION_SD ** 2
  const mean = (p0 * prior.mean + p1 * record.mean) / (p0 + p1)
  return { mean, sd: Math.sqrt(1 / (p0 + p1)), n: record.n }
}

/** A thin record shrinks toward "don't know": n over n plus k of its distance from the prior. */
export function shrink(prior: Belief, record: Belief | null, k = TAG_SHRINK_K): Belief {
  if (!record) return { ...prior }
  const f = record.n / (record.n + k)
  return { mean: prior.mean + f * (record.mean - prior.mean), sd: Math.max(0.2, prior.sd * (1 - f) + record.sd * f), n: record.n }
}

export interface TagBelief {
  id: string
  research: Belief
  record: Belief | null
  belief: Belief
}

function tagIdsOf(move: Move): string[] {
  return [...move.tags.ingredients, ...move.tags.reward, 'intensity']
}

/** Beliefs per learned tag: the Phase 9 prior corrected by every effect of a move carrying the tag, shrunk while thin. */
export function tagBeliefs(obs: readonly Observation[], today: string): TagBelief[] {
  return learnedTags.map((t) => {
    const research: Belief = { mean: t.prior.effect, sd: PRIOR_SD[t.source.strength], n: 0 }
    const mine = obs.filter((o) => o.arm !== 'declined' && hasMove(o.moveId) && tagIdsOf(moveById(o.moveId)).includes(t.id))
    const record = recordOf(mine, today)
    return { id: t.id, research, record, belief: shrink(research, record) }
  })
}

export interface MoveBelief {
  moveId: string
  situationKey: string
  research: Belief
  record: Belief | null
  belief: Belief
}

/**
 * The belief the bandit draws from for one move in one situation: research corrected by the
 * record there; while that record is thin, the move's tags lend what they have learned.
 */
export function moveBelief(move: Move, situationKey: string, obs: readonly Observation[], tags: readonly TagBelief[], today: string): MoveBelief {
  const research = priorOf(move)
  const mine = obs.filter((o) => o.moveId === move.id && o.situationKey === situationKey)
  const record = recordOf(mine, today)
  let start = research
  if (!record || record.n < 2) {
    const lent = tags.filter((t) => tagIdsOf(move).includes(t.id) && t.record && t.record.n >= LEND_MIN_N)
    if (lent.length) {
      const shift = lent.reduce((s, t) => s + (t.belief.mean - t.research.mean), 0) / lent.length
      start = { ...research, mean: research.mean + shift }
    }
  }
  return { moveId: move.id, situationKey, research, record, belief: combine(start, record) }
}

/**
 * The belief the bandit draws from for "nothing today" in one situation: no research prior,
 * flat until the record says, corrected by every null offer kept to there.
 */
export function nothingBelief(situationKey: string, obs: readonly Observation[], today: string): MoveBelief {
  const research: Belief = { ...FLAT }
  const mine = obs.filter((o) => o.moveId === NOTHING && o.situationKey === situationKey)
  const record = recordOf(mine, today)
  return { moveId: NOTHING, situationKey, research, record, belief: combine(research, record) }
}

export interface SignFlip {
  moveId: string
  helps: string
  hurts: string
}

/** A move that helps in one situation and hurts in another, on enough record to say so: flagged, and tested on purpose. */
export function signFlips(beliefs: readonly MoveBelief[]): SignFlip[] {
  const out: SignFlip[] = []
  const byMove = new Map<string, MoveBelief[]>()
  for (const b of beliefs) {
    if (!b.record || b.record.n < SIGN_FLIP_MIN_N) continue
    const list = byMove.get(b.moveId) ?? []
    list.push(b)
    byMove.set(b.moveId, list)
  }
  for (const [moveId, list] of byMove) {
    const helps = list.find((b) => (b.record as Belief).mean >= SIGN_FLIP_MIN_MEAN)
    const hurts = list.find((b) => (b.record as Belief).mean <= -SIGN_FLIP_MIN_MEAN)
    if (helps && hurts) out.push({ moveId, helps: helps.situationKey, hurts: hurts.situationKey })
  }
  return out
}

export interface Estimate {
  mean: number
  n: number
}

function estimate(values: readonly number[]): Estimate | null {
  if (!values.length) return null
  return { mean: values.reduce((s, v) => s + v, 0) / values.length, n: values.length }
}

/** The move's cost in energy: how energy read at the next block against its forecast, over every done opportunity. */
export function energyCost(obs: readonly Observation[], moveId: string): Estimate | null {
  return estimate(obs.filter((o) => o.moveId === moveId && o.arm === 'done' && o.energy !== null).map((o) => o.energy as number))
}

/** Spillover: effects landing on readings the card was not looking at. Flagged with counts, never claimed. */
export function spillover(obs: readonly Observation[], moveId: string, situationKey: string, target: ReadingId): { reading: ReadingId; mean: number; n: number }[] {
  const mine = obs.filter((o) => o.moveId === moveId && o.situationKey === situationKey && o.arm === 'done')
  const out: { reading: ReadingId; mean: number; n: number }[] = []
  for (const id of Object.keys(INGREDIENTS) as ReadingId[]) {
    if (id === target) continue
    const e = estimate(mine.map((o) => o.spill[id]).filter((v): v is number => typeof v === 'number'))
    if (e) out.push({ reading: id, mean: e.mean, n: e.n })
  }
  return out
}
