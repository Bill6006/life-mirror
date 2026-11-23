import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { addDays } from './blocks'
import { setChallengerForTests } from './challenger'
import { db, updateSettings, type Forecast } from './db'
import { buildExport, forecastAdjustment } from './export'
import { LEVEL_READINGS, LEVEL_WEATHER, LEVEL_WEEKDAY, MODELS, predict, valuesByKey, type ModelId } from './forecast'
import { runForecasting } from './forecastFlow'
import { knownAheadReader, knownAheadRecordOf, setKnownAheadForTests } from './knownAhead'
import { bySunshine, inTwoReadings, KNOWN_TODAY, movedOffice, standIn, twoReadingsWobble, type StandIn } from './knownAheadTesting'
import { levelWeekdayRows, setLevelWeekdayForTests } from './levelWeekday'
import { DEFAULT_SETTINGS } from './settings'

// The forecast writer with Stage C (Stage C-A, 2026-11-22). Its switch is off in the code; these tests set it by name.
// On stand-in records it is in use by the readings' term, by the weather's, and by the score's own test after office
// days move; on one with nothing there it is not, and the rows are the switch-off rows. Each test starts from a fresh
// database.

const T = KNOWN_TODAY
const keyOf = (f: Pick<Forecast, 'day' | 'block' | 'horizon'>): string => `${f.day}|${f.block}|${f.horizon}`
const byKey = (rows: readonly Forecast[]): Map<string, Forecast> => new Map(rows.map((f) => [keyOf(f), f]))
const isFour = (f: Forecast) => (MODELS as readonly string[]).includes(f.model) && f.four === undefined && f.stageB === undefined && f.weather === undefined

interface Switches {
  known: boolean | null
  challenger?: boolean
  level?: boolean | null
  away?: { from: string; to: string }
}
/** The rows written on `today` from the record given, with the switches as given (null: the code's own). */
async function written(s: StandIn, sw: Switches, today = T): Promise<Forecast[]> {
  await db.delete()
  await db.open()
  await db.checkins.bulkAdd(s.checkins)
  await db.days.bulkPut(s.days)
  await updateSettings((x) => ({ ...x, week: s.week, ...(sw.away ? { away: { ...sw.away, setAt: `${T}T06:00:00.000Z` } } : {}) }))
  setKnownAheadForTests(sw.known)
  setLevelWeekdayForTests(sw.level ?? null)
  setChallengerForTests(sw.challenger ?? false)
  await runForecasting(today)
  return (await db.forecasts.toArray()).map(({ id: _id, ...row }) => row)
}
const readerOf = (s: StandIn, today = T) => knownAheadReader(knownAheadRecordOf({ values: valuesByKey(s.checkins), checkins: s.checkins, days: s.days, week: s.week, depth: DEFAULT_SETTINGS.depth, retired: [], weights: null }), today)

afterEach(() => {
  setKnownAheadForTests(null)
  setLevelWeekdayForTests(null)
  setChallengerForTests(null)
})

const TWO = () => standIn({ steps: inTwoReadings, wobble: twoReadingsWobble })
const SUN = () => standIn({ steps: bySunshine(), weather: true })
const moved = (since: number) => standIn(movedOffice(addDays(T, -since)))

