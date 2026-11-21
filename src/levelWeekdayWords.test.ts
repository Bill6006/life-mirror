import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addDays, BLOCKS } from './blocks'
import { copy } from './copy'
import { db, type Forecast } from './db'
import { flatWeek, lowestAhead, MODELS, tellsWeekdaysApart } from './forecast'
import { briefData, weeklyData } from './forecastFlow'
import { wayLine } from './weeklyScreen'

// The level-plus-weekday way's words and how its stored rows are read (2026-11-21): its name, and its sentence under the
// week ahead's Details, word for word as the owner approved them; a way that tells one weekday from another, so the card
// never says its days come out alike. Nothing here writes the way: its rows are seeded as stored rows. Stand-in rows only.

const NAME = 'your usual level at this time of day and how this weekday usually differs'
const SENTENCE = 'Expected from your usual level at this time of day and how this weekday usually differs. This way is used only after clear weekday differences have held for four weeks.'
const ALIKE = /does not tell one weekday from another|come out alike/

// 2026-11-23 is a Monday.
const TODAY = '2026-11-23'
/** The week ahead as the way's stored rows: each day's three check-ins at one point, a day lowest. */
const POINTS = [62, 48, 55, 57, 59, 66, 71]
function weekRows(model: string, points: readonly number[] = POINTS): Forecast[] {
  return points.flatMap((p, i) => BLOCKS.map((block): Forecast => ({ day: addDays(TODAY, i + 1), block, horizon: i + 1, madeOn: TODAY, model, point: p, lo: p - 9, hi: p + 8, whatIf: null })))
}

describe('the level-plus-weekday way’s words', () => {
  it('names the way and says its sentence under Details word for word, as approved', () => {
    expect(copy.brief.models.levelWeekday).toBe(NAME)
    expect(copy.weekly.modelWeekdays).toBe('Expected from {model}. This way is used only after clear weekday differences have held for four weeks.')
    expect(wayLine('levelWeekday')).toBe(SENTENCE)
    expect(wayLine('levelWeekday')).not.toMatch(/of four ways|adjusted|moved/)
  })

  it('leaves the four’s own sentence as it was, "of four ways to forecast"', () => {
    expect(wayLine('sameBlock')).toBe('Expected from this time of day over the last four weeks, the latest days counting most: of four ways to forecast, the one that came closest a day ahead over your last four weeks.')
    for (const m of MODELS) expect(wayLine(m)).toBe(`Expected from ${copy.brief.models[m]}: of four ways to forecast, the one that came closest a day ahead over your last four weeks.`)
  })
})

describe('the level-plus-weekday way’s stored rows, as the week ahead reads them', () => {
  it('is a way that tells one weekday from another: never "blind", and its lowest day is marked', () => {
    expect(tellsWeekdaysApart('levelWeekday')).toBe(true)
    const rows = POINTS.map((p) => ({ expected: p, lo: p - 9, hi: p + 8 }))
    // Days apart: drawn day by day, the lowest marked, as for a way of the four that tells weekdays apart; never for one that cannot.
    expect(flatWeek(rows, 'levelWeekday')).toBeNull()
    expect(lowestAhead(rows, 'levelWeekday')).toEqual([1])
    expect(lowestAhead(rows, 'sameBlock')).toEqual([])
    // Days within a point: one level, and "no meaningful difference detected", never "does not tell one weekday from another".
    const level = [60, 60, 61, 60, 61, 60, 60].map((p) => ({ expected: p, lo: p - 9, hi: p + 8 }))
    expect(flatWeek(level, 'levelWeekday')?.why).toBe('none')
    expect(flatWeek(level, 'sameBlock')?.why).toBe('blind')
  })

  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('names the way on the weekly view and the brief, and never says its days come out alike', async () => {
    await db.forecasts.bulkAdd([...weekRows('levelWeekday'), ...BLOCKS.map((block): Forecast => ({ day: TODAY, block, horizon: 0, madeOn: TODAY, model: 'levelWeekday', point: 50, lo: 41, hi: 58, whatIf: null }))])
    const weekly = await weeklyData(TODAY)
    expect(weekly.model).toBe('levelWeekday')
    expect(weekly.weekAheadReady).toBe(true)
    expect(weekly.weekAheadAlike).toBe(false)
    expect(weekly.weekAheadLow).toEqual([1])
    expect(flatWeek(weekly.weekAhead, weekly.model)).toBeNull()
    expect(wayLine(weekly.model as 'levelWeekday')).toBe(SENTENCE)
    expect(wayLine(weekly.model as 'levelWeekday')).not.toMatch(ALIKE)
    expect((await briefData(TODAY)).model).toBe('levelWeekday')
  })

  it('says the same of a way of the four that cannot tell weekdays apart as before: its days come out alike', async () => {
    await db.forecasts.bulkAdd(weekRows('sameBlock'))
    const weekly = await weeklyData(TODAY)
    expect(weekly.model).toBe('sameBlock')
    expect(weekly.weekAheadAlike).toBe(true)
    expect(weekly.weekAheadLow).toEqual([])
    expect(`${wayLine('sameBlock')} ${copy.weekly.aheadAlike}`).toMatch(ALIKE)
  })
})
