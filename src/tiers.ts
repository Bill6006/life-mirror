import { adaptiveDiff, type Opportunity } from './adaptive'
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

export type Estimator = 'adaptive' | 'coinFlip'

export interface CardStats {
  cardId: number
  window: Window
  n: { done: number; alternative: number; partly: number; doneAll: number; alternativeAll: number }
  /** The interval the claim rests on, from the named estimator. */
  interval: Interval | null
  /** Which estimator produced the claim: the adaptive weights over all the data, or the coin-flip slice. */
  estimator: Estimator | null
  /** The coin-flip slice's own interval, kept running beside the adaptive one. */
  slice: Interval | null
  partlyMean: number | null
  tier: Tier
  declared: Declaration | null
  replication: { done: number; alternative: number; lo: number; hi: number; holds: boolean } | null
}

function armsOf(obs: readonly Observation[], moveId: string, situationKey: string, kind: Observation['arm'], coinFlipOnly: boolean): Arm[] {
  return obs.filter((o) => o.moveId === moveId && o.situationKey === situationKey && o.arm === kind && (!coinFlipOnly || o.coinFlip)).map((o) => ({ value: o.effect, weight: o.weight }))
}

/** Every done opportunity in the situation whose draw recorded its probabilities, as the adaptive estimator reads it. */
function opportunitiesOf(obs: readonly Observation[], card: Card, after: string | null): Opportunity[] {
  return obs
    .filter((o) => o.situationKey === card.situationKey && o.arm === 'done' && o.propensities !== null && (after === null || o.day > after))
    .map((o) => ({
      arm: o.moveId === card.moveId ? 'move' : o.moveId === card.alternativeId ? 'alternative' : 'other',
      effect: o.effect,
      weight: o.weight,
      eMove: (o.propensities as Record<string, number>)[card.moveId] ?? 0,
      eAlternative: (o.propensities as Record<string, number>)[card.alternativeId] ?? 0,
    }))
}

function tierFrom(interval: Interval, worthwhile: number, declared: Declaration | null, replication: CardStats['replication']): Tier {
  if (interval.hi < 0) return 'unhelpful'
  if (interval.lo <= 0) return 'unclear'
  if (interval.lo > worthwhile && declared && replication && replication.holds) return 'holdsUp'
  return 'promising'
}

/**
 * One card's evidence. The adaptive estimator is used once eight done opportunities per arm
 * exist with their probabilities recorded; until then the coin-flip slice, resampled. A
 * declared card is judged on its frozen declaration plus the data gathered after it, by the
 * estimator that declared it: nothing collected before the declaration can change a Holds up.
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
  const partlyMean = partly.length >= MIN_PER_ARM ? weightedMean(partly) : null
  const opps = opportunitiesOf(obs, card, null)
  const adaptive = adaptiveDiff(opps, level)
  const adaptiveUsable = adaptive.nMove >= MIN_PER_ARM && adaptive.nAlternative >= MIN_PER_ARM && Number.isFinite(adaptive.lo)
  const sliceUsable = done.length >= MIN_PER_ARM && alternative.length >= MIN_PER_ARM
  const slice: Interval | null = sliceUsable ? bootstrapDiff(done, alternative, level, rng) : null
  const n = { done: adaptiveUsable ? adaptive.nMove : done.length, alternative: adaptiveUsable ? adaptive.nAlternative : alternative.length, partly: partly.length, doneAll, alternativeAll }
  const estimator: Estimator | null = declared?.estimator === 'coinFlip' ? 'coinFlip' : declared?.estimator === 'adaptive' ? 'adaptive' : adaptiveUsable ? 'adaptive' : sliceUsable ? 'coinFlip' : null
  if (!estimator) return { cardId: id, window: card.window as Window, n, interval: null, estimator: null, slice, partlyMean, tier: 'little', declared, replication: null }
  let interval: Interval
  let replication: CardStats['replication'] = null
  if (declared) {
    interval = { diff: declared.diff, lo: declared.lo, hi: declared.hi, p: declared.p, level: declared.level }
    if (estimator === 'adaptive') {
      const post = adaptiveDiff(opportunitiesOf(obs, card, declared.at), level)
      const enough = post.nMove >= REPLICATION_MIN && post.nAlternative >= REPLICATION_MIN && Number.isFinite(post.lo)
      replication = { done: post.nMove, alternative: post.nAlternative, lo: enough ? post.lo : NaN, hi: enough ? post.hi : NaN, holds: enough && post.lo > 0 }
    } else {
      const later = (kind: 'done', moveId: string) => obs.filter((o) => o.moveId === moveId && o.situationKey === card.situationKey && o.arm === kind && o.coinFlip && o.day > declared.at).map((o) => ({ value: o.effect, weight: o.weight }))
      const postDone = later('done', card.moveId)
      const postAlt = later('done', alternativeId)
      if (postDone.length >= REPLICATION_MIN && postAlt.length >= REPLICATION_MIN) {
        const post = bootstrapDiff(postDone, postAlt, level, rng)
        replication = { done: postDone.length, alternative: postAlt.length, lo: post.lo, hi: post.hi, holds: post.lo > 0 }
      } else {
        replication = { done: postDone.length, alternative: postAlt.length, lo: NaN, hi: NaN, holds: false }
      }
    }
  } else {
    interval = estimator === 'adaptive' ? { diff: adaptive.diff, lo: adaptive.lo, hi: adaptive.hi, p: adaptive.p, level } : (slice as Interval)
  }
  return { cardId: id, window: card.window as Window, n, interval, estimator, slice, partlyMean, tier: tierFrom(interval, card.worthwhile, declared, replication), declared, replication }
}

/**
 * Whether a card has its eight: done opportunities on both arms enough for its tier to be read,
 * counted as the card's own evidence counts them. A card tested on purpose is scheduled until
 * then, and no longer (Part 33).
 */
export function hasItsEight(card: Card, obs: readonly Observation[]): boolean {
  const { n } = evaluateCard(card, obs, [], 1 - ALPHA, seeded(1))
  return n.done >= MIN_PER_ARM && n.alternative >= MIN_PER_ARM
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

/** Cards whose interval now lies wholly beyond the worthwhile change and carry no declaration yet: declare today, dated, frozen, with the estimator named. */
export function declarationsDue(cards: readonly Card[], stats: readonly CardStats[], declarations: readonly Declaration[], today: string): Declaration[] {
  const out: Declaration[] = []
  for (const s of stats) {
    if (!s.interval || !s.estimator || s.declared || declarations.some((d) => d.cardId === s.cardId)) continue
    const card = cards.find((c) => c.id === s.cardId)
    if (!card || !(s.interval.lo > card.worthwhile)) continue
    out.push({ cardId: s.cardId, at: today, diff: s.interval.diff, lo: s.interval.lo, hi: s.interval.hi, p: s.interval.p, level: s.interval.level, nDone: s.n.done, nAlternative: s.n.alternative, estimator: s.estimator })
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

