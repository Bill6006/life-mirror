import { describe, expect, it } from 'vitest'
import { lastNightLine, moveLine } from './brief'
import type { CheckIn, DayContext } from './db'
import { lastNightKeys } from './forecastFlow'

describe('the brief', () => {
  const evening = (extras: CheckIn['extras']): CheckIn => ({ day: '2026-09-10', block: 'evening', answers: {}, startedAt: '', completedAt: 'x', updatedAt: '', activeMs: 0, extras })
  const ctx = (churchDay: boolean): DayContext => ({ day: '2026-09-10', weekday: 4, withHer: true, studyNight: false, churchDay, pickupTime: null, soloUntil: '20:00', changed: false, createdAt: '' })

  it('reads what last night carried from the evening, the day and the outside days', () => {
    expect(lastNightKeys(evening({ dinner: true, napped: true, necessities: { food: true } }), ctx(true), true)).toEqual(['dinner', 'napped', 'necessity', 'churchDay', 'workout'])
    expect(lastNightKeys(undefined, undefined, false)).toEqual([])
  })

  it('sets last night against the mornings after evenings like it, or falls back to yesterday beside what happened', () => {
    expect(lastNightLine({ lastNight: { key: 'dinner', with: 55, without: 62, n: 9 }, yesterday: null })).toBe('Last night carried a late or heavy dinner. Mornings after evenings like it have read 55, against 62 after evenings that started the same (9).')
    expect(lastNightLine({ lastNight: { key: 'workout', with: null, without: null, n: 1 }, yesterday: null })).toContain('the first time recorded')
    expect(lastNightLine({ lastNight: null, yesterday: { expected: 60, actual: 64, hit: true } })).toBe('Yesterday: expected 60, read 64; within the range.')
    expect(lastNightLine({ lastNight: null, yesterday: null })).toBe('Last night carried nothing the record can set this morning against.')
  })

  it('reads yesterday’s move this morning as one reading, never a finding', () => {
    expect(moveLine({ moveId: 'walk-ten', target: 'mood', effect: 0.42, arm: 'done' })).toBe('Yesterday, A ten-minute walk, now: Done. Mood read 0.4 of a step above your usual this morning. One reading, not a finding.')
    expect(moveLine({ moveId: 'nothing', target: 'stress', effect: -1, arm: 'partly' })).toContain('under your usual')
    expect(moveLine(null)).toBeNull()
  })
})
