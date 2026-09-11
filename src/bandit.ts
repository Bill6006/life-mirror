import type { Effort } from './catalogue'

// Selection is a contextual bandit, as the plan's bar states it. Each candidate has a belief
// about its effect on the target in this situation; the app samples from every belief and
// offers the best draw, so every move keeps being tried where it might fit. One offer in five
// is a pure coin flip across the candidates; that slice is what the first honest claims rest on.

export interface Belief {
  /** Expected effect on the target, in anchor steps. */
  mean: number
  sd: number
  /** Opportunities behind it. */
  n: number
}

/** Phase 6: every belief is flat. Phase 8 brings the research priors; Phase 9 corrects them from the record. */
export const FLAT: Belief = { mean: 0, sd: 1, n: 0 }

export function beliefFor(_moveId: string, _situationKey: string): Belief {
  return FLAT
}

export const COIN_FLIP_RATE = 0.2

/** Starting effort is the top selection field: with equal beliefs, the lower effort wins the draw more often. */
export const EFFORT_PENALTY: Readonly<Record<Effort, number>> = { low: 0, medium: 0.5, high: 1 }

export type Rng = () => number

/** A standard normal draw from a uniform source. */
export function gaussian(rng: Rng): number {
  let u = 0
  let v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export interface Candidate {
  id: string
  effort: Effort
  /** A nudge, such as the harder rung when the readings allow it. */
  bonus?: number
}

export interface Choice {
  id: string
  coinFlip: boolean
  /** The sampled value per candidate; empty for a coin flip. */
  samples: Record<string, number>
  runnerUp: string | null
}

export function choose(candidates: readonly Candidate[], beliefs: (id: string) => Belief, rng: Rng = Math.random): Choice | null {
  if (candidates.length === 0) return null
  if (rng() < COIN_FLIP_RATE) {
    const i = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))
    const pick = candidates[i]
    const others = candidates.filter((c) => c.id !== pick.id)
    return { id: pick.id, coinFlip: true, samples: {}, runnerUp: others[0]?.id ?? null }
  }
  const samples: Record<string, number> = {}
  for (const c of candidates) {
    const b = beliefs(c.id)
    samples[c.id] = b.mean + b.sd * gaussian(rng) - EFFORT_PENALTY[c.effort] + (c.bonus ?? 0)
  }
  const ranked = [...candidates].sort((a, b) => samples[b.id] - samples[a.id])
  return { id: ranked[0].id, coinFlip: false, samples, runnerUp: ranked[1]?.id ?? null }
}

/** A small deterministic generator for tests. */
export function seeded(seed: number): Rng {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}
