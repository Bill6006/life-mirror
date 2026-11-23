import { describe, expect, it } from 'vitest'
import { forecastRefusals, validateAsk } from './brainShared'
import { comparisonOf, DIFFER_WORDS, forecastDifferences, NIGHT_FACT_IDS } from './forecastConditions'
import type { Fact, FactSheet } from './factTypes'
import { LAST_NIGHT_IDS, LAST_NIGHT_KEYS } from './lastNight'

// Where a stored forecast and a counted pattern or comparison point different ways (2026-11-18): decided from their
// structured fields alone, in two narrow cases, and said in one of the words the rule names. Stand-in facts only.

// 2026-11-21 is a Saturday: weekday 6.
const SATURDAY = '2026-11-21'
const forecast = (model: string, day = SATURDAY, block = 'morning', horizon = 1): Fact => ({ id: `forecasts.${day}.${block}.${horizon}`, tags: [], text: `A forecast for the ${block} of ${day}: expect about 52 out of 100, in a range of 45 to 60.`, values: { point: 52, lo: 45, hi: 60, horizon, scale: 100, model, category: 'dayRecord' } })
const cell = (kind: string, weekday: number, standing: string, direction = 'higher'): Fact => ({ id: `pattern.${kind}.weekday.${weekday}`, tags: [], text: `A cell: ${standing}.`, values: { k: 9, n: 25, restK: 20, m: 150, standing, direction, family: 9, category: 'dayRecord' } })
const moved = (dir: string, by: string, day = SATURDAY): Fact => ({ id: `forecasts.${day}.morning.0.moved`, tags: [], text: 'This forecast was moved.', values: { points: 3, dir, by, kinds: 'dayRecord', category: 'dayRecord' } })
const comparison = (id: string, standing: string, direction: string): Fact => ({ id, tags: [], text: `A comparison: ${standing}.`, values: { diff: direction === 'lower' ? -12 : 12, standing, direction } })
const RECORD: Fact = { id: 'forecasts.dayAhead', tags: [], text: 'Of 24 day-ahead forecasts scored so far, 15 landed inside their range.', values: { scored: 24, hits: 15, category: 'dayRecord' } }

describe('where a stored forecast and a counted pattern differ: a weekday the forecast’s way cannot see', () => {
  it('finds a steady weekday cell of the reading’s level on the forecast’s own weekday, where its way cannot tell weekdays apart', () => {
    for (const model of ['sameBlock', 'lastValue']) for (const kind of ['level.low', 'level.high']) expect(forecastDifferences([forecast(model), cell(kind, 6, 'pattern')])).toHaveLength(1)
    expect(forecastDifferences([forecast('sameBlock'), cell('level.low', 6, 'pattern')])[0]).toBe('pattern.level.low.weekday.6 stands at a steady pattern on the weekday of forecasts.2026-11-21.morning.1, whose way cannot tell one weekday from another')
    // Either direction of the cell: the way sees no weekday at all.
    expect(forecastDifferences([forecast('sameBlock'), cell('level.low', 6, 'pattern', 'lower')])).toHaveLength(1)
  })

  it('never reads a forecast of the level-plus-weekday way as blind to weekdays (2026-11-21)', () => {
    for (const kind of ['level.low', 'level.high']) {
      // The probe that can say yes: the same cell beside a forecast of a way that cannot tell weekdays apart.
      expect(forecastDifferences([forecast('sameBlock'), cell(kind, 6, 'pattern')])).toHaveLength(1)
      expect(forecastDifferences([forecast('levelWeekday'), cell(kind, 6, 'pattern')])).toEqual([])
    }
  })

  it('never reads a forecast of Stage C’s ways with a weekday shift as blind to weekdays, and reads its weather way as blind to them (2026-11-22)', () => {
    for (const kind of ['level.low', 'level.high']) {
      for (const model of ['levelReadings', 'levelWeekdayWeather']) expect(forecastDifferences([forecast(model), cell(kind, 6, 'pattern')])).toEqual([])
      // The weather way cannot tell one weekday from another: a steady weekday pattern on its day differs from it.
      expect(forecastDifferences([forecast('levelWeather'), cell(kind, 6, 'pattern')])).toHaveLength(1)
    }
  })

  it('finds none where the way can tell weekdays apart, the weekday is another, the cell is short of a steady pattern, or it is not the level’s', () => {
    for (const model of ['weekdayBlock', 'blend']) expect(forecastDifferences([forecast(model), cell('level.low', 6, 'pattern')])).toEqual([])
    for (const weekday of [0, 1, 2, 3, 4, 5]) expect(forecastDifferences([forecast('sameBlock'), cell('level.low', weekday, 'pattern')])).toEqual([])
    for (const standing of ['lead', 'noPattern', 'tooFew']) expect(forecastDifferences([forecast('sameBlock'), cell('level.low', 6, standing)])).toEqual([])
    for (const kind of ['sleep.short', 'chip.dinner', 'private.7', 'level.low.extra']) expect(forecastDifferences([forecast('sameBlock'), cell(kind, 6, 'pattern')])).toEqual([])
    // The level's averages carry no standing: never a difference.
    expect(forecastDifferences([forecast('sameBlock'), { id: 'pattern.level.weekday.6', tags: [], text: 'x', values: { mean: 41, n: 25, restMean: 60, restN: 150 } }])).toEqual([])
    // A forecast fact with no way named, or what moved it and its record, is no stored forecast to read a weekday from.
    expect(forecastDifferences([{ ...forecast('sameBlock'), values: { point: 52 } }, cell('level.low', 6, 'pattern')])).toEqual([])
    expect(forecastDifferences([RECORD, cell('level.low', 6, 'pattern')])).toEqual([])
  })

  it('reads the forecast’s weekday from its own date, every day of a week', () => {
    // 2026-11-15 is a Sunday.
    for (let d = 0; d < 7; d++) {
      const day = `2026-11-${String(15 + d)}`
      expect(forecastDifferences([forecast('sameBlock', day), cell('level.high', d, 'pattern')]), day).toHaveLength(1)
      expect(forecastDifferences([forecast('sameBlock', day), cell('level.high', (d + 1) % 7, 'pattern')]), day).toEqual([])
    }
  })
})

