import { COIN_FLIP_RATE, EFFORT_PENALTY, gaussian, type Belief, type Candidate, type Rng } from './bandit'

// Confirmatory inference built for adaptively collected data, after Hadad, Wager, Athey and
// colleagues (2021): every offer records the probability each candidate had of being offered,
// and the estimate for an arm weights each opportunity by the square root of that probability
// (the constant-allocation weights), so the whole record can be used and the interval is still
// honest. The coin-flip slice keeps running beside it.

export const PROPENSITY_DRAWS = 200

/** The probability each candidate has of being offered right now: the coin flip's even share plus the Thompson draw's share, from many draws. */
export function propensities(candidates: readonly Candidate[], beliefs: (id: string) => Belief, rng: Rng, draws = PROPENSITY_DRAWS): Record<string, number> {
  const wins: Record<string, number> = {}
  for (const c of candidates) wins[c.id] = 0
  if (!candidates.length) return wins
  for (let d = 0; d < draws; d++) {
    let best: string | null = null
    let bestValue = -Infinity
    for (const c of candidates) {
      const b = beliefs(c.id)
      const v = b.mean + b.sd * gaussian(rng) - EFFORT_PENALTY[c.effort] + (c.bonus ?? 0)
      if (v > bestValue) {
        bestValue = v
        best = c.id
      }
    }
    if (best) wins[best]++
  }
  const out: Record<string, number> = {}
  for (const c of candidates) out[c.id] = COIN_FLIP_RATE / candidates.length + (1 - COIN_FLIP_RATE) * (wins[c.id] / draws)
  return out
}

/** One opportunity in a situation: which arm was taken and done, its effect, and each arm's probability of being offered at the time. */
export interface Opportunity {
  arm: 'move' | 'alternative' | 'other'
  effect: number
  weight: number
  eMove: number
  eAlternative: number
}

export interface ArmEstimate {
  mean: number
  variance: number
  /** Opportunities where this arm was taken. */
  n: number
}

/** The adaptively weighted estimate of one arm's value: scores Y over e where the arm was taken, zero elsewhere, weighted by the square root of e. */
export function armEstimate(opps: readonly Opportunity[], arm: 'move' | 'alternative'): ArmEstimate {
  let num = 0
  let den = 0
  let n = 0
  const scores: { h: number; g: number }[] = []
  for (const o of opps) {
    const e = arm === 'move' ? o.eMove : o.eAlternative
    if (!(e > 0)) continue
    const taken = o.arm === arm
    const g = taken ? (o.effect * o.weight) / e : 0
    const h = Math.sqrt(e)
    num += h * g
    den += h
    if (taken) n++
    scores.push({ h, g })
  }
  if (den === 0) return { mean: 0, variance: Infinity, n: 0 }
  const mean = num / den
  const variance = scores.reduce((s, x) => s + x.h * x.h * (x.g - mean) ** 2, 0) / den ** 2
  return { mean, variance, n }
}

/** The standard normal's tail probability, to a few decimals. */
export function normalTail(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989423 * Math.exp((-z * z) / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return z > 0 ? p : 1 - p
}

/** The standard normal quantile for a two-sided level, by bisection on the tail. */
export function zFor(level: number): number {
  const tail = (1 - level) / 2
  let lo = 0
  let hi = 8
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (normalTail(mid) > tail) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export interface AdaptiveInterval {
  diff: number
  lo: number
  hi: number
  p: number
  level: number
  nMove: number
  nAlternative: number
}

/** The difference between the two arms with a normal interval from the adaptive weights, and its two-sided p-value. */
export function adaptiveDiff(opps: readonly Opportunity[], level: number): AdaptiveInterval {
  const m = armEstimate(opps, 'move')
  const a = armEstimate(opps, 'alternative')
  const diff = m.mean - a.mean
  const se = Math.sqrt(m.variance + a.variance)
  if (!Number.isFinite(se) || se === 0) return { diff, lo: -Infinity, hi: Infinity, p: 1, level, nMove: m.n, nAlternative: a.n }
  const z = zFor(level)
  const p = Math.min(1, 2 * normalTail(Math.abs(diff) / se))
  return { diff, lo: diff - z * se, hi: diff + z * se, p, level, nMove: m.n, nAlternative: a.n }
}
