import { describe, expect, it } from 'vitest'
import { fisherGreater, fisherTwoSided, holmAdjusted } from './exact'

// The exact tests the honesty checks rest on (stage R7), against values worked by hand and published ones.

describe('Fisher’s exact test', () => {
  it('gives the tea-tasting table its published values: one-sided 17 in 70, two-sided 34 in 70', () => {
    // Fisher's lady tasting tea: 3 and 1 / 1 and 3. The tables with these margins hold 1, 16, 36, 16 and 1 arrangements of 70.
    expect(fisherGreater(3, 1, 1, 3)).toBeCloseTo(17 / 70, 12)
    expect(fisherTwoSided(3, 1, 1, 3)).toBeCloseTo(34 / 70, 12)
    expect(fisherGreater(4, 0, 0, 4)).toBeCloseTo(1 / 70, 12)
  })

  it('gives one where nothing could be more extreme the other way, and never more than one', () => {
    expect(fisherGreater(0, 5, 5, 0)).toBeCloseTo(1, 12)
    expect(fisherTwoSided(2, 2, 2, 2)).toBeCloseTo(1, 12)
    expect(fisherGreater(0, 0, 0, 0)).toBe(1)
  })

  it('agrees with the same sums in exact integer arithmetic, for a strong cluster and an even split', () => {
    // 6 misses of 7 slots on one kind of day, against 10 of 50 on the rest; then 2 of 7 against 14 of 50. Worked
    // independently with Python's math.comb (2026-10-19): 0.0012851217944973422, 0.6428547405239969, two-sided 0.001285…
    expect(fisherGreater(6, 1, 10, 40)).toBeCloseTo(0.0012851217944973422, 12)
    expect(fisherGreater(2, 5, 14, 36)).toBeCloseTo(0.6428547405239969, 12)
    expect(fisherTwoSided(6, 1, 10, 40)).toBeCloseTo(0.001285121794497342, 12)
  })
})

describe('Holm’s correction', () => {
  it('multiplies the smallest by the number of comparisons, the next by one fewer, and never lets the order invert', () => {
    expect(holmAdjusted([0.01, 0.04, 0.03])).toEqual([0.03, 0.06, 0.06])
    expect(holmAdjusted([0.5, 0.001])).toEqual([0.5, 0.002])
    expect(holmAdjusted([0.9, 0.8])).toEqual([1, 1])
    expect(holmAdjusted([])).toEqual([])
  })
})
