import { addDays, BLOCKS } from './blocks'
import { ALPHA, bootstrapDiff, weightedMean, type Interval } from './bootstrap'
import type { Card, CheckIn, Declaration } from './db'
import { indexCheckIns, slotKey } from './observe'
import { type Position } from './readings'
import { seeded, type Rng } from './rng'
import { INGREDIENT_IDS, pointsFor, readingOf } from './score'

// The readings' weight cards (Phase 12), moved from tiers.ts unchanged (2026-10-20) when the old engine was retired: they
// test the reading out of 100's own weights, never a move. A tier is a past claim's word too, kept on its record.

export type Tier = 'little' | 'unclear' | 'promising' | 'holdsUp' | 'unhelpful'

/** The fewest pairs a weight card is read from. */
export const WEIGHT_MIN_PAIRS = 8

// Weight cards: do the six ingredients deserve equal weights? A weight card proposes weights and
// is judged on how well the weighted reading, carried forward, foretells the next block's
// equal-weight reading, against carrying the equal-weight reading forward. Points, not steps;
// worthwhile is ten points; nothing changes until a weight card holds up (Phase 12 declares).

export type Weights = Readonly<Record<string, number>>

export function weightedReading(c: CheckIn, weights: Weights): number | null {
  let s = 0
  let w = 0
  for (const id of INGREDIENT_IDS) {
    const p = c.answers[id]
    if (p === undefined) return null
    const weight = weights[id] ?? 1
    s += weight * pointsFor(id, p as Position)
    w += weight
  }
  return w > 0 ? s / w : null
}

export interface WeightPair {
  equalNow: number
  weightedNow: number
  equalNext: number
}

export function weightPairs(checkins: readonly CheckIn[], weights: Weights): WeightPair[] {
  const byKey = indexCheckIns(checkins)
  const out: WeightPair[] = []
  for (const c of checkins) {
    const equalNow = readingOf(c)?.value
    const weightedNow = weightedReading(c, weights)
    if (equalNow === undefined || weightedNow === null) continue
    const i = BLOCKS.indexOf(c.block)
    const next = i < 2 ? byKey.get(slotKey(c.day, BLOCKS[i + 1])) : byKey.get(slotKey(addDays(c.day, 1), 'morning'))
    const equalNext = next ? readingOf(next)?.value : undefined
    if (equalNext === undefined) continue
    out.push({ equalNow, weightedNow, equalNext })
  }
  return out
}

export interface WeightStats {
  n: number
  errorEqual: number
  errorWeighted: number
  interval: Interval | null
  tier: Tier
}

export const WEIGHT_REPLICATION_MIN = 14

/** A weight card's standing: declared when its interval clears the worthwhile change; Holds up once the pairs gathered after the declaration replicate it. */
export function weightStanding(card: Card, checkins: readonly CheckIn[], declarations: readonly Declaration[], today: string): { stats: WeightStats; declared: Declaration | null; due: Declaration | null; holds: boolean } {
  const stats = evaluateWeightCard(checkins, card.weights ?? {})
  const declared = declarations.find((d) => d.cardId === card.id) ?? null
  let due: Declaration | null = null
  let holds = false
  if (!declared && stats.interval && stats.interval.lo > card.worthwhile) {
    due = { cardId: card.id as number, at: today, diff: stats.interval.diff, lo: stats.interval.lo, hi: stats.interval.hi, p: stats.interval.p, level: stats.interval.level, nDone: stats.n, nAlternative: stats.n, estimator: 'weights' }
  }
  if (declared) {
    const later = evaluateWeightCard(checkins.filter((c) => c.day > declared.at), card.weights ?? {})
    holds = later.n >= WEIGHT_REPLICATION_MIN && later.interval !== null && later.interval.lo > 0
    return { stats: { ...stats, interval: { diff: declared.diff, lo: declared.lo, hi: declared.hi, p: declared.p, level: declared.level }, tier: holds ? 'holdsUp' : 'promising' }, declared, due, holds }
  }
  return { stats, declared, due, holds }
}

/** The card's evidence: the mean absolute error of each forecast, and the resampled difference (equal minus weighted, positive when the weights help). */
export function evaluateWeightCard(checkins: readonly CheckIn[], weights: Weights, level = 1 - ALPHA, rng: Rng = seeded(11)): WeightStats {
  const pairs = weightPairs(checkins, weights)
  const equal = pairs.map((p) => ({ value: Math.abs(p.equalNext - p.equalNow), weight: 1 }))
  const weighted = pairs.map((p) => ({ value: Math.abs(p.equalNext - p.weightedNow), weight: 1 }))
  const errorEqual = weightedMean(equal)
  const errorWeighted = weightedMean(weighted)
  if (pairs.length < WEIGHT_MIN_PAIRS) return { n: pairs.length, errorEqual, errorWeighted, interval: null, tier: 'little' }
  const interval = bootstrapDiff(equal, weighted, level, rng)
  const tier: Tier = interval.hi < 0 ? 'unhelpful' : interval.lo <= 0 ? 'unclear' : 'promising'
  return { n: pairs.length, errorEqual, errorWeighted, interval, tier }
}

/** Learned weights to propose: each ingredient by how its points move with the next block's reading, kept between a half and two, mean one. */
export function proposeWeights(checkins: readonly CheckIn[]): Weights | null {
  const byKey = indexCheckIns(checkins)
  const rows: { points: Record<string, number>; next: number }[] = []
  for (const c of checkins) {
    const i = BLOCKS.indexOf(c.block)
    const next = i < 2 ? byKey.get(slotKey(c.day, BLOCKS[i + 1])) : byKey.get(slotKey(addDays(c.day, 1), 'morning'))
    const value = next ? readingOf(next)?.value : undefined
    if (value === undefined) continue
    const points: Record<string, number> = {}
    let full = true
    for (const id of INGREDIENT_IDS) {
      const p = c.answers[id]
      if (p === undefined) {
        full = false
        break
      }
      points[id] = pointsFor(id, p as Position)
    }
    if (full) rows.push({ points, next: value })
  }
  if (rows.length < 28) return null
  const meanNext = rows.reduce((s, r) => s + r.next, 0) / rows.length
  const weights: Record<string, number> = {}
  for (const id of INGREDIENT_IDS) {
    const meanP = rows.reduce((s, r) => s + r.points[id], 0) / rows.length
    let cov = 0
    let vp = 0
    let vn = 0
    for (const r of rows) {
      cov += (r.points[id] - meanP) * (r.next - meanNext)
      vp += (r.points[id] - meanP) ** 2
      vn += (r.next - meanNext) ** 2
    }
    const corr = vp > 0 && vn > 0 ? cov / Math.sqrt(vp * vn) : 0
    weights[id] = Math.min(2, Math.max(0.5, 1 + corr))
  }
  const mean = INGREDIENT_IDS.reduce((s, id) => s + weights[id], 0) / INGREDIENT_IDS.length
  for (const id of INGREDIENT_IDS) weights[id] = Math.round((weights[id] / mean) * 100) / 100
  return weights
}
