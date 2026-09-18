import { describe, expect, it } from 'vitest'
import { addDays, localTime, minutesOf } from './time'

describe('local time in the phone’s zone', () => {
  it('turns the cron’s UTC instant into the local day, hour and weekday, in summer and in winter', () => {
    expect(localTime(new Date('2026-09-18T09:15:00Z'), 'America/New_York')).toEqual({ day: '2026-09-18', hour: 5, minute: 15, weekday: 5 })
    expect(localTime(new Date('2026-12-18T10:15:00Z'), 'America/New_York')).toEqual({ day: '2026-12-18', hour: 5, minute: 15, weekday: 5 })
    // Late evening in New York is the next day in UTC.
    expect(localTime(new Date('2026-09-19T03:30:00Z'), 'America/New_York')).toMatchObject({ day: '2026-09-18', hour: 23, minute: 30 })
    expect(localTime(new Date('2026-09-20T09:15:00Z'), 'America/New_York').weekday).toBe(0)
  })

  it('adds days across a month and reads a clock time', () => {
    expect(addDays('2026-09-01', -1)).toBe('2026-08-31')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(minutesOf('20:00')).toBe(1200)
    expect(minutesOf('05:15')).toBe(315)
  })
})