describe('where a stored forecast and a counted comparison differ: a forecast moved the other way', () => {
  it('finds a moved forecast whose condition’s own comparison stands at a steady pattern the other way', () => {
    expect(forecastDifferences([moved('lower', 'sleep.short|night.dinner'), comparison('assoc.dinner', 'pattern', 'higher')])).toEqual(['forecasts.2026-11-21.morning.0.moved was set lower, and assoc.dinner stands at a steady pattern higher'])
    expect(forecastDifferences([moved('higher', 'private.7'), comparison('private.7', 'pattern', 'lower')])).toHaveLength(1)
    for (const key of LAST_NIGHT_KEYS) expect(forecastDifferences([moved('lower', `night.${key}`), comparison(LAST_NIGHT_IDS[key], 'pattern', 'higher')]), key).toHaveLength(1)
  })

  it('finds none the same way, short of a steady pattern, for a comparison of a condition that did not move it, or for a condition with no comparison of its own', () => {
    expect(forecastDifferences([moved('lower', 'night.dinner'), comparison('assoc.dinner', 'pattern', 'lower')])).toEqual([])
    for (const standing of ['lead', 'noPattern', 'tooFew']) expect(forecastDifferences([moved('lower', 'night.dinner'), comparison('assoc.dinner', standing, 'higher')])).toEqual([])
    expect(forecastDifferences([moved('lower', 'night.napped'), comparison('assoc.dinner', 'pattern', 'higher')])).toEqual([])
    expect(forecastDifferences([moved('lower', 'private.8'), comparison('private.7', 'pattern', 'higher')])).toEqual([])
    // The first two conditions and a note event have no comparison of the next morning on the sheet: an afternoon's is not one.
    expect(forecastDifferences([moved('lower', 'sleep.short|evening.band|noticed.raised-voice'), comparison('assoc.shortSleep', 'pattern', 'higher')])).toEqual([])
    // A moved fact with no direction or no conditions read is no move to compare.
    expect(forecastDifferences([{ ...moved('lower', 'night.dinner'), values: { points: 3 } }, comparison('assoc.dinner', 'pattern', 'higher')])).toEqual([])
  })

  it('maps each condition to its own comparison on the sheet, and the things of last night as the sheet names them', () => {
    expect(NIGHT_FACT_IDS).toEqual(LAST_NIGHT_IDS)
    for (const key of LAST_NIGHT_KEYS) expect(comparisonOf(`night.${key}`)).toBe(LAST_NIGHT_IDS[key])
    expect(comparisonOf('private.7')).toBe('private.7')
    for (const id of ['sleep.short', 'evening.band', 'noticed.raised-voice', 'night.unknown', 'private.x', '']) expect(comparisonOf(id)).toBeNull()
  })
})

