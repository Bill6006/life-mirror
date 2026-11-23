import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addDays, BLOCKS } from './blocks'
import { fourWays } from './challenger'
import { copy } from './copy'
import { db, type Forecast } from './db'
import { daysCanDiffer, flatWeek, isFourWay, LEVEL_READINGS, LEVEL_WEATHER, LEVEL_WEEKDAY, LEVEL_WEEKDAY_WEATHER, lowestAhead, MODELS, tellsWeekdaysApart, type WayId } from './forecast'
import { briefData, weeklyData } from './forecastFlow'
import { wayLine } from './weeklyScreen'

// Stage C's ways' words and how their stored rows are read (2026-11-22): each way's name, and its sentence under the
// week ahead's Details, word for word as the owner approved them (the handoff's section 4); the two with a weekday shift
// tell one weekday from another, and the weather way does not, yet its days differ by their forecasts, so the card
// never says its days come out alike and still marks its lowest day. Nothing here writes a way: its rows are seeded as
// stored rows. Stand-in rows only.

const NAMES: Record<string, string> = {
  levelReadings: 'your usual level at this time of day and how this weekday usually differs in some of your readings',
  levelWeather: 'your usual level at this time of day and the weather forecast for the day',
  levelWeekdayWeather: 'your usual level at this time of day, how this weekday usually differs and the weather forecast for the day',
}
const SENTENCES: Record<string, string> = {
  levelReadings: 'Expected from your usual level at this time of day and how this weekday usually differs in some of your readings. This way is used only after clear weekday differences have held for four weeks.',
  levelWeather: 'Expected from your usual level at this time of day and the weather forecast for the day. This way is used only after a clear tie between the weather and your days has held for four weeks.',
  levelWeekdayWeather: 'Expected from your usual level at this time of day, how this weekday usually differs and the weather forecast for the day. Each part is used only after it has held clearly for four weeks.',
}
const WAYS = [LEVEL_READINGS, LEVEL_WEATHER, LEVEL_WEEKDAY_WEATHER] as const
const ALIKE = /does not tell one weekday from another|come out alike/

// 2026-11-23 is a Monday.
const TODAY = '2026-11-23'
const POINTS = [62, 48, 55, 57, 59, 66, 71]
function weekRows(model: string, points: readonly number[] = POINTS): Forecast[] {
  return points.flatMap((p, i) => BLOCKS.map((block): Forecast => ({ day: addDays(TODAY, i + 1), block, horizon: i + 1, madeOn: TODAY, model, point: p, lo: p - 9, hi: p + 8, whatIf: null })))
}

describe('Stage C’s ways’ words', () => {
  it('names each way and says its sentence under Details word for word, as approved', () => {
    expect([LEVEL_READINGS, LEVEL_WEATHER, LEVEL_WEEKDAY_WEATHER]).toEqual(['levelReadings', 'levelWeather', 'levelWeekdayWeather'])
    for (const way of WAYS) {
      expect(copy.brief.models[way]).toBe(NAMES[way])
      expect(wayLine(way)).toBe(SENTENCES[way])
      expect(wayLine(way)).not.toMatch(/of four ways|adjusted|moved|method/)
    }
    expect(copy.weekly.modelWeather).toBe('Expected from {model}. This way is used only after a clear tie between the weather and your days has held for four weeks.')
    expect(copy.weekly.modelWeekdayWeather).toBe('Expected from {model}. Each part is used only after it has held clearly for four weeks.')
  })

  it('leaves the level-plus-weekday way’s sentence and the four’s as they were', () => {
    expect(wayLine(LEVEL_WEEKDAY)).toBe('Expected from your usual level at this time of day and how this weekday usually differs. This way is used only after clear weekday differences have held for four weeks.')
    for (const m of MODELS) expect(wayLine(m)).toBe(`Expected from ${copy.brief.models[m]}: of four ways to forecast, the one that came closest a day ahead over your last four weeks.`)
  })

  it('is none of the four: they still compete alone, and the four’s forecast gives nothing for any of them', () => {
    const values = new Map(Array.from({ length: 10 }, (_, i) => [`${addDays(TODAY, -1 - i)}|morning`, 50 + i] as const))
    for (const way of [...WAYS, LEVEL_WEEKDAY]) {
      expect(isFourWay(way)).toBe(false)
      expect(fourWays(way, values, TODAY, 'morning')).toBeNull()
    }
    // The probe that can say yes: each of the four is forecast.
    for (const m of MODELS) {
      expect(isFourWay(m)).toBe(true)
      expect(fourWays(m, values, TODAY, 'morning')).not.toBeNull()
    }
  })
})

describe('Stage C’s ways’ stored rows, as the week ahead reads them', () => {
  it('the two with a weekday shift tell one weekday from another; the weather way does not, yet its days can differ', () => {
    expect(tellsWeekdaysApart(LEVEL_READINGS)).toBe(true)
    expect(tellsWeekdaysApart(LEVEL_WEEKDAY_WEATHER)).toBe(true)
    expect(tellsWeekdaysApart(LEVEL_WEATHER)).toBe(false)
    for (const way of [...WAYS, LEVEL_WEEKDAY, 'weekdayBlock', 'blend'] as WayId[]) expect(daysCanDiffer(way)).toBe(true)
    for (const m of ['sameBlock', 'lastValue'] as WayId[]) expect(daysCanDiffer(m)).toBe(false)
  })

  it('draws each way’s days day by day with the lowest marked, and says a week within a point as one level, never as "blind"', () => {
    const rows = POINTS.map((p) => ({ expected: p, lo: p - 9, hi: p + 8 }))
    const level = [60, 60, 61, 60, 61, 60, 60].map((p) => ({ expected: p, lo: p - 9, hi: p + 8 }))
    for (const way of WAYS) {
      expect(flatWeek(rows, way)).toBeNull()
      expect(lowestAhead(rows, way)).toEqual([1])
      expect(flatWeek(level, way)?.why).toBe('none')
    }
    // The probe: a way of the four that cannot tell weekdays apart is said as one level, and marks no lowest day.
    expect(flatWeek(rows, 'sameBlock')?.why).toBe('blind')
    expect(lowestAhead(rows, 'sameBlock')).toEqual([])
  })

  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  for (const way of WAYS) {
    it(`names ${way} on the weekly view and the brief, and never says its days come out alike`, async () => {
      await db.forecasts.bulkAdd([...weekRows(way), ...BLOCKS.map((block): Forecast => ({ day: TODAY, block, horizon: 0, madeOn: TODAY, model: way, point: 50, lo: 41, hi: 58, whatIf: null }))])
      const weekly = await weeklyData(TODAY)
      expect(weekly.model).toBe(way)
      expect(weekly.weekAheadReady).toBe(true)
      expect(weekly.weekAheadAlike).toBe(false)
      expect(weekly.weekAheadLow).toEqual([1])
      expect(flatWeek(weekly.weekAhead, weekly.model)).toBeNull()
      expect(wayLine(weekly.model as WayId)).toBe(SENTENCES[way])
      expect(wayLine(weekly.model as WayId)).not.toMatch(ALIKE)
      expect((await briefData(TODAY)).model).toBe(way)
    })
  }

  it('says of a way of the four that cannot tell weekdays apart what it said before: its days come out alike', async () => {
    await db.forecasts.bulkAdd(weekRows('sameBlock'))
    const weekly = await weeklyData(TODAY)
    expect(weekly.weekAheadAlike).toBe(true)
    expect(weekly.weekAheadLow).toEqual([])
  })
})
