import { describe, expect, it } from 'vitest'
import { callOf, estimate, NO_DIFFERENCE, PROMISING, type Estimate, type TestUnit } from './pathTests'

// The slow loop's calls (P6, 2026-11-07), by hand: the estimate read within weeks, weighted by the recorded chances, the
// spread between weeks its uncertainty and the counts its floor; Promising and no meaningful difference only past their
// minimums, and a stricter Promising while two tests run.

const units = (week: number, a: [number, number], b: [number, number]): TestUnit[] => [
  ...Array.from({ length: a[1] }, (_, k) => ({ week, version: 0 as const, chance: 0.5, y: (k < a[0] ? 1 : 0) as 0 | 1 })),
  ...Array.from({ length: b[1] }, (_, k) => ({ week, version: 1 as const, chance: 0.5, y: (k < b[0] ? 1 : 0) as 0 | 1 })),
]
const FLAT = { mean: 0, sd: 10 }

describe('the estimate', () => {
  it('differences each week’s shares and averages the weeks by their size, so a level shared by both versions cancels', () => {
    // Week 0 low for both, week 1 high for both: the difference is +0.25 within each.
    const e = estimate([...units(0, [1, 4], [2, 4]), ...units(1, [3, 4], [4, 4])], FLAT)
    expect(e.diff).toBeCloseTo(0.25, 9)
    expect(e.weeks).toBe(2)
    expect(e.n).toEqual([8, 8])
  })
  it('weights each unit by the inverse of its recorded chance', () => {
    const e = estimate([{ week: 0, version: 0, chance: 0.5, y: 0 }, { week: 0, version: 1, chance: 0.25, y: 1 }, { week: 0, version: 1, chance: 0.75, y: 0 }, { week: 1, version: 0, chance: 0.5, y: 0 }, { week: 1, version: 1, chance: 0.5, y: 1 }], FLAT)
    // Week 0's second version: (1/0.25) / (1/0.25 + 1/0.75) = 0.75; week 1's: 1.
    expect(e.diff).toBeCloseTo((3 * 0.75 + 2 * 1) / 5, 9)
  })
  it('reads too few weeks as the prior alone, and never takes a spread of zero as certainty', () => {
    expect(estimate(units(0, [1, 4], [3, 4]), FLAT).diff).toBeNull()
    const same = estimate([...units(0, [1, 4], [3, 4]), ...units(1, [1, 4], [3, 4])], FLAT)
    expect(same.diff).toBeCloseTo(0.5, 9)
    expect(same.se ?? 0).toBeGreaterThan(0.2)
  })
})

const at = (pUp: number, pSmall: number, n: [number, number]): Estimate => ({ diff: 0.1, se: 0.1, weeks: 8, n, post: { mean: 0.1, sd: 0.1 }, pUp, pSmall })

describe('the calls', () => {
  it('say Promising only past its threshold, its weeks and its count on each version, either way', () => {
    expect(callOf(at(PROMISING.p, 0, [12, 12]), PROMISING.weeks, false)).toEqual({ kind: 'promising', toward: 1 })
    expect(callOf(at(1 - PROMISING.p, 0, [12, 12]), PROMISING.weeks, false)).toEqual({ kind: 'promising', toward: 0 })
    expect(callOf(at(PROMISING.p - 0.001, 0, [12, 12]), PROMISING.weeks, false).kind).toBe('couldNotTell')
    expect(callOf(at(0.999, 0, [12, 12]), PROMISING.weeks - 1, false).kind).toBe('couldNotTell')
    expect(callOf(at(0.999, 0, [11, 40]), PROMISING.weeks, false).kind).toBe('couldNotTell')
  })
  it('need more while two tests run', () => {
    expect(callOf(at(PROMISING.p, 0, [12, 12]), PROMISING.weeks, true).kind).toBe('couldNotTell')
    expect(callOf(at(PROMISING.pTwo, 0, [12, 12]), PROMISING.weeks, true).kind).toBe('promising')
  })
  it('say no meaningful difference only past its threshold, its weeks and its count', () => {
    expect(callOf(at(0.5, NO_DIFFERENCE.p, [20, 20]), NO_DIFFERENCE.weeks, false)).toEqual({ kind: 'noDifference' })
    expect(callOf(at(0.5, NO_DIFFERENCE.p - 0.01, [20, 20]), NO_DIFFERENCE.weeks, false).kind).toBe('couldNotTell')
    expect(callOf(at(0.5, 0.99, [20, 20]), NO_DIFFERENCE.weeks - 1, false).kind).toBe('couldNotTell')
    expect(callOf(at(0.5, 0.99, [19, 30]), NO_DIFFERENCE.weeks, false).kind).toBe('couldNotTell')
  })
})
