import { addDays, blockIndex, BLOCKS, daysBetween, type Block } from './blocks'
import { hasMove, learnedTags, moveById, type Move, type Strength, type Window } from './catalogue'
import type { CheckIn, Offer, Outcome } from './db'
import { blockReadings, type ReadingId } from './readings'
import { INGREDIENTS } from './score'

// The learning engine, pure. An effect is what happened minus what the app expected without the
// move, over the move's own window, in anchor steps, helpful direction positive. Beliefs keep
// "research says" (the Phase 9 prior) and "your record says" apart and combine them by
// precision, recent days weighing more; thin tags shrink toward "don't know"; no belief flips
// on one day. Everything here is a calculation from the record and says so.

export const RECORD_HALF_LIFE_DAYS = 14
export const FORECAST_HALF_LIFE_DAYS = 7
export const FORECAST_LOOKBACK_DAYS = 28
export const FORECAST_MIN_OBS = 3
export const OBSERVATION_SD = 1
export const THIN_WEIGHT = 0.5
export const THIN_MS_PER_READING = 1500
export const TAG_SHRINK_K = 5
export const DECLINED_EFFECT = -0.5
export const DECLINED_WEIGHT = 0.5
export const NO_TIME_DAYS = 7
export const SIGN_FLIP_MIN_N = 4
export const SIGN_FLIP_MIN_MEAN = 0.3
export const LEND_MIN_N = 1.5

/** How sure the research is: the prior's spread by the source's strength. */
export const PRIOR_SD: Readonly<Record<Strength, number>> = { strong: 0.3, moderate: 0.5, weak: 0.8, practice: 1 }

/** Short-window moves first: a small penalty in the draw for the longer windows. */
export const WINDOW_PENALTY: Readonly<Record<Window, number>> = { nextBlock: 0, laterToday: 0.1, evening: 0.1, nextMorning: 0.2, sevenDays: 0.4 }

export interface Belief {
  mean: number
  sd: number
  n: number
}

export const FLAT: Belief = { mean: 0, sd: 1, n: 0 }

function askedOf(c: CheckIn): readonly ReadingId[] {
  return c.asked ?? blockReadings(c.block)
}

function complete(c: CheckIn): boolean {
  return askedOf(c).every((id) => c.answers[id] !== undefined)
}

/** Fast identical taps: every asked reading on the same phrase, under a second and a half each. */
export function isThin(c: CheckIn): boolean {
  const asked = askedOf(c)
  if (asked.length < 3 || !complete(c)) return false
  const first = c.answers[asked[0]]
  if (!asked.every((id) => c.answers[id] === first)) return false
  return c.activeMs < THIN_MS_PER_READING * asked.length
}

export function weightOf(c: CheckIn): number {
  return isThin(c) ? THIN_WEIGHT : 1
}

export const slotKey = (day: string, block: Block) => `${day}|${block}`

export function indexCheckIns(checkins: readonly CheckIn[]): Map<string, CheckIn> {
  return new Map(checkins.map((c) => [slotKey(c.day, c.block), c]))
}

/** The slots a window's effect is read from. Later today after an evening move is the next morning. */
export function windowSlots(day: string, block: Block, window: Window): { day: string; block: Block }[] {
  const i = blockIndex(block)
  switch (window) {
    case 'nextBlock':
      return i < 2 ? [{ day, block: BLOCKS[i + 1] }] : [{ day: addDays(day, 1), block: 'morning' }]
    case 'laterToday':
      return i < 2 ? BLOCKS.slice(i + 1).map((b) => ({ day, block: b })) : [{ day: addDays(day, 1), block: 'morning' }]
    case 'evening':
      return i < 2 ? [{ day, block: 'evening' }] : [{ day: addDays(day, 1), block: 'morning' }]
    case 'nextMorning':
      return [{ day: addDays(day, 1), block: 'morning' }]
    case 'sevenDays': {
      const out: { day: string; block: Block }[] = []
      for (let d = 1; d <= 7; d++) for (const b of BLOCKS) out.push({ day: addDays(day, d), block: b })
      return out
    }
  }
}

/**
 * The simple time-window forecast: the recency-weighted mean of that reading in that block over
 * the four weeks before the day, half-life a week, from at least three answered days. Null when
 * the record is too short to expect anything.
 */
export function forecast(byKey: ReadonlyMap<string, CheckIn>, day: string, block: Block, reading: ReadingId): number | null {
  let sum = 0
  let weight = 0
  let n = 0
  for (let back = 1; back <= FORECAST_LOOKBACK_DAYS; back++) {
    const c = byKey.get(slotKey(addDays(day, -back), block))
    const p = c?.answers[reading]
    if (p === undefined) continue
    const w = 0.5 ** (back / FORECAST_HALF_LIFE_DAYS) * weightOf(c as CheckIn)
    sum += w * p
    weight += w
    n++
  }
  return n >= FORECAST_MIN_OBS && weight > 0 ? sum / weight : null
}

/** Helpful direction positive: for a reading that is better lower, a fall is a gain. */
export function signedEffect(observed: number, expected: number, reading: ReadingId): number {
  const raw = observed - expected
  return (INGREDIENTS[reading] ?? 'up') === 'down' ? -raw : raw
}

export interface Observation {
  offerId: number
  moveId: string
  situationKey: string
  target: ReadingId
  window: Window
  day: string
  block: Block
  arm: 'done' | 'partly' | 'declined'
  /** Helpful direction positive, in anchor steps. */
  effect: number
  weight: number
  coinFlip: boolean
  /** Signed effects on the other readings read at the same slots, for spillover. */
  spill: Partial<Record<ReadingId, number>>
  /** The energy read at the next block minus its forecast: the move's energy cost when negative. */
  energy: number | null
}