describe('an answer that cites both says where they differ', () => {
  const sheet = { facts: [forecast('sameBlock'), cell('level.low', 6, 'pattern'), moved('lower', 'night.dinner'), comparison('assoc.dinner', 'pattern', 'higher'), comparison('assoc.napped', 'pattern', 'lower'), RECORD, forecast('weekdayBlock', SATURDAY, 'evening')] }
  const NEED = 'cites a stored forecast and a counted comparison that differ without saying so'
  const why = (text: string, ids: string[]) => forecastRefusals(text, ids, true, sheet)

  it('refuses an answer that leaves a difference unsaid, and takes each of the words the rule names', () => {
    const ids = ['forecasts.2026-11-21.morning.1', 'pattern.level.low.weekday.6', 'forecasts.dayAhead']
    const text = 'Saturday morning is expected about 52, in a range of 45 to 60; Saturdays have more often read under 40.'
    expect(why(text, ids)).toEqual([`${NEED} (pattern.level.low.weekday.6 stands at a steady pattern on the weekday of forecasts.2026-11-21.morning.1, whose way cannot tell one weekday from another): say they differ, in one of these words: "differ", "disagree" or "does not match"`])
    for (const words of ['differ', 'differs', 'differed', 'disagree', 'disagrees', 'disagreed', 'does not match', 'doesn’t match', "doesn't match", 'do not match', 'don’t match', 'did not match', 'didn’t match']) expect(why(`${text} The two ${words} here.`, ids), words).toEqual([])
    // A word near one of them is not one: "different" says nothing of the two.
    expect(why(`${text} It is a different day.`, ids)).toHaveLength(1)
  })

  it('refuses a forecast moved the other way left unsaid, and asks nothing where they do not differ', () => {
    expect(why('This morning was set lower; after a late dinner mornings have read higher.', ['forecasts.2026-11-21.morning.0.moved', 'assoc.dinner', 'forecasts.dayAhead'])[0]).toContain(`${NEED} (forecasts.2026-11-21.morning.0.moved was set lower, and assoc.dinner stands at a steady pattern higher)`)
    expect(why('This morning was set lower; after a nap mornings have read lower.', ['forecasts.2026-11-21.morning.0.moved', 'assoc.napped', 'forecasts.dayAhead'])).toEqual([])
    // A forecast whose way sees the weekday: nothing more is asked.
    expect(why('Saturday evening is expected about 52.', ['forecasts.2026-11-21.evening.1', 'pattern.level.low.weekday.6', 'forecasts.dayAhead'])).toEqual([])
    // Without the facts to read, nothing is decided.
    expect(forecastRefusals('Saturday morning is expected about 52.', ['forecasts.2026-11-21.morning.1', 'pattern.level.low.weekday.6', 'forecasts.dayAhead'], true)).toEqual([])
  })

  it('is held by the validator on a whole answer', () => {
    const full = { version: 1, day: '2026-11-20', builtAt: '2026-11-20T20:00:00.000Z', hour: 20, days: 120, facts: sheet.facts } as unknown as FactSheet
    const answer = (text: string) => validateAsk({ text, factIds: ['forecasts.2026-11-21.morning.1', 'pattern.level.low.weekday.6', 'forecasts.dayAhead'], cardIds: [], test: null, note: false }, full, [], 120, true, 'What does Saturday look like?', false)
    const text = 'Saturday is a day to plan around with care. The forecast says about 52, in a range of 45 to 60.\n\nSaturdays have more often read low, and the forecast sees no weekday. Of 24 day-ahead forecasts, 15 landed inside their range.'
    const refused = answer(text)
    expect(refused.ok ? '' : refused.reason).toContain(NEED)
    const said = answer(text.replace('and the forecast sees no weekday', 'and the forecast does not match that, since it sees no weekday'))
    expect(said.ok ? '' : said.reason).toBe('')
    expect(DIFFER_WORDS.test('does not match')).toBe(true)
  })
})
