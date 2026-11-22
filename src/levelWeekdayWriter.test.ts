import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { addDays, BLOCKS } from './blocks'
import { setChallengerForTests } from './challenger'
import { FIXTURE_TODAY, fixtureCheckin, fixtureCheckins } from './challengerTesting'
import { db, type CheckIn, type Forecast } from './db'
import { buildExport, forecastAdjustment } from './export'
import { LEVEL_WEEKDAY, MODELS, predict, valuesByKey, type ModelId } from './forecast'
import { runForecasting } from './forecastFlow'
import { levelWeekdayReader, levelWeekdayRows, setLevelWeekdayForTests } from './levelWeekday'
import { RHYTHM_TODAY, rhythmCheckins } from './levelWeekdayTesting'
import { DEFAULT_SETTINGS } from './settings'

// The forecast writer with the level-plus-weekday way (Stage A, 2026-11-21). Its switch is off in the code; these tests
// set it by name. On a stand-in record with a strong weekly rhythm the way is in use, and on one with none it is not.
// Each test starts from a fresh database.

const keyOf = (f: Pick<Forecast, 'day' | 'block' | 'horizon'>): string => `${f.day}|${f.block}|${f.horizon}`

/** The rows written on `today` from the record given, with the way and the challenger switched as given (null: the code's own). */
async function written(checkins: () => CheckIn[], today: string, way: boolean | null, challenger: boolean): Promise<Forecast[]> {
  await db.delete()
  await db.open()
  await db.checkins.bulkAdd(checkins())
  setLevelWeekdayForTests(way)
  setChallengerForTests(challenger)
  await runForecasting(today)
  return (await db.forecasts.toArray()).map(({ id: _id, ...row }) => row)
}
const byKey = (rows: readonly Forecast[]): Map<string, Forecast> => new Map(rows.map((f) => [keyOf(f), f]))

afterEach(() => {
  setLevelWeekdayForTests(null)
  setChallengerForTests(null)
})

