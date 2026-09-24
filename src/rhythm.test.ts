import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from './settings'
import { dueOf, inStudyTime, isFaithPractice, quiet, rankOf, rhythmOf, scheduleOf, type DueInput } from './rhythm'

// Workstream 6, Part 39: a commitment is due by its own rhythm or its own fixed days, never by the
// time of day, never by a draw, and never by an assumed cadence; a preferred study time only orders.

const THU = '2026-09-24'
const base = (over: Partial<DueInput> = {}): DueInput => ({ rhythm: null, schedule: [], paused: false, started: false, doneToday: false, partlyToday: false, planned: false, faith: false, practiceDays: [], today: THU, ...over })

describe('when a commitment is due', () => {
  it('assumes nothing: with no rhythm and no fixed days it is open, there whenever you want it, and never due', () => {
    expect(dueOf(base())).toEqual({ state: 'open', by: null })
    expect(dueOf(base({ practiceDays: [] })).state).toBe('open')
  })

  it('is due by its rhythm until the week’s sessions are in, counting different days in the seven before today', () => {
    const r = { perWeek: 3, restDays: 0 }
    expect(dueOf(base({ rhythm: r }))).toEqual({ state: 'due', by: 'rhythm', week: 0, behind: 3 })
    expect(dueOf(base({ rhythm: r, practiceDays: ['2026-09-18', '2026-09-20', '2026-09-20', '2026-09-22'] }))).toEqual({ state: 'notDue', by: 'rhythm', week: 3 })
    // A day eight days back has left the window, and today's own sessions are counted as today, not the week.
    expect(dueOf(base({ rhythm: r, practiceDays: ['2026-09-16', '2026-09-20', '2026-09-22'] }))).toMatchObject({ state: 'due', week: 2, behind: 1 })
  })

  it('keeps a rest day after a session for a skill that needs recovery', () => {
    const r = { perWeek: 3, restDays: 1 }
    expect(dueOf(base({ rhythm: r, practiceDays: ['2026-09-23'] }))).toMatchObject({ state: 'resting', by: 'rhythm' })
    expect(dueOf(base({ rhythm: r, practiceDays: ['2026-09-22'] }))).toMatchObject({ state: 'due' })
    expect(dueOf(base({ rhythm: { perWeek: 2, restDays: 2 }, practiceDays: ['2026-09-22'] })).state).toBe('resting')
  })

  it('on fixed days is due on those days alone, and says the next one otherwise', () => {
    // 2026-09-24 is a Thursday (4).
    expect(dueOf(base({ schedule: [2, 4, 6] }))).toEqual({ state: 'due', by: 'schedule' })
    expect(dueOf(base({ schedule: [1, 2], rhythm: { perWeek: 7, restDays: 0 } }))).toEqual({ state: 'notDue', by: 'schedule', next: 1 })
  })

  it('puts what you did or planned today before any count: started, done, partly, your plan', () => {
    const r = { perWeek: 1, restDays: 0 }
    const met = ['2026-09-23']
    expect(dueOf(base({ rhythm: r, practiceDays: met, started: true })).state).toBe('started')
    expect(dueOf(base({ rhythm: r, doneToday: true })).state).toBe('done')
    expect(dueOf(base({ rhythm: r, partlyToday: true })).state).toBe('partly')
    expect(dueOf(base({ rhythm: r, practiceDays: met, planned: true }))).toEqual({ state: 'planned', by: 'plan' })
    expect(dueOf(base({ rhythm: r, paused: true, planned: true })).state).toBe('paused')
  })

  it('never makes a faith practice due by a count of days, only by its fixed days or your plan (Rule 10)', () => {
    expect(dueOf(base({ faith: true, rhythm: { perWeek: 7, restDays: 0 } })).state).toBe('open')
    expect(dueOf(base({ faith: true, schedule: [4] })).state).toBe('due')
    expect(dueOf(base({ faith: true, planned: true })).state).toBe('planned')
    expect(isFaithPractice({ kind: 'practice', stepMoveId: 'five-minutes-prayer' })).toBe(true)
    expect(isFaithPractice({ kind: 'practice', stepMoveId: 'walk-ten' })).toBe(false)
    expect(isFaithPractice({ kind: 'certification', stepMoveId: null })).toBe(false)
  })

  it('orders rows: started, planned, due, partly, open, done today, then what rests or is not due, which stays quiet', () => {
    const order = (['notDue', 'done', 'open', 'partly', 'due', 'planned', 'started', 'resting'] as const).slice().sort((a, b) => rankOf({ state: a }) - rankOf({ state: b }))
    expect(order).toEqual(['started', 'planned', 'due', 'partly', 'open', 'done', 'notDue', 'resting'])
    expect(quiet({ state: 'resting' })).toBe(true)
    expect(quiet({ state: 'notDue' })).toBe(true)
    expect(quiet({ state: 'open' })).toBe(false)
  })

  it('reads a stored rhythm and fixed days only when they make sense; anything else is flexible', () => {
    expect(rhythmOf({ perWeek: 3, restDays: 1 })).toEqual({ perWeek: 3, restDays: 1 })
    expect(rhythmOf({ perWeek: 3 })).toEqual({ perWeek: 3, restDays: 0 })
    for (const bad of [null, {}, { perWeek: 0 }, { perWeek: 8 }, { perWeek: 2.5 }, { perWeek: 3, restDays: 3 }, 'x']) expect(rhythmOf(bad)).toBeNull()
    expect(scheduleOf([4, 1, 1, 9, -1, 2.5, 0])).toEqual([0, 1, 4])
    expect(scheduleOf('x')).toEqual([])
  })
})

describe('a preferred study time', () => {
  const week = (days: number[], part?: 'any' | 'morning' | 'afternoon' | 'evening') => ({ week: { ...DEFAULT_SETTINGS.week, studyNights: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, days.includes(d)])) as typeof DEFAULT_SETTINGS.week.studyNights, ...(part ? { studyPart: part } : {}) } })

  it('holds on its days, at any time unless a part of the day is chosen, and nowhere else', () => {
    const thuNoon = new Date(2026, 8, 24, 12, 30)
    const thuNight = new Date(2026, 8, 24, 20, 0)
    expect(inStudyTime(week([4]), thuNoon)).toBe(true)
    expect(inStudyTime(week([4], 'evening'), thuNoon)).toBe(false)
    expect(inStudyTime(week([4], 'evening'), thuNight)).toBe(true)
    expect(inStudyTime(week([1]), thuNoon)).toBe(false)
    expect(inStudyTime(week([]), thuNoon)).toBe(false)
  })
})
