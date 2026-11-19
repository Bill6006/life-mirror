import { describe, expect, it } from 'vitest'
import { FORECAST_RECORD_IDS, forecastRefusals, isStoredForecastFact, validateAsk } from './brainShared'
import type { Fact, FactSheet } from './factTypes'

// A stored forecast cited beside a counted comparison (2026-11-14): the forecast's own track record is cited too, and
// no cause is given. Stand-in facts only.

const F = 'forecasts.2026-11-19.morning.1'
const NEED = 'cites a stored forecast beside a counted comparison without the forecast’s own track record: cite forecasts.dayAhead too'
const cause = (words: string) => `gives a cause (${words}) beside a forecast: a prediction is judged only by its record, and says no cause`

describe('a stored forecast beside a counted comparison', () => {
  it('knows a stored forecast and what moved it from the sheet’s own forecast facts and from the record facts', () => {
    expect(isStoredForecastFact(F)).toBe(true)
    expect(isStoredForecastFact(`${F}.moved`)).toBe(true)
    for (const id of ['forecasts.scorecard', 'forecasts.dayAhead', 'forecasts.movedRecord', 'forecasts.way', 'forecast.morning', 'usual.morning']) expect(isStoredForecastFact(id)).toBe(false)
  })

  it('asks for the forecast’s own track record where one is cited beside a counted pattern or comparison', () => {
    const text = 'Tomorrow morning is expected about 52, in a range of 45 to 60; after a late dinner mornings have read lower.'
    for (const beside of ['pattern.chip.dinner.weekday.6', 'assoc.dinner', 'private.7', 'noteWords.count', 'writeups.2026-10.recorded.1']) {
      expect(forecastRefusals(text, [F, beside])).toEqual([NEED])
      for (const record of FORECAST_RECORD_IDS) expect(forecastRefusals(text, [F, beside, record])).toEqual([])
    }
    // Alone, or beside nothing counted, a forecast asks for nothing more.
    expect(forecastRefusals(text, [F])).toEqual([])
    expect(forecastRefusals(text, [F, 'forecast.morning', 'usual.morning'])).toEqual([])
    expect(forecastRefusals(text, ['assoc.dinner'])).toEqual([])
    expect(FORECAST_RECORD_IDS).toEqual(['forecasts.dayAhead', 'forecasts.scorecard', 'forecasts.movedRecord'])
  })

  it('refuses a cause beside a forecast, every cause word named, and leaves one caffeine’s own rule refuses to that rule', () => {
    const ids = [F, 'assoc.dinner', 'forecasts.dayAhead']
    expect(forecastRefusals('The forecast is lower because of your late dinners.', ids)).toEqual([cause('"because of"')])
    expect(forecastRefusals('Dinners affect it and cause the dip.', ids, true)).toEqual([cause('"affect", "cause"')])
    expect(forecastRefusals('Evening caffeine affects the morning.', ids)).toEqual([])
    expect(forecastRefusals('After a late dinner mornings have read lower.', ids)).toEqual([])
    // Without a comparison beside it, a forecast's cause words are another rule's business.
    expect(forecastRefusals('The forecast is lower because of your late dinners.', [F, 'forecasts.dayAhead'])).toEqual([])
  })

  it('is held by the validator on a whole answer', () => {
    const forecast: Fact = { id: F, tags: [], text: 'A forecast for the morning of 2026-11-19, made on 2026-11-18 (1 day ahead): expect about 52 out of 100, in a range of 45 to 60.', values: { point: 52, lo: 45, hi: 60, horizon: 1, scale: 100, category: 'dayRecord' } }
    const assoc: Fact = { id: 'assoc.dinner', tags: [], text: 'Mornings after a late dinner read lower than after evenings that started the same.', values: {} }
    const record: Fact = { id: 'forecasts.dayAhead', tags: [], text: 'Of 24 day-ahead forecasts scored so far, 15 landed inside their range.', values: { scored: 24, hits: 15, category: 'dayRecord' } }
    const sheet = { version: 1, day: '2026-11-18', builtAt: '2026-11-18T20:00:00.000Z', hour: 20, days: 120, facts: [forecast, assoc, record] } as unknown as FactSheet
    const answer = (text: string, factIds: string[]) => validateAsk({ text, factIds, cardIds: [], test: null, note: false }, sheet, [], 120, true, 'Why is tomorrow morning forecast at 52?', false)
    const text = 'Tomorrow morning is expected near where your mornings sit. The forecast says about 52, in a range of 45 to 60.\n\nMornings after a late dinner have read lower, and the forecast does not take that in.'
    const refused = answer(text, [F, 'assoc.dinner'])
    expect(refused.ok).toBe(false)
    expect(refused.ok ? '' : refused.reason).toContain(NEED)
    const cited = answer(`${text} Of 24 day-ahead forecasts, 15 landed inside their range.`, [F, 'assoc.dinner', 'forecasts.dayAhead'])
    expect(cited.ok ? '' : cited.reason).toBe('')
    expect(cited.ok).toBe(true)
  })
})
