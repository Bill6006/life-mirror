import { describe, expect, it, vi } from 'vitest'

// The chance check of a named comparison is kept by exactly what it was computed from (Phase 3, 2026-11-12), so a
// family that the brief card and the sheet both gather pays for its shuffles once. The core's own function is
// watched here to count how often it is really asked.
vi.mock('./counted/compare', async (original) => {
  const real = await original<typeof import('./counted/compare')>()
  return { ...real, compare: vi.fn(real.compare) }
})

import { likeForLike, type DayPoint } from './associations'
import { compare } from './counted/compare'

const day = (n: number): string => new Date(Date.UTC(2031, 0, 6 + n)).toISOString().slice(0, 10)
/** Four fortnights of evenings in one band: with the thing on each fortnight's 1st, 2nd, 4th and 8th days, without on its 3rd, 6th, 10th and 13th. */
const evenings = (withReads: number, withoutReads: number): DayPoint[] =>
  Array.from({ length: 4 }, (_, f) => [
    ...[0, 1, 3, 7].map((d): DayPoint => ({ day: day(14 * f + d), band: 'gettingBy', event: true, outcome: withReads })),
    ...[2, 5, 9, 12].map((d): DayPoint => ({ day: day(14 * f + d), band: 'gettingBy', event: false, outcome: withoutReads })),
  ]).flat()
const asked = (): number => vi.mocked(compare).mock.calls.length

describe('the chance of a named comparison, kept by what it was computed from', () => {
  it('is worked out once for the same occasions, id and size, and gives the same answer', () => {
    const before = asked()
    const first = likeForLike(evenings(70, 50), { id: 'kept.one', worth: 10 })
    const second = likeForLike(evenings(70, 50), { id: 'kept.one', worth: 10 })
    expect(asked() - before).toBe(1)
    expect(first.compared?.p).toBeLessThan(0.05)
    expect(second.compared).toEqual(first.compared)
  })

  it('is worked out again when one occasion reads differently, when the size worth saying changes, and for another id', () => {
    likeForLike(evenings(70, 50), { id: 'kept.two', worth: 10 })
    const before = asked()
    const changed = evenings(70, 50)
    changed[5] = { ...changed[5], outcome: 51 }
    const again = likeForLike(changed, { id: 'kept.two', worth: 10 })
    expect(asked() - before).toBe(1)
    expect(again.compared?.diff).not.toBe(20)
    // One more evening with the thing: the counts change, and so does what is kept.
    likeForLike([...evenings(70, 50), { day: day(60), band: 'gettingBy', event: true, outcome: 70 }], { id: 'kept.two', worth: 10 })
    likeForLike(evenings(70, 50), { id: 'kept.two', worth: 25 })
    likeForLike(evenings(70, 50), { id: 'kept.three', worth: 10 })
    expect(asked() - before).toBe(4)
  })

  it('never asks for a comparison nobody named, or one with too few to test', () => {
    const before = asked()
    likeForLike(evenings(70, 50))
    likeForLike(evenings(70, 50).slice(0, 10), { id: 'kept.few', worth: 10 })
    expect(asked() - before).toBe(0)
  })
})
