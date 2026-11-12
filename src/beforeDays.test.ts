import { describe, expect, it } from 'vitest'
import { addDays } from './blocks'
import { BEFORE_MIN, comesBefore, EVENING_READINGS, matchingPair, resampledInterval, standingLine } from './beforeDays'
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

/**
 * Ninety days back from 2026-09-30, as the screen was first seen saying both things at once: nine best days in no
 * rhythm, a nap on eighteen evenings with the morning after a little better, and stress high on twelve evenings with
 * the morning after lower. The stress pair's difference is past chance, and its own interval still reaches above nothing.
 */
function apartRecord(): CheckIn[] {
  const BEST = [3, 12, 20, 29, 37, 46, 54, 65, 78]
  const NAPS = [1, 3, 12, 20, 29, 37, 46, 54, 65, 8, 17, 26, 35, 44, 53, 62, 71, 86]
  const STRESSED = [2, 3, 5, 9, 16, 17, 19, 23, 30, 31, 33, 37]
  const good: Partial<Record<ReadingId, Position>> = { mood: 5, energy: 5, focus: 5, stress: 1, overwhelm: 1, irritation: 1 }
  const out: CheckIn[] = []
  for (let back = 90; back >= 1; back--) {
    const day = addDays('2026-09-30', -back)
    const best = BEST.includes(back)
    const morning: Partial<Record<ReadingId, Position>> = best ? good : { ...(NAPS.includes(back + 1) ? { mood: 4, energy: 4 } : {}), ...(STRESSED.includes(back + 1) ? { mood: 2, energy: 2, focus: 2 } : {}) }
    out.push(ci(day, 'morning', 3, morning), ci(day, 'evening', 3, best ? good : STRESSED.includes(back) ? { stress: 5 } : {}))
  }
  return out
}

/** Four fortnights, stressed on each one's 1st, 2nd, 4th and 8th evenings, the morning after lower each time. */
function streaky(): CheckIn[] {
  const out: CheckIn[] = []
  for (let i = 0; i < 56; i++) {
    const day = addDays('2026-07-01', i)
    const stressed = [0, 1, 3, 7].includes(i % 14)
    out.push(ci(day, 'evening', 3, { stress: stressed ? 5 : 3 }))
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

describe('the pattern tonight matches (stage 3, group 3)', () => {
  const today = '2026-09-20'

  it('gives each pair its standing among the sixteen, by the one standard', () => {
    // Four fortnights, stressed on each one's 1st, 2nd, 4th and 8th evenings: an arrangement a turn cannot mistake for itself.
    const pairs = comesBefore(streaky(), today, { resamples: 100 })
    const high = pairs.find((p) => p.reading === 'stress' && p.level === 'high')
    expect(high).toMatchObject({ withN: 16, withoutN: 40, standing: 'pattern', direction: 'lower', family: 1 })
    // No other reading was ever at its top two or lowest two phrases: nothing to compare, and nothing joins the family.
    expect(pairs.filter((p) => p !== high).every((p) => p.standing === 'tooFew' && p.family === 1)).toBe(true)
  })

  it('says a pair’s standing in the standard’s own words, and with a lead how many pairs were looked at', () => {
    expect(standingLine({ standing: 'pattern', family: 4 })).toBe('A steady pattern')
  })

  it('calls a pair a steady pattern only where its own interval keeps to one side of nothing', () => {
    const pair = comesBefore(apartRecord(), '2026-09-30').find((p) => p.reading === 'stress' && p.level === 'high')
    // Lower by about twelve on ten mornings, past chance on its own and the only pair tested; and an interval that reaches above nothing.
    expect(pair).toMatchObject({ withN: 10, enough: true, family: 1, direction: 'lower' })
    expect(Math.round(pair?.diff as number)).toBe(-12)
    expect(pair?.lo as number).toBeLessThan(0)
    expect(pair?.hi as number).toBeGreaterThan(0)
    // The row shows that interval, so it says a lead.
    expect(pair?.standing).toBe('lead')
    // Where the interval keeps to one side, a steady pattern stays one: the four fortnights' pair.
    const steady = comesBefore(streaky(), addDays('2026-07-01', 57)).find((p) => p.reading === 'stress' && p.level === 'high')
    expect(steady?.hi as number).toBeLessThan(0)
    expect(steady?.standing).toBe('pattern')
    expect(standingLine({ standing: 'lead', family: 4 })).toBe('A lead, not yet a pattern · 4 looked at')
    expect(standingLine({ standing: 'noPattern', family: 4 })).toBe('No clear pattern yet')
    expect(standingLine({ standing: 'tooFew', family: 0 })).toBe('Too few to compare yet')
  })

  it('reads a strictly alternating record as no clear pattern yet: turned round, every other day cannot be told from itself', () => {
    // Stressed every other evening for 24 days, the morning after lower each time. The difference and its interval are
    // as they were; the chance check, which keeps a streak a streak, has nothing to tell this arrangement from.
    const high = comesBefore(record(24), today, { resamples: 100 }).find((p) => p.reading === 'stress' && p.level === 'high')
    expect(high).toMatchObject({ enough: true, withN: 12, withoutN: 12, standing: 'noPattern', direction: 'lower' })
  })

  it('after an evening with stress high, shows the stress-high pair, the largest the evening matches', () => {
    const p = matchingPair(streaky(), ci(today, 'evening', 3, { stress: 5 }), { resamples: 200 })
    // A pair is shown beside tonight only at a lead or a pattern: one that reads as no clear pattern yet is not.
    expect(p?.standing).toBe('pattern')
    expect(matchingPair(record(24), ci(today, 'evening', 3, { stress: 5 }), { resamples: 200 })).toBeNull()
    expect(p?.reading).toBe('stress')
    expect(p?.level).toBe('high')
    expect(p?.enough).toBe(true)
  })

  it('shows nothing when tonight matches no pair that shows, or before any pair has enough mornings', () => {
    // Every reading in the middle tonight: no pair at either level matches.
    expect(matchingPair(record(24), ci(today, 'evening', 3), { resamples: 200 })).toBeNull()
    // Stress high tonight, but too few mornings yet for its pair to show.
    expect(matchingPair(record(BEFORE_MIN + 2), ci(today, 'evening', 3, { stress: 5 }), { resamples: 200 })).toBeNull()
  })

  it('belongs to the evening alone: a morning or an afternoon has no pattern', () => {
    expect(matchingPair(record(24), ci(today, 'morning', 3, { stress: 5 }), { resamples: 200 })).toBeNull()
  })
})
