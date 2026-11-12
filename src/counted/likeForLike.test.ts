import { describe, expect, it } from 'vitest'
import { type Association, type DayPoint, likeForLike } from '../associations'
import type { Band } from '../score'
import { seeded } from './compare'

// The app's like-for-like comparison now takes its difference from the counted foundation (2026-11-12). It must give
// the numbers it always gave. The function below is the one the app carried until that day, kept here word for word
// as the reference; five hundred seeded records are put through both.

function meanOf(values: readonly number[]): number | null {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null
}

function asItWas(points: readonly DayPoint[]): Association {
  const withEvent = points.filter((p) => p.event)
  const without = points.filter((p) => !p.event)
  const withValues = withEvent.map((p) => p.outcome).filter((v): v is number => v !== null)
  const withoutValues = without.map((p) => p.outcome).filter((v): v is number => v !== null)
  let diffSum = 0
  let weightSum = 0
  let bands = 0
  for (const band of ['empty', 'wornDown', 'gettingBy', 'solid', 'firing'] as Band[]) {
    const a = withEvent.filter((p) => p.band === band && p.outcome !== null).map((p) => p.outcome as number)
    const b = without.filter((p) => p.band === band && p.outcome !== null).map((p) => p.outcome as number)
    if (!a.length || !b.length) continue
    const w = Math.min(a.length, b.length)
    diffSum += w * ((meanOf(a) as number) - (meanOf(b) as number))
    weightSum += w
    bands++
  }
  const diff = weightSum > 0 ? diffSum / weightSum : null
  return { times: withEvent.length, withEvent: { mean: meanOf(withValues), n: withValues.length }, without: { mean: meanOf(withoutValues), n: withoutValues.length }, diff, bands }
}

const BANDS: (Band | null)[] = ['empty', 'wornDown', 'gettingBy', 'solid', 'firing', null]

/** A seeded record: a few to sixty evenings, some with no band, some with no morning after, in no order of band. */
function record(seed: number): DayPoint[] {
  const next = seeded(seed)
  const length = Math.floor(next() * 60)
  return Array.from({ length }, (_, i) => ({
    day: `2031-01-${String(1 + (i % 28)).padStart(2, '0')}`,
    band: BANDS[Math.floor(next() * BANDS.length)],
    event: next() < 0.35,
    outcome: next() < 0.12 ? null : Math.round(next() * 1000) / 10,
  }))
}

describe('the like-for-like comparison, through the counted foundation', () => {
  it('gives every number it always gave, on five hundred seeded records', () => {
    let compared = 0
    for (let seed = 1; seed <= 500; seed++) {
      const points = record(seed)
      const now = likeForLike(points)
      const was = asItWas(points)
      expect(now, `seed ${seed}`).toEqual(was)
      // Not near: the same.
      expect(Object.is(now.diff, was.diff), `seed ${seed}`).toBe(true)
      if (was.diff !== null) compared++
    }
    // The probe can say yes: most of these records hold a difference to compare.
    expect(compared).toBeGreaterThan(400)
  })

  it('keeps what it has always done with an evening that has no band, and with no band shared', () => {
    // An evening not logged in full has no band: it counts toward the means and the counts, and toward no difference.
    const unbanded: DayPoint[] = [
      { day: '2031-01-01', band: null, event: true, outcome: 80 },
      { day: '2031-01-02', band: null, event: false, outcome: 40 },
    ]
    expect(likeForLike(unbanded)).toEqual({ times: 1, withEvent: { mean: 80, n: 1 }, without: { mean: 40, n: 1 }, diff: null, bands: 0 })
    const apart: DayPoint[] = [
      { day: '2031-01-01', band: 'solid', event: true, outcome: 80 },
      { day: '2031-01-02', band: 'wornDown', event: false, outcome: 40 },
    ]
    expect(likeForLike(apart)).toMatchObject({ diff: null, bands: 0 })
    expect(likeForLike([])).toEqual({ times: 0, withEvent: { mean: null, n: 0 }, without: { mean: null, n: 0 }, diff: null, bands: 0 })
  })
})
