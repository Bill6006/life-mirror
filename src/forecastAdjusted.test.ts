import { describe, expect, it } from 'vitest'
import { bandBefore } from './challengerRecord'
import type { CheckIn, Forecast } from './db'
import { forecastFact } from './facts'
import { adjustedKinds, adjustedWords } from './forecastAdjusted'

// The forecast follow-ups, item 3 (2026-11-20, at the owner's word): a forecast the challenger moved says so, under
// "Usually" on its check-in and after today's forecast on the Brain's sheet, in the approved contract's words. Stand-in
// records only.

const none = () => null
const named = (id: string) => (id === '7' ? 'Late snack' : null)
const row = (over: Partial<Forecast> = {}): Forecast => ({ day: '2026-11-20', block: 'morning', horizon: 0, madeOn: '2026-11-20', model: 'sameBlock', point: 60, lo: 52, hi: 68, whatIf: null, ...over })

describe('a moved forecast in the approved words (the forecast follow-ups, item 3)', () => {
  it('says each of the approved frames word for word', () => {
    expect(adjustedWords({ adj: -6.2, adjBy: ['night.dinner'] }, none, null)).toBe('Adjusted about 6 lower, for a late or heavy dinner last night.')
    expect(adjustedWords({ adj: -3, adjBy: ['sleep.short'] }, none, null)).toBe('Adjusted about 3 lower, for a short night reported yesterday.')
    expect(adjustedWords({ adj: 2.1, adjBy: ['evening.band'] }, none, 'solid')).toBe('Adjusted about 2 higher, for yesterday evening reading Solid.')
    expect(adjustedWords({ adj: -4, adjBy: ['private.7'] }, named, null)).toBe('Adjusted about 4 lower, for Late snack marked last night.')
    expect(adjustedWords({ adj: -4, adjBy: ['private.7'] }, none, null)).toBe('Adjusted about 4 lower, for a private item marked last night.')
    expect(adjustedWords({ adj: -7, adjBy: ['sleep.short', 'noticed.raised-voice'] }, none, null)).toBe("Adjusted about 7 lower, for a short night reported yesterday and something Claude noticed in last night's note.")
  })

  it('says a move under one point as less than a point, and any other to the nearest point', () => {
    expect(adjustedWords({ adj: -0.4, adjBy: ['sleep.short'] }, none, null)).toBe('Adjusted less than a point lower, for a short night reported yesterday.')
    expect(adjustedWords({ adj: 0.9, adjBy: ['sleep.short'] }, none, null)).toBe('Adjusted less than a point higher, for a short night reported yesterday.')
    expect(adjustedWords({ adj: -1, adjBy: ['sleep.short'] }, none, null)).toBe('Adjusted about 1 lower, for a short night reported yesterday.')
    expect(adjustedWords({ adj: 2.6, adjBy: ['sleep.short'] }, none, null)).toBe('Adjusted about 3 higher, for a short night reported yesterday.')
  })

  it('says nothing of a forecast that was not moved', () => {
    expect(adjustedWords({}, none, null)).toBeNull()
    expect(adjustedWords({ adj: 0, adjBy: ['sleep.short'] }, none, null)).toBeNull()
  })

  it('joins three things as a list, and reads past an id the forecast does not know', () => {
    expect(adjustedWords({ adj: -5, adjBy: ['sleep.short', 'evening.band', 'night.dinner'] }, none, 'wornDown')).toBe('Adjusted about 5 lower, for a short night reported yesterday, yesterday evening reading Worn down and a late or heavy dinner last night.')
    expect(adjustedWords({ adj: -2, adjBy: ['sleep.short', 'night.no-such-thing', 'private.x', 'noticed.no-such-type'] }, none, null)).toBe('Adjusted about 2 lower, for a short night reported yesterday.')
    expect(adjustedWords({ adj: -2, adjBy: ['weather.rain'] }, none, null)).toBe('Adjusted about 2 lower.')
  })

  it('says the evening’s reading where its band cannot be read now', () => {
    expect(adjustedWords({ adj: 2, adjBy: ['evening.band'] }, none, null)).toBe("Adjusted about 2 higher, for yesterday evening's reading.")
    expect(adjustedWords({ adj: 2, adjBy: ['evening.band'] }, none, 'no-such-band')).toBe("Adjusted about 2 higher, for yesterday evening's reading.")
  })

  it('never says "because"', () => {
    const all = ['sleep.short', 'evening.band', 'night.dinner', 'night.churchDay', 'private.7', 'noticed.raised-voice']
    for (const id of all) for (const adj of [-6, -0.5, 0.5, 6]) expect(adjustedWords({ adj, adjBy: [id] }, named, 'solid') ?? '').not.toMatch(/because/i)
  })

  it('names the Brain switch of every condition that moved it, once each', () => {
    expect(adjustedKinds({ adj: -7, adjBy: ['sleep.short', 'evening.band', 'private.7', 'noticed.raised-voice', 'night.churchDay'] })).toEqual(['dayRecord', 'privateItems', 'notes', 'faith'])
    expect(adjustedKinds({ adj: -2, adjBy: ['weather.rain', 'sleep.short'] })).toEqual(['dayRecord'])
    expect(adjustedKinds({})).toEqual([])
    expect(adjustedKinds({ adj: 0, adjBy: ['private.7'] })).toEqual([])
  })
})

