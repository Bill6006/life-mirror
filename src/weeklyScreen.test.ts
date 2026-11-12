import { describe, expect, it } from 'vitest'
import { aheadRangeLine, MEASURED_FROM, movedWords, rangeWords } from './weeklyScreen'

// Final UI polish (2026-09-26): the week's range is said plainly, whichever way it runs from tomorrow
// to a week out. A later range can be wider, narrower or only shifted; it is never said to widen.

describe('the week ahead’s range, in plain words', () => {
  it('names both ranges when they differ, as the owner worded it', () => {
    expect(aheadRangeLine({ near: { lo: 64, hi: 80 }, far: { lo: 68, hi: 83 } })).toBe('Expected range: 64–80 tomorrow and 68–83 a week out.')
  })

  it('never says the range widens, whether it widens, narrows or only shifts', () => {
    const lines = [
      aheadRangeLine({ near: { lo: 64, hi: 80 }, far: { lo: 68, hi: 83 } }),
      aheadRangeLine({ near: { lo: 60, hi: 84 }, far: { lo: 66, hi: 78 } }),
      aheadRangeLine({ near: { lo: 66, hi: 78 }, far: { lo: 60, hi: 84 } }),
    ]
    for (const l of lines) expect(l).not.toMatch(/widen/i)
    expect(lines[2]).toBe('Expected range: 66–78 tomorrow and 60–84 a week out.')
  })

  it('says one range once when every day has the same', () => {
    expect(aheadRangeLine({ near: { lo: 70, hi: 80 }, far: { lo: 70, hi: 80 } })).toBe('Expected range: 70–80 each day.')
  })
})

// 2026-11-12: the card said "Six in ten of the check-ins it forecast before landed inside a range this wide" as fixed
// words. That is how the range is built, not what was measured. It now says how the range is built until twenty
// day-ahead forecasts are scored, and from then the count itself.
describe('what the week-ahead card says of its range', () => {
  it('says how the range is built, and no measured rate, until twenty day-ahead forecasts are scored', () => {
    const built = 'Its range is sized from its own misses over those weeks, so that six in ten of them fall inside it. How often its forecasts land is said here once twenty day-ahead forecasts are scored.'
    expect(rangeWords({ scored: 0, hitRate: null })).toBe(built)
    expect(rangeWords({ scored: 19, hitRate: 18 / 19 })).toBe(built)
    expect(built).not.toMatch(/percent|landed inside/)
  })

  it('says what was counted from the twentieth on: how many landed inside their range, never a fixed six in ten', () => {
    expect(MEASURED_FROM).toBe(20)
    expect(rangeWords({ scored: 20, hitRate: 13 / 20 })).toBe('Of 20 day-ahead forecasts scored so far, 13 landed inside their range (65 percent).')
    expect(rangeWords({ scored: 41, hitRate: 20 / 41 })).toBe('Of 41 day-ahead forecasts scored so far, 20 landed inside their range (49 percent).')
    expect(rangeWords({ scored: 30, hitRate: 0 })).toBe('Of 30 day-ahead forecasts scored so far, 0 landed inside their range (0 percent).')
  })
})

describe('what moved this week, each reading in its own direction (stage 1, item a)', () => {
  it('says a fall in Stress as down and better, a fall in Mood as down and worse, and no change as none', () => {
    expect(movedWords({ reading: 'stress', thisWeek: 2, lastWeek: 2.5, delta: 0.5 })).toBe('Stress: down 0.50 steps, better')
    expect(movedWords({ reading: 'mood', thisWeek: 3, lastWeek: 3.5, delta: -0.5 })).toBe('Mood: down 0.50 steps, worse')
    expect(movedWords({ reading: 'irritation', thisWeek: 3, lastWeek: 2, delta: -1 })).toBe('Irritation: up 1.00 steps, worse')
    expect(movedWords({ reading: 'energy', thisWeek: 3, lastWeek: 3, delta: 0 })).toBe('Energy: no change')
  })
})
