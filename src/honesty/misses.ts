import { addDays, BLOCKS, type Block } from '../blocks'
import { NOTHING } from '../catalogue'
import type { AnchorSwap, CheckIn, DayContext, ForecastScore, Offer, Outcome } from '../db'
import { INGREDIENT_IDS } from '../score'
import { baselineShift } from '../shift'
import { dayReadings } from '../weekly'
import { contextFlags, HONESTY_CONTEXTS, type HonestyContext } from './contexts'
import { fisherGreater, holmAdjusted } from './exact'

// Requirement 12 (stage R7), in its words: "Misses read for where they cluster. A miss beyond the usual error band is
// checked against four causes: a context, so something is missing; a trend, so the owner has changed (joined to shift.ts's
// break detector); one move, so that belief is wrong; a wording change, so it is measurement. Ordinary misses are
// ignored." A miss is a slot's reading out of 100 outside the range forecast for it that day, the range the app calls
// usual. Each cause is a set of candidates; a candidate is a cluster only when its misses are many, at least twice as
// common as elsewhere, and clear Fisher's exact test after Holm's correction across every candidate looked at.

/** The days of scored slots read, ending yesterday. */
export const MISS_DAYS = 56
/** Misses a cluster needs where its candidate holds. */
export const CLUSTER_MIN = 3
/** How many times the rate elsewhere a cluster's miss rate must reach. */
export const CLUSTER_RATIO = 2
/** The error rate across every candidate, after Holm's correction. */
export const CLUSTER_ALPHA = 0.05

export type MissCause =
  | { kind: 'context'; context: HonestyContext }
  | { kind: 'trend'; since: string }
  | { kind: 'move'; moveId: string }
  | { kind: 'wording'; reading: string; since: string }

export interface MissCandidate {
  cause: MissCause
  missesIn: number
  slotsIn: number
  missesOut: number
  slotsOut: number
  /** Fisher's exact test, one-sided: misses more common where the candidate holds. */
  p: number
  /** After Holm's correction across every candidate looked at. */
  adjusted: number
  cluster: boolean
}

export interface MissReading {
  slots: number
  misses: number
  candidates: MissCandidate[]
  /** The clusters, strongest first: every other miss is ordinary and goes unsaid. */
  clusters: MissCandidate[]
}

export interface MissRecord {
  scores: readonly ForecastScore[]
  checkins: readonly CheckIn[]
  contexts: readonly DayContext[]
  offers: readonly Offer[]
  outcomes: readonly Outcome[]
  swaps: readonly AnchorSwap[]
}

const slotKey = (day: string, block: Block) => `${day}|${block}`

/** Whether a candidate is a cluster: at least three misses there, at least twice the rate elsewhere, clear after Holm. */
export function isCluster(c: Pick<MissCandidate, 'missesIn' | 'slotsIn' | 'missesOut' | 'slotsOut'>, adjusted: number): boolean {
  return c.missesIn >= CLUSTER_MIN && c.missesIn / c.slotsIn >= CLUSTER_RATIO * (c.missesOut / c.slotsOut) && adjusted < CLUSTER_ALPHA
}

/** The slots before one, nearest first: the same day's earlier blocks, then the day before's, latest first. */
function slotsBefore(day: string, block: Block): [string, Block][] {
  const i = BLOCKS.indexOf(block)
  const before = BLOCKS.slice(0, i).reverse().map((b) => [day, b] as [string, Block])
  const yesterday = [...BLOCKS].reverse().map((b) => [addDays(day, -1), b] as [string, Block])
  return [...before, ...yesterday]
}

/** The move done at the nearest slot before with a check-in's move on record: done or partly, never nothing extra. */
function moveBefore(day: string, block: Block, drawnAt: ReadonlyMap<string, { moveId: string; done: boolean }>): string | null {
  for (const [d, b] of slotsBefore(day, block)) {
    const drawn = drawnAt.get(slotKey(d, b))
    if (drawn) return drawn.done && drawn.moveId !== NOTHING ? drawn.moveId : null
  }
  return null
}

