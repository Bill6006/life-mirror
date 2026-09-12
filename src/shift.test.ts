import { describe, expect, it } from 'vitest'
import { addDays } from './blocks'
import { baselineShift } from './shift'

const TODAY = '2026-09-30'
const series = (values: readonly number[]) => values.map((value, i) => ({ day: addDays(TODAY, -(values.length - i)), value }))

describe('change detection for sharp breaks', () => {
  it('says nothing under ten days of day readings', () => {
    expect(baselineShift(series([50, 50, 50, 50, 50, 50, 50, 50, 50]), TODAY)).toBeNull()
  })

  it('finds a sharp break, says since when, and gives both sides with their numbers', () => {
    const before = Array.from({ length: 14 }, (_, i) => 48 + (i % 3))
    const after = Array.from({ length: 10 }, (_, i) => 68 + (i % 3))
    const s = baselineShift(series([...before, ...after]), TODAY)
    expect(s).not.toBeNull()
    expect(s?.shifted).toBe(true)
    expect(s?.since).toBe(addDays(TODAY, -10))
    expect(s?.before).toEqual({ mean: 49, n: 14 })
    expect(s?.after).toEqual({ mean: 69, n: 10 })
    expect(s?.diff).toBe(20)
    expect(s?.t).toBeGreaterThan(3)
    expect(s?.days).toBe(24)
  })

  it('calls a steady baseline steady, and says what it rests on', () => {
    const steady = Array.from({ length: 24 }, (_, i) => 50 + ((i * 7) % 5) - 2)
    const s = baselineShift(series(steady), TODAY)
    expect(s?.shifted).toBe(false)
    expect(Math.abs(s?.t ?? 9)).toBeLessThan(3)
    expect(s?.days).toBe(24)
  })
})
