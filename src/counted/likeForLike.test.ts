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

describe('the like-for-like comparison, named for the chance check', () => {
  const evening = (n: number, band: Band, event: boolean, outcome: number): DayPoint => ({ day: `2031-0${1 + Math.floor(n / 28)}-${String(1 + (n % 28)).padStart(2, '0')}`, band, event, outcome })
  /** Two fortnights: in each, evenings with the thing on its 1st, 2nd, 4th and 8th days and without on its 3rd, 6th, 10th and 13th, all in one band. */
  const WITH = [0, 1, 3, 7, 14, 15, 17, 21]
  const WITHOUT = [2, 5, 9, 12, 16, 19, 23, 26]

  it('asks nothing beyond the numbers unless it is named', () => {
    const points = [...WITH.map((n) => evening(n, 'solid', true, 70)), ...WITHOUT.map((n) => evening(n, 'solid', false, 50))]
    expect(likeForLike(points).compared).toBeUndefined()
    expect(likeForLike(points, { id: 'assoc.x', worth: 10 })).toMatchObject({ diff: 20, bands: 1, compared: { id: 'assoc.x', n: 8, m: 8, diff: 20, enough: true, worth: 10 } })
    // One arrangement in sixty-four sets all eight against all eight: the core's own chance for these evenings.
    const p = likeForLike(points, { id: 'assoc.x', worth: 10 }).compared?.p as number
    expect(p).toBeGreaterThan(0.008)
    expect(p).toBeLessThan(0.03)
  })

  it('tests nothing under eight matched evenings a side, however many unmatched evenings there are', () => {
    // Ten evenings with the thing, all solid. Ten without: three solid, seven worn down, where no evening had it.
    const points = [...Array.from({ length: 10 }, (_, i) => evening(i, 'solid', true, 70)), ...Array.from({ length: 3 }, (_, i) => evening(10 + i, 'solid', false, 50)), ...Array.from({ length: 7 }, (_, i) => evening(13 + i, 'wornDown', false, 30))]
    expect(likeForLike(points, { id: 'assoc.x', worth: 10 })).toMatchObject({ diff: 20, bands: 1, compared: { n: 10, m: 3, enough: false, p: null } })
  })
})

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
