import { seeded, type Rng } from './bandit'
import type { Window } from './catalogue'
import type { Card, CheckIn, Declaration } from './db'
import { indexCheckIns, slotKey, WINDOW_PENALTY, type Observation } from './learning'
import { type Position } from './readings'
import { INGREDIENT_IDS, pointsFor, readingOf } from './score'
import { addDays, BLOCKS } from './blocks'

// The honesty tiers, computed and never typed. Confirmatory claims rest on the coin-flip slice:
// a resampled interval on the difference between the move and its alternative, tightened by
// Holm's correction across every card active that day, replication after a dated declaration.

export type Tier = 'little' | 'unclear' | 'promising' | 'holdsUp' | 'unhelpful'

export const MIN_PER_ARM = 8
export const REPLICATION_MIN = 6
export const ALPHA = 0.05
export const RESAMPLES = 600

export interface Arm {
  value: number
  weight: number
}

export function weightedMean(arm: readonly Arm[]): number {
  let s = 0
  let w = 0
  for (const a of arm) {
    s += a.value * a.weight
    w += a.weight
  }
  return w > 0 ? s / w : 0
}

function resample(arm: readonly Arm[], rng: Rng): Arm[] {
  const out: Arm[] = []
  for (let i = 0; i < arm.length; i++) out.push(arm[Math.min(arm.length - 1, Math.floor(rng() * arm.length))])
  return out
}

export interface Interval {
  diff: number
  lo: number
  hi: number
  /** Two-sided: twice the smaller tail of the resampled differences around zero. */
  p: number
  level: number
}

/** The difference in mean effect, move minus alternative, with a percentile interval from resampling both arms. */
export function bootstrapDiff(move: readonly Arm[], alternative: readonly Arm[], level: number, rng: Rng, reps = RESAMPLES): Interval {
  const diff = weightedMean(move) - weightedMean(alternative)
  if (!move.length || !alternative.length) return { diff, lo: -Infinity, hi: Infinity, p: 1, level }
  const diffs: number[] = []
  for (let r = 0; r < reps; r++) diffs.push(weightedMean(resample(move, rng)) - weightedMean(resample(alternative, rng)))
  diffs.sort((a, b) => a - b)
  const at = (q: number) => diffs[Math.min(diffs.length - 1, Math.max(0, Math.floor(q * (diffs.length - 1))))]
  const tail = (1 - level) / 2
  const below = diffs.filter((d) => d <= 0).length / diffs.length
  const above = diffs.filter((d) => d >= 0).length / diffs.length
  return { diff, lo: at(tail), hi: at(1 - tail), p: Math.min(1, 2 * Math.min(below, above)), level }
}

/**
 * Holm's step-down across every card active today: the smallest p-value must clear alpha over
 * k, the next alpha over k minus one, and so on. Each card's interval is drawn at the level its
 * rank demands, so a screen full of cards cannot manufacture a claim.
 */
export function holmLevels(pvalues: readonly number[], alpha = ALPHA): number[] {
  const k = pvalues.length
  const order = pvalues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p)
  const levels = new Array<number>(k).fill(1 - alpha)
  order.forEach(({ i }, rank) => {
    levels[i] = 1 - alpha / (k - rank)
  })
  return levels
}

export interface CardStats {
  cardId: number
  window: Window
  n: { done: number; alternative: number; partly: number; doneAll: number; alternativeAll: number }
  interval: Interval | null
  partlyMean: number | null
  tier: Tier
  declared: Declaration | null
  replication: { done: number; alternative: number; lo: number; hi: number; holds: boolean } | null
}

function armsOf(obs: readonly Observation[], moveId: string, situationKey: string, kind: Observation['arm'], coinFlipOnly: boolean): Arm[] {
  return obs.filter((o) => o.moveId === moveId && o.situationKey === situationKey && o.arm === kind && (!coinFlipOnly || o.coinFlip)).map((o) => ({ value: o.effect, weight: o.weight }))
}

function tierFrom(interval: Interval, worthwhile: number, declared: Declaration | null, replication: CardStats['replication']): Tier {
  if (interval.hi < 0) return 'unhelpful'
  if (interval.lo <= 0) return 'unclear'
  if (interval.lo > worthwhile && declared && replication && replication.holds) return 'holdsUp'
  return 'promising'
}

/**
 * One card's evidence. A declared card is judged on its frozen declaration plus the data
 * gathered after it: nothing collected before the declaration can change a Holds up.
 */
