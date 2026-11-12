import { describe, expect, it } from 'vitest'
import { beforeDay, dayBefore, dayStart, daysOf, occasionsOf, previousBand, weekdayOf } from './occasions'
import { at, checkin, day } from './testing'

// The occasions, on stand-in records (the counted foundation, 2026-11-12; in shadow). Every moment here is built from
// the test machine's own clock, so the rules about the day's start hold in whatever zone the suite runs.

describe('an occasion', () => {
  it('is made for each complete check-in, with its day, weekday, reading and band', () => {
    const occasions = occasionsOf([checkin(0, 'evening', { level: 4 }), checkin(0, 'morning'), checkin(1, 'morning', { completed: null })])
    expect(occasions.map((o) => [o.day, o.block, o.weekday, o.reading, o.band])).toEqual([
      ['2026-01-01', 'morning', 4, 50, 'gettingBy'],
      ['2026-01-01', 'evening', 4, 75, 'solid'],
    ])
  })

  it('covers a window from the check-in completed before it that day, else from the day’s start', () => {
    const [morning, afternoon] = occasionsOf([checkin(0, 'morning'), checkin(0, 'afternoon')])
    expect(morning.since).toBe(dayStart(day(0)))
    expect(afternoon.since).toBe(morning.at)
  })

  it('starts its day at four by the phone’s own clock', () => {
    expect(dayStart('2026-03-10')).toBe(new Date(2026, 2, 10, 4).toISOString())
    expect(weekdayOf('2026-01-01')).toBe(4)
    expect(dayBefore('2026-03-01')).toBe('2026-02-28')
  })
})

describe('what came before a day', () => {
  it('is last night, from the day’s own morning answer; with no answer it is unknown, never a no', () => {
    const days = daysOf([checkin(0, 'morning', { answers: { sleepHours: 2 } }), checkin(1, 'morning', { answers: { sleepHours: 3 } }), checkin(2, 'evening')])
    expect(beforeDay(day(0), days).shortNight).toBe(true)
    expect(beforeDay(day(1), days).shortNight).toBe(false)
    expect(beforeDay(day(2), days).shortNight).toBeNull()
  })

  it('is the evening of the day before, low when it read under 40', () => {
    const days = daysOf([checkin(0, 'evening', { level: 2 }), checkin(1, 'evening', { level: 3 }), checkin(2, 'morning')])
    expect(beforeDay(day(1), days)).toMatchObject({ lowEvening: true, yesterday: day(0) })
    expect(beforeDay(day(2), days).lowEvening).toBe(false)
    // No evening the day before: unknown.
    expect(beforeDay(day(0), days).lowEvening).toBeNull()
  })

  it('counts an evening logged after midnight: it is filed under the day before, and came before the next day began', () => {
    const days = daysOf([checkin(0, 'evening', { level: 2, completed: at(1, 1, 30) }), checkin(1, 'morning')])
    expect(beforeDay(day(1), days).lowEvening).toBe(true)
  })

  it('is never later than the day’s start: an evening completed after the next day began says nothing about it', () => {
    const days = daysOf([checkin(0, 'evening', { level: 2, completed: at(1, 4, 30) }), checkin(1, 'morning')])
    expect(beforeDay(day(1), days).lowEvening).toBeNull()
    expect(previousBand(days.occasions[1], days)).toBeNull()
  })

  it('gives the band of the check-in completed before the window began, for display', () => {
    const days = daysOf([checkin(0, 'evening', { level: 4 }), checkin(1, 'morning', { level: 2 }), checkin(1, 'afternoon')])
    const [, morning, afternoon] = days.occasions
    expect(previousBand(morning, days)).toBe('solid')
    expect(previousBand(afternoon, days)).toBe('wornDown')
  })
})