interface Read {
  effect: number
  weight: number
}

function readAt(byKey: ReadonlyMap<string, CheckIn>, slots: readonly { day: string; block: Block }[], reading: ReadingId): Read | null {
  let sum = 0
  let weight = 0
  for (const s of slots) {
    const c = byKey.get(slotKey(s.day, s.block))
    const p = c?.answers[reading]
    if (p === undefined) continue
    const expected = forecast(byKey, s.day, s.block, reading)
    if (expected === null) continue
    const w = weightOf(c as CheckIn)
    sum += w * signedEffect(p, expected, reading)
    weight += w
  }
  return weight > 0 ? { effect: sum / weight, weight } : null
}

function windowOf(move: Move, target: ReadingId): Window {
  return move.targets.find((t) => t.reading === target)?.window ?? move.targets[0]?.window ?? 'nextBlock'
}

/**
 * Every effect the record holds: one per offer that was done or partly done, read at the
 * window's slots against the forecast; and a small, light "declined" mark for every No given
 * as "didn't want to", which feeds the bandit and nothing else.
 */
export function observations(checkins: readonly CheckIn[], offers: readonly Offer[], outcomes: readonly Outcome[]): Observation[] {
  const byKey = indexCheckIns(checkins)
  const byOffer = new Map(outcomes.map((x) => [x.offerId, x]))
  const out: Observation[] = []
  for (const o of offers) {
    if (o.id === undefined || o.skippedAt || !hasMove(o.moveId)) continue
    const x = byOffer.get(o.id)
    if (!x || !x.outcome) continue
    const move = moveById(o.moveId)
    if (x.outcome === 'no') {
      if (x.why === 'didntWant') {
        out.push({ offerId: o.id, moveId: o.moveId, situationKey: o.situationKey, target: o.target, window: windowOf(move, o.target), day: o.day, block: o.block, arm: 'declined', effect: DECLINED_EFFECT, weight: DECLINED_WEIGHT, coinFlip: o.coinFlip, spill: {}, energy: null })
      }
      continue
    }
    const window = windowOf(move, o.target)
    const slots = windowSlots(o.day, o.block, window)
    const read = readAt(byKey, slots, o.target)
    if (!read) continue
    const spill: Partial<Record<ReadingId, number>> = {}
    for (const id of Object.keys(INGREDIENTS) as ReadingId[]) {
      if (id === o.target) continue
      const r = readAt(byKey, slots, id)
      if (r) spill[id] = r.effect
    }
    const energy = readAt(byKey, windowSlots(o.day, o.block, 'nextBlock'), 'energy')
    out.push({ offerId: o.id, moveId: o.moveId, situationKey: o.situationKey, target: o.target, window, day: o.day, block: o.block, arm: x.outcome === 'done' ? 'done' : 'partly', effect: read.effect, weight: read.weight, coinFlip: o.coinFlip, spill, energy: energy ? energy.effect : null })
  }
  return out
}

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

/**
 * How long an effect lasts after you stop: after a run of at least three days doing the move,
 * how many of the next three days the target still read above half the run's own effect. Only
 * said from three such runs.
 */
export function decayAfterStop(obs: readonly Observation[], moveId: string, checkins: readonly CheckIn[], target: ReadingId, window: Window = 'nextBlock'): { daysHeld: number; runs: number } | null {
  const byKey = indexCheckIns(checkins)
  const days = [...new Set(obs.filter((o) => o.moveId === moveId && o.arm === 'done').map((o) => o.day))].sort()
  const runs: number[] = []
  let start = 0
  for (let i = 1; i <= days.length; i++) {
    const continues = i < days.length && daysBetween(days[i - 1], days[i]) === 1
    if (continues) continue
    const run = days.slice(start, i)
    start = i
    if (run.length < 3) continue
    const own = obs.filter((o) => o.moveId === moveId && o.arm === 'done' && run.includes(o.day)).map((o) => o.effect)
    const runEffect = own.reduce((s, v) => s + v, 0) / own.length
    if (runEffect <= 0) continue
    let held = 0
    for (let d = 1; d <= 3; d++) {
      const day = addDays(run[run.length - 1], d)
      if (days.includes(day)) break
      const slots = windowSlots(day, 'morning', window)
      const read = readAt(byKey, [{ day, block: 'morning' }, ...slots], target)
      if (read && read.effect >= runEffect / 2) held++
      else break
    }
    runs.push(held)
  }
  if (runs.length < 3) return null
  return { daysHeld: Math.round((runs.reduce((s, v) => s + v, 0) / runs.length) * 10) / 10, runs: runs.length }
}

/** "No time" narrows the feasibility filter: after a No for lack of time in a block, moves at least that long stay out of that block for a week. */
export function noTimeCeiling(offers: readonly Offer[], outcomes: readonly Outcome[], block: Block, today: string): number | null {
  const byOffer = new Map(offers.map((o) => [o.id as number, o]))
  let ceiling: number | null = null
  for (const x of outcomes) {
    if (x.outcome !== 'no' || x.why !== 'noTime') continue
    const o = byOffer.get(x.offerId)
    if (!o || o.block !== block || !hasMove(o.moveId)) continue
    if (daysBetween(o.day, today) > NO_TIME_DAYS || daysBetween(o.day, today) < 0) continue
    const minutes = moveById(o.moveId).minutes
    if (minutes <= 0) continue
    ceiling = ceiling === null ? minutes : Math.min(ceiling, minutes)
  }
  return ceiling
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
