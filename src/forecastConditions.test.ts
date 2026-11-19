import { describe, expect, it } from 'vitest'
import { copy } from './copy'
import { MODELS, tellsWeekdaysApart } from './forecast'
import { conditionCategory, conditionWords, DAY_AHEAD_MEASURED_FROM, WEEKDAY_WAYS, wayWords } from './forecastConditions'
import { LAST_NIGHT_KEYS } from './lastNight'
import { EVENT_TYPES } from './noteEvents/types'
import { MEASURED_FROM } from './weeklyScreen'

// What a reader of a stored forecast says of it (2026-11-14): the words the phone and the Worker share.

describe('what a reader of a stored forecast says of it', () => {
  it('counts the day-ahead record from twenty scored, as the Weekly View does', () => {
    expect(DAY_AHEAD_MEASURED_FROM).toBe(20)
    expect(MEASURED_FROM).toBe(20)
  })

  it('names each way in the Weekly View’s own words, and knows which of them can tell one weekday from another', () => {
    for (const m of MODELS) {
      expect(wayWords(m)).toBe(copy.brief.models[m])
      expect(WEEKDAY_WAYS.includes(m)).toBe(tellsWeekdaysApart(m))
    }
    expect(WEEKDAY_WAYS).toEqual(['weekdayBlock', 'blend'])
    expect(wayWords('challenger')).toBeNull()
  })

  it('reads each condition under its own switch, and one it does not know nowhere', () => {
    expect(conditionCategory('sleep.short')).toBe('dayRecord')
    expect(conditionCategory('evening.band')).toBe('dayRecord')
    for (const key of LAST_NIGHT_KEYS) expect(conditionCategory(`night.${key}`)).toBe(key === 'churchDay' ? 'faith' : 'dayRecord')
    expect(conditionCategory('private.7')).toBe('privateItems')
    for (const t of EVENT_TYPES) expect(conditionCategory(`noticed.${t.id}`)).toBe('notes')
    for (const id of ['night.unknown', 'private.x', 'noticed.unknown', 'sleep', 'other.thing', '']) expect(conditionCategory(id)).toBeNull()
  })

  it('says each condition in words, a private item by its name only where one is given', () => {
    expect(conditionWords('sleep.short', () => null)).toBe('whether the last night reported before the day was short')
    expect(conditionWords('evening.band', () => null)).toBe('the band the evening before read in')
    for (const key of LAST_NIGHT_KEYS) expect(conditionWords(`night.${key}`, () => null)).toBe(`${copy.brief.lastNightEvents[key]} the evening before`)
    expect(conditionWords('private.7', () => null)).toBe('a private item marked the evening before')
    expect(conditionWords('private.7', (k) => (k === '7' ? 'Stand-in item' : null))).toBe('Stand-in item marked the evening before')
    expect(conditionWords('noticed.raised-voice', () => null)).toBe('the evening before’s note, which Claude noticed as “Raised my voice”')
    expect(conditionWords('night.unknown', () => 'x')).toBeNull()
  })
})
