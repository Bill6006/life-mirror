import { addDays, blockIndex, BLOCKS, daysBetween, type Block } from './blocks'
import { hasMove, moveById, NOTHING, type Move, type Strength, type Window } from './catalogue'
import type { CheckIn, Offer, Outcome } from './db'
import { blockReadings, type ReadingId } from './readings'
import { INGREDIENTS } from './score'

// The record's own readings, moved from learning.ts unchanged (2026-10-20) when the old engine was retired: the forecast
// of a reading, the effects the record holds against it, what lasts after a move stops, the no-time ceiling that narrows
// which moves fit, the research priors' spreads and the window penalty. The learning repair and the observational
// analyses read them; nothing here learns or chooses.

export const FORECAST_HALF_LIFE_DAYS = 7
export const FORECAST_LOOKBACK_DAYS = 28
export const FORECAST_MIN_OBS = 3
export const THIN_WEIGHT = 0.5
export const THIN_MS_PER_READING = 1500
export const DECLINED_EFFECT = -0.5
export const DECLINED_WEIGHT = 0.5
export const NO_TIME_DAYS = 7

/** How sure the research is: the prior's spread by the source's strength. */
export const PRIOR_SD: Readonly<Record<Strength, number>> = { strong: 0.3, moderate: 0.5, weak: 0.8, practice: 1 }

/** Short-window moves first: a small penalty in the draw for the longer windows. */
export const WINDOW_PENALTY: Readonly<Record<Window, number>> = { nextBlock: 0, laterToday: 0.1, evening: 0.1, nextMorning: 0.2, sevenDays: 0.4 }

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
  /** Phase 12: the probability this move had of being offered, and every candidate's, at the draw; null for offers made before. */
  propensity: number | null
  propensities: Record<string, number> | null
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
 * as "didn't want to". The null offer counts like a move: kept to, its effect is read over the
 * next block, so the record can say what doing nothing does.
 */
export function observations(checkins: readonly CheckIn[], offers: readonly Offer[], outcomes: readonly Outcome[]): Observation[] {
  const byKey = indexCheckIns(checkins)
  const byOffer = new Map(outcomes.map((x) => [x.offerId, x]))
  const out: Observation[] = []
  for (const o of offers) {
    const isNull = o.moveId === NOTHING
    if (o.id === undefined || o.skippedAt || (!isNull && !hasMove(o.moveId))) continue
    const x = byOffer.get(o.id)
    if (!x || !x.outcome) continue
    const window: Window = isNull ? 'nextBlock' : windowOf(moveById(o.moveId), o.target)
    if (x.outcome === 'no') {
      if (x.why === 'didntWant') {
        out.push({ offerId: o.id, moveId: o.moveId, situationKey: o.situationKey, target: o.target, window, day: o.day, block: o.block, arm: 'declined', effect: DECLINED_EFFECT, weight: DECLINED_WEIGHT, coinFlip: o.coinFlip, spill: {}, energy: null, propensity: o.propensity ?? null, propensities: o.propensities ?? null })
      }
      continue
    }
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
    out.push({ offerId: o.id, moveId: o.moveId, situationKey: o.situationKey, target: o.target, window, day: o.day, block: o.block, arm: x.outcome === 'done' ? 'done' : 'partly', effect: read.effect, weight: read.weight, coinFlip: o.coinFlip, spill, energy: energy ? energy.effect : null, propensity: o.propensity ?? null, propensities: o.propensities ?? null })
  }
  return out
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