describe('the forecast writer with Stage C', () => {
  it('with the code’s own switch, which is off, writes the four’s rows where Stage C would be in use, and nothing of Stage C’s', async () => {
    const own = await written(TWO(), { known: null })
    const off = await written(TWO(), { known: false })
    expect(own.length).toBeGreaterThan(20)
    expect(JSON.stringify(own)).toBe(JSON.stringify(off))
    expect(own.every(isFour)).toBe(true)
    // The probe: switched on, the same record is written by Stage C.
    expect((await written(TWO(), { known: true })).every((f) => f.model === LEVEL_READINGS)).toBe(true)
  }, 120_000)

  for (const [name, make, way] of [['a weekday rhythm in two readings only', TWO, LEVEL_READINGS], ['sunshine that drives the day, with its forecasts kept', SUN, LEVEL_WEATHER]] as const) {
    it(`switched on, on ${name}, writes every row due by Stage C: its point and range, its way, and the four’s row kept beside it`, async () => {
      const s = make()
      const off = await written(s, { known: false })
      const on = await written(s, { known: true })
      const rows = readerOf(s).rows() as Map<string, { point: number; lo: number; hi: number }>
      expect(rows).not.toBeNull()
      expect(on).toHaveLength(off.length)
      expect(on).toHaveLength(rows.size)
      const four = byKey(off)
      for (const f of on) {
        const was = four.get(keyOf(f)) as Forecast
        expect(f.model).toBe(way)
        expect({ point: f.point, lo: f.lo, hi: f.hi }).toEqual(rows.get(keyOf(f)))
        expect(f.four).toEqual({ model: was.model, point: was.point, lo: was.lo, hi: was.hi })
        expect(f.whatIf).toBe(was.whatIf)
        expect(f.stageB).toBeUndefined()
        expect(f.weather).toBe(way === LEVEL_WEATHER ? 'sunshine' : undefined)
        expect(Object.keys(f)).toEqual([...Object.keys(was), 'four', ...(way === LEVEL_WEATHER ? ['weather'] : [])])
      }
      expect(on.some((f) => f.point !== (f.four as { point: number }).point)).toBe(true)
    }, 120_000)
  }

  it('forty days after office days move, leaves the day to the four’s pick, never to the level-plus-weekday way by its own test, even with that way’s switch on', async () => {
    const s = moved(40)
    const four = await written(s, { known: false, level: false })
    const both = await written(s, { known: true, level: true })
    expect(both.length).toBeGreaterThan(20)
    expect(JSON.stringify(both)).toBe(JSON.stringify(four))
    // The probe: the level-plus-weekday way alone, by its own test, writes the day.
    expect((await written(s, { known: false, level: true })).every((f) => f.model === LEVEL_WEEKDAY)).toBe(true)
  }, 120_000)

  it('sixty days after, writes the day by the score’s own test, and keeps beside each row what the level-plus-weekday way would have written', async () => {
    const s = moved(60)
    const on = await written(s, { known: true })
    const stageB = levelWeekdayRows(valuesByKey(s.checkins), T) as Map<string, { point: number; lo: number; hi: number }>
    expect(stageB).not.toBeNull()
    expect(on.every((f) => f.model === LEVEL_WEEKDAY && f.four !== undefined)).toBe(true)
    for (const f of on) expect(f.stageB).toEqual(stageB.get(keyOf(f)))
    // The two are not the same rows: Stage C left the moved weekdays' earlier days out.
    expect(on.some((f) => f.point !== (f.stageB as { point: number }).point)).toBe(true)
  }, 120_000)

  for (const challenger of [false, true]) {
    it(`on a record with nothing there, writes exactly the rows it writes switched off (the challenger ${challenger ? 'on' : 'off'})`, async () => {
      const s = standIn({})
      const off = await written(s, { known: false, challenger })
      const on = await written(s, { known: true, challenger })
      expect(on.length).toBeGreaterThan(20)
      expect(JSON.stringify(on)).toBe(JSON.stringify(off))
      expect(readerOf(s).state().inUse).toBe(false)
    }, 120_000)
  }

  it('never rewrites a row it wrote: run again after the day’s check-ins and on the next day, each is byte for byte', async () => {
    const s = TWO()
    const first = await written(s, { known: true })
    const ids = (await db.forecasts.toArray()).map((f) => f.id as number)
    await db.checkins.bulkAdd(standIn({ today: addDays(T, 1), days: 201, steps: inTwoReadings, wobble: twoReadingsWobble }).checkins.filter((c) => c.day === T))
    await runForecasting(T)
    await runForecasting(addDays(T, 1))
    const after = await db.forecasts.bulkGet(ids)
    expect(JSON.stringify(after.map((f) => { const { id: _id, ...row } = f as Forecast; return row }))).toBe(JSON.stringify(first))
    expect(await db.forecasts.count()).toBeGreaterThan(first.length)
  }, 120_000)

  it('writes no row for a day inside a planned trip on a day it writes, and leaves the trip’s days to the pick on a day it does not', async () => {
    const away = { from: addDays(T, 2), to: addDays(T, 3) }
    const on = await written(TWO(), { known: true, away })
    expect(on.length).toBeGreaterThan(10)
    expect(on.some((f) => f.day >= away.from && f.day <= away.to)).toBe(false)
    // The probe: with no trip, those days are written.
    expect((await written(TWO(), { known: true })).some((f) => f.day === away.from)).toBe(true)
    // On a day Stage C is not in use the pick writes exactly as before, a trip's days and all.
    const none = await written(standIn({}), { known: true, away })
    expect(JSON.stringify(none)).toBe(JSON.stringify(await written(standIn({}), { known: false, away })))
    expect(none.some((f) => f.day === away.from)).toBe(true)
  }, 120_000)

  it('puts the challenger on top of Stage C: its base is the day’s way, and a row it moves keeps Stage C’s row as its plain forecast and the four’s beside it', async () => {
    const s = standIn({ steps: bySunshine(), weather: true, shortNights: true })
    const reader = readerOf(s)
    expect(reader.state().weather[0]).toBe(true)
    const values = valuesByKey(s.checkins)
    const four = byKey(await written(s, { known: false }))
    const alone = byKey(await written(s, { known: true }))
    const both = await written(s, { known: true, challenger: true })
    const moved = both.filter((f) => typeof f.adj === 'number')
    expect(moved.length).toBeGreaterThan(0)
    for (const f of moved) {
      const was = four.get(keyOf(f)) as Forecast
      expect(f.model).toBe(LEVEL_WEATHER)
      const own = alone.get(keyOf(f)) as Forecast
      expect(f.plain).toEqual({ point: own.point, lo: own.lo, hi: own.hi })
      expect(f.four).toEqual({ model: was.model, point: was.point, lo: was.lo, hi: was.hi })
      // Moved from Stage C's own forecast: its point plus the points added (kept to a tenth), rounded.
      expect(Math.abs(f.point - ((reader.forecast(f.day, f.block) as number) + (f.adj as number)))).toBeLessThanOrEqual(0.55)
    }
    // The probe: moved from the four's forecast, some points would be elsewhere.
    expect(moved.some((f) => Math.abs(f.point - ((predict((f.four as { model: string }).model as ModelId, values, f.day, f.block) as number) + (f.adj as number))) > 0.55)).toBe(true)
    for (const f of both.filter((x) => x.adj === undefined)) expect(JSON.stringify(f)).toBe(JSON.stringify(alone.get(keyOf(f))))
  }, 180_000)
})

