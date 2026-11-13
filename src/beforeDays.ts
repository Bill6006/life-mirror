import { eveningPoints, likeForLike, type DayPoint } from './associations'
import { type Compared, type Direction, type Standing, standings, WORTH_POINTS } from './counted/compare'
import { guardComparisons } from './counted/fault'
import type { CheckIn } from './db'
import type { ReadingId } from './readings'

// Mirror → What comes before your days (the approved structure, 2026-09-23, replacing the table
// of every pair of readings moving together). Only pairs where one comes before the other: an
// evening with a reading at its top two phrases (high) or its lowest two (low), then the morning
// after. The comparison is the association engine's own, like for like: the mornings after such
// evenings against the mornings after the other evenings that started in the same band. Each pair
// carries a 95 percent interval from resampling the evenings, and shows only once both sides hold
// enough mornings; until then it says how many it has. An association, never a cause.

/** Mornings needed on each side before a pair shows its difference. */
export const BEFORE_MIN = 8

/** The readings every evening asks. */
export const EVENING_READINGS: readonly ReadingId[] = ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness']

export type Level = 'high' | 'low'

export interface BeforePair {
  reading: ReadingId
  level: Level
  /** Mornings after evenings with the reading at this level, and after the others. */
  withN: number
  withoutN: number
  /** The like-for-like difference in the morning's reading out of 100; null when nothing can be compared. */
  diff: number | null
  /** The 95 percent interval, from resampling; null until the pair has enough mornings. */
  lo: number | null
  hi: number | null
  enough: boolean
  /** Where the pair stands among all sixteen, by the one standard (2026-11-12), and which way it reads. */
  standing: Standing
  direction: Direction
  /** How many of the sixteen were tested: the number said with a lead. */
  family: number
}

/** A pair's standing as its row says it: the standing's own words, and with a lead how many pairs were looked at. */
export { standingLine } from './counted/words'

function atLevel(position: number, level: Level): boolean {
  return level === 'high' ? position >= 4 : position <= 2
}

/** A small seeded generator, so the interval is the same every time the screen draws it. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seedOf(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

function quantile(sorted: readonly number[], q: number): number {
  const i = (sorted.length - 1) * q
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)
}

/** The percentile interval of the like-for-like difference, resampling the evenings with replacement. */
export function resampledInterval(points: readonly DayPoint[], resamples: number, seed: number): { lo: number; hi: number } | null {
  const usable = points.filter((p) => p.outcome !== null)
  if (usable.length < 2) return null
  const rand = mulberry32(seed)
  const diffs: number[] = []
  for (let r = 0; r < resamples; r++) {
    const sample: DayPoint[] = []
    for (let i = 0; i < usable.length; i++) sample.push(usable[Math.floor(rand() * usable.length)])
    const d = likeForLike(sample).diff
    if (d !== null) diffs.push(d)
  }
  // Too many resamples with nothing to compare, and there is no honest interval.
  if (diffs.length < resamples * 0.8) return null
  diffs.sort((a, b) => a - b)
  return { lo: quantile(diffs, 0.025), hi: quantile(diffs, 0.975) }
}

/** Every evening reading at each level, with its difference, its interval once it has enough mornings, and its counts. */
/**
 * The pairs for the Mirror's card, under the comparisons' guard (2026-11-12): their chance is new math, so a throw leaves
 * the card saying they could not be worked out (null) and the failure kept for the Worker's report.
 */
export function comesBeforeGuarded(checkins: readonly CheckIn[], today: string): BeforePair[] | null {
  return guardComparisons(today, () => comesBefore(checkins, today))
}

export function comesBefore(checkins: readonly CheckIn[], today: string, opts: { min?: number; resamples?: number } = {}): BeforePair[] {
  const min = opts.min ?? BEFORE_MIN
  const resamples = opts.resamples ?? 600
  const pairs: BeforePair[] = []
  const compared: Compared[] = []
  for (const reading of EVENING_READINGS) {
    for (const level of ['high', 'low'] as const) {
      const points = eveningPoints(
        checkins,
        today,
        (c) => atLevel(c.answers[reading] as number, level),
        (c) => c.answers[reading] !== undefined,
      )
      const a = likeForLike(points, { id: `before.${reading}.${level}`, worth: WORTH_POINTS })
      compared.push(a.compared as Compared)
      const enough = a.withEvent.n >= min && a.without.n >= min && a.diff !== null
      const iv = enough ? resampledInterval(points, resamples, seedOf(`${reading}:${level}:${points.length}`)) : null
      pairs.push({ reading, level, withN: a.withEvent.n, withoutN: a.without.n, diff: a.diff, lo: iv?.lo ?? null, hi: iv?.hi ?? null, enough: enough && iv !== null, standing: 'tooFew', direction: 'none', family: 0 })
    }
  }
  // The sixteen pairs are one family: each is given its standing among all of them.
  standings(compared).forEach((s, i) => Object.assign(pairs[i], { standing: s.standing, direction: s.direction, family: s.family }))
  // A pair's row shows its interval beside its standing, so the two must not pull apart: a pair is called a steady
  // pattern only where its own interval keeps to one side of nothing. One whose interval still reaches the other
  // way, or that has no interval, is said as a lead (2026-11-12: "interval −22 to +2" had stood beside "A steady
  // pattern" on a stand-in record). Stricter than the standard alone, never looser.
  for (const p of pairs) if (p.standing === 'pattern' && (p.lo === null || p.hi === null || (p.lo <= 0 && p.hi >= 0))) p.standing = 'lead'
  const shown = pairs.filter((p) => p.enough).sort((p, q) => Math.abs(q.diff as number) - Math.abs(p.diff as number))
  const gathering = pairs.filter((p) => !p.enough).sort((p, q) => Math.min(q.withN, q.withoutN) - Math.min(p.withN, p.withoutN))
  return [...shown, ...gathering]
}

/**
 * After an evening check-in (stage 3, group 3): the one pair tonight's answers match, a reading at
 * its top two phrases or its lowest two whose pair already shows, the largest difference first; or
 * none. Tonight itself has no morning after yet, so it is never part of its own pair.
 */
export function matchingPair(checkins: readonly CheckIn[], tonight: Pick<CheckIn, 'day' | 'block' | 'answers'>, opts: { min?: number; resamples?: number } = {}): BeforePair | null {
  if (tonight.block !== 'evening') return null
  // Only a pair that stands at a lead or a pattern is shown beside tonight's answers (the one standard, 2026-11-12).
  const ready = comesBefore(checkins, tonight.day, opts).filter((p) => p.enough && p.diff !== null && (p.standing === 'lead' || p.standing === 'pattern'))
  const matched = ready.filter((p) => {
    const position = tonight.answers[p.reading]
    return position !== undefined && atLevel(position, p.level)
  })
  return matched.sort((p, q) => Math.abs(q.diff as number) - Math.abs(p.diff as number))[0] ?? null
}