export function evaluateCard(card: Card, obs: readonly Observation[], declarations: readonly Declaration[], level: number, rng: Rng): CardStats {
  const id = card.id as number
  const alternativeId = card.alternativeId
  const done = armsOf(obs, card.moveId, card.situationKey, 'done', true)
  const alternative = armsOf(obs, alternativeId, card.situationKey, 'done', true)
  const partly = armsOf(obs, card.moveId, card.situationKey, 'partly', false)
  const doneAll = armsOf(obs, card.moveId, card.situationKey, 'done', false).length
  const alternativeAll = armsOf(obs, alternativeId, card.situationKey, 'done', false).length
  const declared = declarations.find((d) => d.cardId === id) ?? null
  const n = { done: done.length, alternative: alternative.length, partly: partly.length, doneAll, alternativeAll }
  const partlyMean = partly.length >= MIN_PER_ARM ? weightedMean(partly) : null
  if (done.length < MIN_PER_ARM || alternative.length < MIN_PER_ARM) {
    return { cardId: id, window: card.window as Window, n, interval: null, partlyMean, tier: 'little', declared, replication: null }
  }
  let interval: Interval
  let replication: CardStats['replication'] = null
  if (declared) {
    // Frozen at declaration; only what came after can replicate it.
    interval = { diff: declared.diff, lo: declared.lo, hi: declared.hi, p: declared.p, level: declared.level }
    const later = (arm: Arm[], ids: readonly Observation[]) => arm.filter((_, i) => ids[i].day > declared.at)
    const doneObs = obs.filter((o) => o.moveId === card.moveId && o.situationKey === card.situationKey && o.arm === 'done' && o.coinFlip)
    const altObs = obs.filter((o) => o.moveId === alternativeId && o.situationKey === card.situationKey && o.arm === 'done' && o.coinFlip)
    const postDone = later(done, doneObs)
    const postAlt = later(alternative, altObs)
    if (postDone.length >= REPLICATION_MIN && postAlt.length >= REPLICATION_MIN) {
      const post = bootstrapDiff(postDone, postAlt, level, rng)
      replication = { done: postDone.length, alternative: postAlt.length, lo: post.lo, hi: post.hi, holds: post.lo > 0 }
    } else {
      replication = { done: postDone.length, alternative: postAlt.length, lo: NaN, hi: NaN, holds: false }
    }
  } else {
    interval = bootstrapDiff(done, alternative, level, rng)
  }
  return { cardId: id, window: card.window as Window, n, interval, partlyMean, tier: tierFrom(interval, card.worthwhile, declared, replication), declared, replication }
}

/** Every active card, short windows first, p-values ranked once so Holm's levels apply across the day. */
export function evaluateCards(cards: readonly Card[], obs: readonly Observation[], declarations: readonly Declaration[], seed = 7): CardStats[] {
  const first = cards.map((c) => evaluateCard(c, obs, declarations, 1 - ALPHA, seeded(seed + (c.id as number))))
  const claimable = first.filter((s) => s.interval !== null)
  const levels = holmLevels(claimable.map((s) => (s.interval as Interval).p))
  const levelOf = new Map(claimable.map((s, i) => [s.cardId, levels[i]]))
  const stats = cards.map((c) => (levelOf.has(c.id as number) ? evaluateCard(c, obs, declarations, levelOf.get(c.id as number) as number, seeded(seed + (c.id as number))) : first[cards.indexOf(c)]))
  return stats.sort((a, b) => WINDOW_PENALTY[a.window] - WINDOW_PENALTY[b.window] || a.cardId - b.cardId)
}

/** Cards whose interval now lies wholly beyond the worthwhile change and carry no declaration yet: declare today, dated, frozen. */
export function declarationsDue(cards: readonly Card[], stats: readonly CardStats[], declarations: readonly Declaration[], today: string): Declaration[] {
  const out: Declaration[] = []
  for (const s of stats) {
    if (!s.interval || s.declared || declarations.some((d) => d.cardId === s.cardId)) continue
    const card = cards.find((c) => c.id === s.cardId)
    if (!card || !(s.interval.lo > card.worthwhile)) continue
    out.push({ cardId: s.cardId, at: today, diff: s.interval.diff, lo: s.interval.lo, hi: s.interval.hi, p: s.interval.p, level: s.interval.level, nDone: s.n.done, nAlternative: s.n.alternative })
  }
  return out
}

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

/** The card's evidence: the mean absolute error of each forecast, and the resampled difference (equal minus weighted, positive when the weights help). */
export function evaluateWeightCard(checkins: readonly CheckIn[], weights: Weights, level = 1 - ALPHA, rng: Rng = seeded(11)): WeightStats {
  const pairs = weightPairs(checkins, weights)
  const equal = pairs.map((p) => ({ value: Math.abs(p.equalNext - p.equalNow), weight: 1 }))
  const weighted = pairs.map((p) => ({ value: Math.abs(p.equalNext - p.weightedNow), weight: 1 }))
  const errorEqual = weightedMean(equal)
  const errorWeighted = weightedMean(weighted)
  if (pairs.length < MIN_PER_ARM) return { n: pairs.length, errorEqual, errorWeighted, interval: null, tier: 'little' }
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

