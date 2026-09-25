import { describe, expect, it } from 'vitest'
import { clock12, clockTimes12, clockTimesIn, formatHHMM, formatTime, formatWhen } from './format'

// Every clock time a screen shows reads as the owner reads one, 5:30 PM, whatever the phone's
// locale; what is kept, compared and scheduled stays HH:MM (truth audit, 2026-09-24).

describe('clock times, shown', () => {
  it('reads 17:30 as 5:30 PM, and midnight and noon as 12', () => {
    expect(clock12(17, 30)).toBe('5:30 PM')
    expect(clock12(9, 5)).toBe('9:05 AM')
    expect(clock12(0, 15)).toBe('12:15 AM')
    expect(clock12(12, 0)).toBe('12:00 PM')
    expect(clock12(23, 59)).toBe('11:59 PM')
  })

  it('shows a kept HH:MM, and leaves anything that is no time as it was', () => {
    expect(formatHHMM('17:30')).toBe('5:30 PM')
    expect(formatHHMM('07:30')).toBe('7:30 AM')
    expect(formatHHMM('20:00')).toBe('8:00 PM')
    expect(formatHHMM('24:10')).toBe('24:10')
    expect(formatHHMM('')).toBe('')
  })

  it('shows a moment on record at its local time of day, and with its date', () => {
    const at = new Date(2026, 8, 24, 17, 30).toISOString()
    expect(formatTime(at)).toBe('5:30 PM')
    expect(formatWhen(at)).toMatch(/, 5:30 PM$/)
    expect(formatTime('not a time')).toBe('not a time')
  })

  it('turns every clock time in words written from the facts into 5:30 PM, and nothing that is no time', () => {
    expect(clockTimes12('After pickup at 17:30, say hello to the next person you see.')).toBe('After pickup at 5:30 PM, say hello to the next person you see.')
    expect(clockTimes12('Today is Thursday; a daycare day with pickup at 17:30; her bedtime 20:00; the hour is 9.')).toBe('Today is Thursday; a daycare day with pickup at 5:30 PM; her bedtime 8:00 PM; the hour is 9 AM.')
    // The day's shape names the hour as a bare number for its writers; shown, it reads as a time of day.
    expect(clockTimes12('Today is Friday; not a daycare day; the hour is 16.')).toBe('Today is Friday; not a daycare day; the hour is 4 PM.')
    expect(clockTimes12('the hour is 0, the hour is 12, the hour is 23')).toBe('the hour is 12 AM, the hour is 12 PM, the hour is 11 PM')
    expect(clockTimes12('the hour is 4 PM; the hour is 30')).toBe('the hour is 4 PM; the hour is 30')
    expect(clockTimes12('At 6:08 am, and 5:30 p.m.')).toBe('At 6:08 AM, and 5:30 PM.')
    expect(clockTimes12('Checked in at 07:05 and 00:40.')).toBe('Checked in at 7:05 AM and 12:40 AM.')
    const untouched = 'A 3:2 split, a 12:05:33 stamp, 24:10, 13:30 PM, 1.5:30, and 1:5.'
    expect(clockTimes12(untouched)).toBe(untouched)
  })

  it('reads the same times back as minutes after midnight, in either form', () => {
    expect(clockTimesIn('After pickup at 17:30.')).toEqual([17 * 60 + 30])
    expect(clockTimesIn(clockTimes12('After pickup at 17:30.'))).toEqual([17 * 60 + 30])
  })
})
