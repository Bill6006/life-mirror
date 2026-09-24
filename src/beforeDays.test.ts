import { describe, expect, it } from 'vitest'
import { addDays } from './blocks'
import { BEFORE_MIN, comesBefore, EVENING_READINGS, resampledInterval } from './beforeDays'
import type { CheckIn } from './db'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'

const allAt = (ids: readonly ReadingId[], p: Position, over: Partial<Record<ReadingId, Position>> = {}): Answers => ({ ...Object.fromEntries(ids.map((id) => [id, p])), ...over })
const ci = (day: string, block: CheckIn['block'], p: Position, over: Partial<Record<ReadingId, Position>> = {}): CheckIn => ({ day, block, answers: allAt(blockReadings(block), p, over), startedAt: '', completedAt: 'x', updatedAt: '', activeMs: 30_000 })

/** n evenings; every other one has stress at its top phrase, and the morning after those reads lower. */
function record(n: number, start = '2026-08-01'): CheckIn[] {
  const out: CheckIn[] = []
  for (let i = 0; i < n; i++) {
    const day = addDays(start, i)
    const stressed = i % 2 === 0
    out.push(ci(day, 'evening', 3, { stress: stressed ? 5 : 3 }))
    // The morning after a stressed evening reads worse on every ingredient: the ones that count up lower, the ones that count down higher.
    out.push(ci(addDays(day, 1), 'morning', 3, stressed ? { mood: 2, energy: 2, focus: 2, stress: 4, overwhelm: 4, irritation: 4 } : {}))
  }
  return out
}

describe('what comes before your days', () => {
  const today = '2026-09-20'

  it('reads every evening reading at both levels, and nothing but the evening readings', () => {
    const pairs = comesBefore(record(24), today, { resamples: 200 })
    expect(pairs).toHaveLength(EVENING_READINGS.length * 2)
    expect(new Set(pairs.map((p) => p.reading))).toEqual(new Set(EVENING_READINGS))
  })

  it('shows a pair once both sides hold enough mornings: its like-for-like difference and an interval around it', () => {
    const pairs = comesBefore(record(24), today, { resamples: 400 })
    const high = pairs.find((p) => p.reading === 'stress' && p.level === 'high')
    expect(high).toBeDefined()
    expect(high?.enough).toBe(true)
    expect(high?.withN).toBe(12)
    expect(high?.withoutN).toBe(12)
    // The mornings after a stressed evening read lower, and the interval stays below zero.
    expect(high?.diff).toBeLessThan(0)
    expect(high?.lo as number).toBeLessThanOrEqual(high?.diff as number)
    expect(high?.hi as number).toBeGreaterThanOrEqual(high?.diff as number)
    expect(high?.hi as number).toBeLessThan(0)
    // Shown pairs come first, largest difference first.
    expect(pairs[0].enough).toBe(true)
  })

  it('says how many mornings it has until a pair has enough, and draws no interval before then', () => {
    const pairs = comesBefore(record(BEFORE_MIN + 2), today, { resamples: 200 })
    const high = pairs.find((p) => p.reading === 'stress' && p.level === 'high')
    expect(high?.enough).toBe(false)
    expect(high?.withN).toBeLessThan(BEFORE_MIN)
    expect(high?.lo).toBeNull()
    // No evening had stress at its lowest two phrases: nothing on that side at all.
    const low = pairs.find((p) => p.reading === 'stress' && p.level === 'low')
    expect(low?.withN).toBe(0)
    expect(low?.enough).toBe(false)
  })

  it('draws the same interval every time for the same record', () => {
    const a = comesBefore(record(24), today, { resamples: 300 }).find((p) => p.reading === 'stress' && p.level === 'high')
    const b = comesBefore(record(24), today, { resamples: 300 }).find((p) => p.reading === 'stress' && p.level === 'high')
    expect(a).toEqual(b)
  })

  it('reads only evenings before today', () => {
    const pairs = comesBefore(record(24), '2026-08-05', { resamples: 100 })
    const high = pairs.find((p) => p.reading === 'stress' && p.level === 'high')
    expect((high?.withN ?? 0) + (high?.withoutN ?? 0)).toBeLessThanOrEqual(4)
  })

  it('gives no interval when there is nothing to resample', () => {
    expect(resampledInterval([], 100, 1)).toBeNull()
  })
})