describe('the export of Stage C’s rows', () => {
  it('carries what the Stage B way would have written and the weather measure used, beside the four’s row, moved or not', () => {
    const four = { model: 'weekdayBlock', point: 50, lo: 42, hi: 57 }
    const stageB = { point: 53, lo: 45, hi: 60 }
    expect(forecastAdjustment({ four, stageB, weather: 'sunshine' }, new Map(), false)).toEqual({ four, stageB, weather: 'sunshine' })
    expect(forecastAdjustment({ adj: -4, adjBy: ['sleep.short'], plain: { point: 47, lo: 40, hi: 55 }, four, weather: 'rain' }, new Map(), false)).toEqual({ adj: -4, adjBy: ['sleep.short'], plain: { point: 47, lo: 40, hi: 55 }, four, weather: 'rain' })
    expect(forecastAdjustment({}, new Map(), false)).toEqual({})
    const row: Forecast = { day: '2026-11-24', block: 'morning', horizon: 1, madeOn: T, model: 'levelWeekdayWeather', point: 47, lo: 40, hi: 55, whatIf: null, four, stageB, weather: 'high' }
    const json = buildExport([], [], [], DEFAULT_SETTINGS, { includePrivate: false }, undefined, { offers: [], outcomes: [], cards: [], declarations: [], forecasts: [row], forecastScores: [] }).json
    expect(JSON.stringify(JSON.parse(json))).toContain('"model":"levelWeekdayWeather","point":47,"lo":40,"hi":55,"whatIf":null,"four":{"model":"weekdayBlock","point":50,"lo":42,"hi":57},"stageB":{"point":53,"lo":45,"hi":60},"weather":"high"')
  }, 60_000)
})