export function readMisses(r: MissRecord, today: string): MissReading {
  const since = addDays(today, -MISS_DAYS)
  const slots = r.scores.filter((s) => s.horizon === 0 && s.day >= since && s.day < today)
  const misses = slots.filter((s) => !s.hit).length
  const ctxOf = new Map(r.contexts.map((c) => [c.day, c]))
  const morningOf = new Map(r.checkins.filter((c) => c.block === 'morning').map((c) => [c.day, c]))
  const outcomeOf = new Map(r.outcomes.map((o) => [o.offerId, o]))
  // Each slot's check-in move on record: the one still standing (a skip's replacement), done when answered done or partly.
  const drawnAt = new Map<string, { moveId: string; done: boolean }>()
  for (const o of r.offers.filter((x) => x.kind === 'block').sort((a, b) => (a.at < b.at ? -1 : 1))) {
    const out = o.id === undefined ? undefined : outcomeOf.get(o.id)
    const done = out?.outcome === 'done' || out?.outcome === 'partly'
    const key = slotKey(o.day, o.block)
    if (!drawnAt.get(key)?.done) drawnAt.set(key, { moveId: o.moveId, done })
  }

  // Every candidate, each as the slots where it holds; a slot where the record cannot say is left out of that candidate.
  const candidates: { cause: MissCause; holds: (s: ForecastScore) => boolean | null }[] = []
  for (const context of HONESTY_CONTEXTS) candidates.push({ cause: { kind: 'context', context }, holds: (s) => contextFlags(s.day, ctxOf.get(s.day), morningOf.get(s.day))[context] })
  const shift = baselineShift(dayReadings(r.checkins, today), today)
  if (shift?.shifted) candidates.push({ cause: { kind: 'trend', since: shift.since }, holds: (s) => s.day >= shift.since })
  const moveCount = new Map<string, number>()
  const moveAt = new Map<ForecastScore, string | null>(slots.map((s) => [s, moveBefore(s.day, s.block, drawnAt)]))
  for (const m of moveAt.values()) if (m) moveCount.set(m, (moveCount.get(m) ?? 0) + 1)
  for (const [moveId, n] of [...moveCount].sort((a, b) => (a[0] < b[0] ? -1 : 1))) if (n >= CLUSTER_MIN) candidates.push({ cause: { kind: 'move', moveId }, holds: (s) => moveAt.get(s) === moveId })
  for (const w of r.swaps.filter((x) => INGREDIENT_IDS.includes(x.reading))) candidates.push({ cause: { kind: 'wording', reading: w.reading, since: w.at }, holds: (s) => s.day >= w.at })

  const read = candidates
    .map(({ cause, holds }) => {
      const known = slots.map((s) => ({ s, h: holds(s) })).filter((x) => x.h !== null)
      const inside = known.filter((x) => x.h)
      const outside = known.filter((x) => !x.h)
      const missesIn = inside.filter((x) => !x.s.hit).length
      const missesOut = outside.filter((x) => !x.s.hit).length
      return { cause, missesIn, slotsIn: inside.length, missesOut, slotsOut: outside.length }
    })
    // Only a candidate with slots on both sides can be compared at all.
    .filter((c) => c.slotsIn > 0 && c.slotsOut > 0)
    .map((c) => ({ ...c, p: fisherGreater(c.missesIn, c.slotsIn - c.missesIn, c.missesOut, c.slotsOut - c.missesOut) }))
  const adjusted = holmAdjusted(read.map((c) => c.p))
  const all: MissCandidate[] = read.map((c, i) => ({ ...c, adjusted: adjusted[i], cluster: isCluster(c, adjusted[i]) }))
  return { slots: slots.length, misses, candidates: all, clusters: all.filter((c) => c.cluster).sort((a, b) => a.adjusted - b.adjusted) }
}