describe('the evening’s band, read by the forecast’s own rule (item 3)', () => {
  const MORNING = ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'confidence', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality']
  const EVENING = ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness']
  const answers = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, ['mood', 'energy', 'focus'].includes(id) ? 4 : ['stress', 'overwhelm', 'irritation'].includes(id) ? 2 : 3]))
  const evening = (day: string, done: Date): CheckIn => ({ day, block: 'evening', asked: EVENING, startedAt: done.toISOString(), completedAt: done.toISOString(), updatedAt: done.toISOString(), answers: answers(EVENING), activeMs: 60_000 }) as CheckIn
  const morning = (day: string, done: Date): CheckIn => ({ day, block: 'morning', asked: MORNING, startedAt: done.toISOString(), completedAt: done.toISOString(), updatedAt: done.toISOString(), answers: answers(MORNING), activeMs: 60_000 }) as CheckIn

  it('reads the band of the evening before, completed before the day began; nothing of a later or a missing evening', () => {
    expect(bandBefore([evening('2026-11-19', new Date(2026, 10, 19, 21, 0))], '2026-11-20')).toBe('solid')
    expect(bandBefore([evening('2026-11-19', new Date(2026, 10, 20, 10, 0))], '2026-11-20')).toBeNull()
    expect(bandBefore([morning('2026-11-19', new Date(2026, 10, 19, 8, 0))], '2026-11-20')).toBeNull()
    expect(bandBefore([evening('2026-11-18', new Date(2026, 10, 18, 21, 0))], '2026-11-20')).toBeNull()
  })
})

describe('today’s forecast on the Brain’s sheet (item 3)', () => {
  it('is said as before where nothing moved it', () => {
    const f = forecastFact({ block: 'morning', forecast: row(), actual: null }, null)
    expect(f.text).toBe("Today's morning is forecast at 60, 52 to 68.")
    expect(f.values).toEqual({ block: 'morning', point: 60, lo: 52, hi: 68, actual: null, width: 16 })
    expect(f.tags).toEqual(['forecast', 'morning'])
  })

  it('carries the check-in’s words where it was moved, as the approved Why frames show them', () => {
    const dinner = forecastFact({ block: 'morning', forecast: row({ adj: -6.2, adjBy: ['night.dinner'] }), actual: null }, null)
    expect(dinner.text).toBe("Today's morning is forecast at 60, 52 to 68. Adjusted about 6 lower, for a late or heavy dinner last night.")
    expect(dinner.values.kinds).toBe('dayRecord')
    const read = forecastFact({ block: 'morning', forecast: row({ adj: -6.2, adjBy: ['night.dinner'] }), actual: 61 }, null)
    expect(read.text).toBe("Today's morning is forecast at 60, 52 to 68; it read 61. Adjusted about 6 lower, for a late or heavy dinner last night.")
  })

  it('says a private item as "a private item", never its name, and is read under the switch of every condition', () => {
    const f = forecastFact({ block: 'morning', forecast: row({ point: 58, lo: 50, hi: 66, adj: -4, adjBy: ['private.7'] }), actual: null }, null)
    expect(f.text).toBe("Today's morning is forecast at 58, 50 to 66. Adjusted about 4 lower, for a private item marked last night.")
    expect(f.values.kinds).toBe('privateItems')
    const both = forecastFact({ block: 'morning', forecast: row({ adj: -7, adjBy: ['sleep.short', 'noticed.raised-voice', 'night.churchDay'] }), actual: null }, null)
    expect(both.values.kinds).toBe('dayRecord|notes|faith')
    expect(both.tags).toEqual(['forecast', 'morning', 'faith'])
  })
})
