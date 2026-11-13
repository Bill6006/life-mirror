import { describe, expect, it } from 'vitest'
import { MONTH_TRIES_A_DAY, monthReady, MONTHS_A_DAY, monthToRead, type MonthScheduleInput } from './monthSchedule'

// Which month is read next, and when (2026-11-13): each condition alone.

const input = (over: Partial<MonthScheduleInput> = {}): MonthScheduleInput => ({ today: '2026-11-13', hhmm: '14:00', months: ['2026-09', '2026-10', '2026-11'], written: [], runs: [], busy: false, ...over })

describe('the month to read', () => {
  it('is the oldest month that holds records, has had its days after it pass, and has no write-up', () => {
    expect(monthToRead(input())).toEqual({ first: '2026-09-01' })
    expect(monthToRead(input({ months: ['2026-11', '2026-10', '2026-09'] }))).toEqual({ first: '2026-09-01' })
    expect(monthToRead(input({ written: ['2026-09'] }))).toEqual({ first: '2026-10-01' })
  })

  it('is never the month still under way, nor one whose three days after it have not all passed', () => {
    expect(monthToRead(input({ written: ['2026-09', '2026-10'] }))).toEqual({ reason: 'no month is waiting to be read' })
    // October's third day after it is 3 November: it is read from the 4th.
    expect(monthReady('2026-10', '2026-11-03')).toBe(false)
    expect(monthReady('2026-10', '2026-11-04')).toBe(true)
    expect(monthToRead(input({ today: '2026-11-03', written: ['2026-09'] }))).toEqual({ reason: 'no month is waiting to be read' })
    expect(monthToRead(input({ today: '2026-11-04', written: ['2026-09'] }))).toEqual({ first: '2026-10-01' })
    expect(monthReady('not-a-month', '2026-11-13')).toBe(false)
  })

  it('is not a month that has a write-up, forgotten or not: nothing is read again by this rule', () => {
    expect(monthToRead(input({ written: ['2026-09', '2026-10'] }))).toEqual({ reason: 'no month is waiting to be read' })
  })

  it('is none between 9:00 and 11:30, which keep the window for the day’s line', () => {
    for (const hhmm of ['09:00', '10:15', '11:29']) expect(monthToRead(input({ hhmm })), hhmm).toEqual({ reason: 'quiet hours: 9:00 to 11:30 keep the window for the day’s line' })
    for (const hhmm of ['08:59', '11:30', '21:00']) expect(monthToRead(input({ hhmm })), hhmm).toEqual({ first: '2026-09-01' })
  })

  it('is none while the Brain’s own run or an answer to a question is under way', () => {
    expect(monthToRead(input({ busy: true }))).toEqual({ reason: 'waiting for the Brain’s run under way' })
  })

  it('is none while a month is being read: one at a time', () => {
    expect(monthToRead(input({ runs: [{ month: '2026-09', status: 'open' }] }))).toEqual({ reason: 'a month is being read' })
  })

  it('is none once two months were read today', () => {
    expect(MONTHS_A_DAY).toBe(2)
    expect(monthToRead(input({ written: ['2026-09'], runs: [{ month: '2026-09', status: 'written' }] }))).toEqual({ first: '2026-10-01' })
    expect(monthToRead(input({ months: ['2026-08', '2026-09', '2026-10'], written: ['2026-08', '2026-09'], runs: [{ month: '2026-08', status: 'written' }, { month: '2026-09', status: 'written' }] }))).toEqual({ reason: '2 months are read a day at most' })
  })

  it('tries a failed read again, three tries a day at most, and goes on to the next month meanwhile', () => {
    expect(MONTH_TRIES_A_DAY).toBe(3)
    const failed = (n: number) => Array.from({ length: n }, () => ({ month: '2026-09', status: 'failed' as const }))
    expect(monthToRead(input({ runs: failed(2) }))).toEqual({ first: '2026-09-01' })
    // Its tries used, the next month is read; a failed read does not count as a month read.
    expect(monthToRead(input({ runs: failed(3) }))).toEqual({ first: '2026-10-01' })
    expect(monthToRead(input({ months: ['2026-09'], runs: failed(3) }))).toEqual({ reason: 'today’s 3 tries are used; the month is tried again tomorrow' })
  })
})