describe('the forecast writer with the level-plus-weekday way', () => {
  it('with the code’s own switch, which is off, writes on a strong weekly rhythm the four’s rows and never the way’s', async () => {
    const own = await written(() => rhythmCheckins(), RHYTHM_TODAY, null, false)
    const off = await written(() => rhythmCheckins(), RHYTHM_TODAY, false, false)
    expect(own.length).toBeGreaterThan(20)
    expect(JSON.stringify(own)).toBe(JSON.stringify(off))
    expect(own.every((f) => (MODELS as readonly string[]).includes(f.model) && f.four === undefined)).toBe(true)
    // The probe: switched on, the same record is written by the way.
    expect((await written(() => rhythmCheckins(), RHYTHM_TODAY, true, false)).every((f) => f.model === LEVEL_WEEKDAY)).toBe(true)
  }, 60_000)

  it('switched on, on a strong weekly rhythm, writes every row due by the way: its point and range, and the four’s row kept beside it', async () => {
    const off = await written(() => rhythmCheckins(), RHYTHM_TODAY, false, false)
    const on = await written(() => rhythmCheckins(), RHYTHM_TODAY, true, false)
    const way = levelWeekdayRows(valuesByKey(rhythmCheckins()), RHYTHM_TODAY)
    expect(way).not.toBeNull()
    expect(on).toHaveLength(off.length)
    expect(on).toHaveLength((way as Map<string, unknown>).size)
    const four = byKey(off)
    for (const f of on) {
      const was = four.get(keyOf(f)) as Forecast
      expect(f.model).toBe(LEVEL_WEEKDAY)
      expect({ point: f.point, lo: f.lo, hi: f.hi }).toEqual(way?.get(keyOf(f)))
      expect(f.four).toEqual({ model: was.model, point: was.point, lo: was.lo, hi: was.hi })
      expect(f.whatIf).toBe(was.whatIf)
      expect(Object.keys(f)).toEqual([...Object.keys(was), 'four'])
    }
    // The way does change the week: some points part from the four's, and its days ahead are not alike.
    expect(on.some((f) => f.point !== (f.four as { point: number }).point)).toBe(true)
    expect(new Set(on.filter((f) => f.horizon >= 1 && f.block === 'morning').map((f) => f.point)).size).toBeGreaterThan(2)
  }, 60_000)

  it('never rewrites a row it wrote: run again after the day’s check-ins and on the next day, each is byte for byte', async () => {
    const first = await written(() => rhythmCheckins(), RHYTHM_TODAY, true, false)
    const ids = (await db.forecasts.toArray()).map((f) => f.id as number)
    await db.checkins.bulkAdd(BLOCKS.map((b) => fixtureCheckin(RHYTHM_TODAY, b, 1, 1)))
    await runForecasting(RHYTHM_TODAY)
    await runForecasting(addDays(RHYTHM_TODAY, 1))
    const after = await db.forecasts.bulkGet(ids)
    expect(JSON.stringify(after.map((f) => { const { id: _id, ...row } = f as Forecast; return row }))).toBe(JSON.stringify(first))
    expect((await db.forecasts.count())).toBeGreaterThan(first.length)
  }, 60_000)

  for (const challenger of [false, true]) {
    it(`on a record with no weekly rhythm, writes exactly the rows it writes switched off (the challenger ${challenger ? 'on' : 'off'})`, async () => {
      const off = await written(() => fixtureCheckins(), FIXTURE_TODAY, false, challenger)
      const on = await written(() => fixtureCheckins(), FIXTURE_TODAY, true, challenger)
      expect(on.length).toBeGreaterThan(20)
      expect(JSON.stringify(on)).toBe(JSON.stringify(off))
      expect(levelWeekdayReader(valuesByKey(fixtureCheckins())).state(FIXTURE_TODAY).inUse).toBe(false)
    }, 60_000)
  }

  it('puts the challenger on top of the way: its base is the way, and a row it moves keeps the way’s row as its plain forecast and the four’s beside it', async () => {
    const records = () => rhythmCheckins(true)
    const values = valuesByKey(records())
    const reader = levelWeekdayReader(values)
    const way = levelWeekdayRows(values, RHYTHM_TODAY) as Map<string, { point: number; lo: number; hi: number }>
    const four = byKey(await written(records, RHYTHM_TODAY, false, false))
    const wayAlone = byKey(await written(records, RHYTHM_TODAY, true, false))
    const both = await written(records, RHYTHM_TODAY, true, true)
    const moved = both.filter((f) => typeof f.adj === 'number')
    expect(moved.length).toBeGreaterThan(0)
    for (const f of moved) {
      const was = four.get(keyOf(f)) as Forecast
      expect(f.model).toBe(LEVEL_WEEKDAY)
      expect(f.plain).toEqual(way.get(keyOf(f)))
      expect(f.four).toEqual({ model: was.model, point: was.point, lo: was.lo, hi: was.hi })
      // Moved from the way's own forecast: the point is the way's, plus the points added (kept to a tenth), rounded.
      expect(Math.abs(f.point - ((reader.forecast(RHYTHM_TODAY, f.day, f.block) as number) + (f.adj as number)))).toBeLessThanOrEqual(0.55)
    }
    // The probe: moved from the four's forecast, some points would be elsewhere.
    expect(moved.some((f) => Math.abs(f.point - ((predict((f.four as { model: string }).model as ModelId, values, f.day, f.block) as number) + (f.adj as number))) > 0.55)).toBe(true)
    // A row nothing moved is the way's row, byte for byte.
    for (const f of both.filter((x) => x.adj === undefined)) expect(JSON.stringify(f)).toBe(JSON.stringify(wayAlone.get(keyOf(f))))
  }, 60_000)
})

describe('the export of the way’s rows', () => {
  it('carries what the four would have written on every row the way wrote, moved or not', () => {
    const four = { model: 'weekdayBlock', point: 50, lo: 42, hi: 57 }
    expect(forecastAdjustment({ four }, new Map(), false)).toEqual({ four })
    expect(forecastAdjustment({ adj: -4, adjBy: ['sleep.short'], plain: { point: 47, lo: 40, hi: 55 }, four }, new Map(), false)).toEqual({ adj: -4, adjBy: ['sleep.short'], plain: { point: 47, lo: 40, hi: 55 }, four })
    expect(forecastAdjustment({}, new Map(), false)).toEqual({})
    const row: Forecast = { day: '2026-11-24', block: 'morning', horizon: 1, madeOn: RHYTHM_TODAY, model: 'levelWeekday', point: 47, lo: 40, hi: 55, whatIf: null, four }
    const json = buildExport([], [], [], DEFAULT_SETTINGS, { includePrivate: false }, undefined, { offers: [], outcomes: [], cards: [], declarations: [], forecasts: [row], forecastScores: [] }).json
    expect(JSON.stringify(JSON.parse(json))).toContain('"model":"levelWeekday","point":47,"lo":40,"hi":55,"whatIf":null,"four":{"model":"weekdayBlock","point":50,"lo":42,"hi":57}')
  }, 60_000)
})
