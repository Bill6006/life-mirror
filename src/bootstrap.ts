import type { Rng } from './rng'

// A resampled interval on the difference between two weighted means, with its two-sided p-value. Moved from tiers.ts
// unchanged (2026-10-20) when the old engine was retired: the readings' weight cards and the paths' own learning use it.

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
