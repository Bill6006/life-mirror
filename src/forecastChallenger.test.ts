import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { addDays, BLOCKS } from './blocks'
import { setChallengerForTests } from './challenger'
import { EVENING_ID, SLEEP_ID } from './challengerRecord'
import { FIXTURE_TODAY, fixtureCheckin, fixtureCheckins, fixtureShortLastNight } from './challengerTesting'
import { copy } from './copy'
import { db, type CheckIn, type Forecast } from './db'
import { MODELS, type ModelId } from './forecast'
import { runForecasting, weeklyData } from './forecastFlow'
import type { Position } from './readings'

// The forecast writer with the challenger switched on, in tests alone (2026-11-14): on a stand-in record where the day
// after a short night reads lower. The rows it adjusts, the rows it leaves, and the leakage rules on the wired code.

const TODAY = FIXTURE_TODAY
const keyOf = (f: Forecast): string => `${f.day}|${f.block}|${f.horizon}`

/** The writer run once on a fresh store holding these check-ins, with the switch as given; the rows by slot and horizon, without their ids. */
async function written(on: boolean, checkins: readonly CheckIn[] = fixtureCheckins(), today: string = TODAY): Promise<Map<string, Forecast>> {
  await db.delete()
  await db.open()
  await db.checkins.bulkAdd([...checkins])
  setChallengerForTests(on)
  await runForecasting(today)
  return new Map((await db.forecasts.toArray()).map(({ id: _id, ...f }) => [keyOf(f), f]))
}
/** The fixture with yesterday morning's sleep answer as given. */
const withLastNight = (sleepHours: Position): CheckIn[] => fixtureCheckins().map((c) => (c.day === addDays(TODAY, -1) && c.block === 'morning' ? fixtureCheckin(c.day, 'morning', c.answers.mood as Position, sleepHours) : c))

afterEach(() => setChallengerForTests(null))

describe('the forecast writer, with the challenger switched on', () => {
  it('adjusts today’s rows by what the record held the day before, and leaves the days further out as the base way’s', async () => {
    const off = await written(false)
    const on = await written(true)
    expect([...on.keys()]).toEqual([...off.keys()])
    const today = BLOCKS.map((b) => on.get(`${TODAY}|${b}|0`) as Forecast)
    // The fixture's last morning reported a short night or did not; either way the day after reads apart, and today's rows say so.
    const lower = fixtureShortLastNight()
    for (const f of today) {
      expect(f.adj).toBeDefined()
      expect((f.adj as number) < 0).toBe(lower)
      expect(f.adjBy).toContain(SLEEP_ID)
      expect(f.adjBy?.every((id) => id === SLEEP_ID || id === EVENING_ID)).toBe(true)
      const base = off.get(keyOf(f)) as Forecast
      expect(f.point < base.point).toBe(lower)
      expect(f.model).toBe(base.model)
      expect(f.lo <= f.point && f.point <= f.hi).toBe(true)
    }
    // Two days out and beyond, the day before has not happened: the rows are the base way's, byte for byte.
    const far = [...on.values()].filter((f) => f.horizon >= 2)
    expect(far.length).toBeGreaterThan(10)
    for (const f of far) expect(JSON.stringify(f)).toBe(JSON.stringify(off.get(keyOf(f))))
    expect(far.every((f) => f.adj === undefined && f.adjBy === undefined)).toBe(true)
  })

  it('writes every row under one of the four ways’ names, so the Weekly View’s sentence names the base way', async () => {
    const on = await written(true)
    expect([...on.values()].every((f) => (MODELS as readonly string[]).includes(f.model))).toBe(true)
    const weekly = await weeklyData(TODAY)
    expect(MODELS).toContain(weekly.model)
    expect(copy.brief.models[weekly.model as ModelId]).toBeTruthy()
  })

  it('never rewrites an adjusted row: run again after the day’s outcomes, every row is byte for byte', async () => {
    const first = await written(true)
    await db.checkins.bulkAdd(BLOCKS.map((b) => fixtureCheckin(TODAY, b, 1, 1)))
    await runForecasting(TODAY)
    await runForecasting(addDays(TODAY, 1))
    const later = new Map((await db.forecasts.toArray()).map(({ id: _id, ...f }) => [keyOf(f), f]))
    for (const [key, f] of first) expect(JSON.stringify(later.get(key))).toBe(JSON.stringify(f))
    expect(later.size).toBeGreaterThan(first.size)
  })

  it('lets nothing logged today move today’s forecast: this morning’s sleep answer changes no row for this afternoon or evening', async () => {
    const rows = async (sleepHours: Position): Promise<string> => {
      const on = await written(true, [...fixtureCheckins(), fixtureCheckin(TODAY, 'morning', 3, sleepHours)])
      expect(on.has(`${TODAY}|morning|0`)).toBe(false)
      return JSON.stringify(['afternoon', 'evening'].map((b) => on.get(`${TODAY}|${b}|0`)))
    }
    const short = await rows(1)
    expect(await rows(5)).toBe(short)
    expect(short).toContain('"adj"')
  })

  it('reads last night’s sleep from yesterday morning’s answer: a different answer there does move today', async () => {
    const todayRows = async (sleepHours: Position): Promise<number[]> => {
      const on = await written(true, withLastNight(sleepHours))
      return BLOCKS.map((b) => (on.get(`${TODAY}|${b}|0`) as Forecast).point)
    }
    const afterShort = await todayRows(1)
    const afterLong = await todayRows(4)
    for (let i = 0; i < BLOCKS.length; i++) expect(afterShort[i]).toBeLessThan(afterLong[i])
  })

  it('adjusts nothing while the challenger is tried and not picked: the rows are the base way’s, byte for byte', async () => {
    // Thirty days of the same record: enough for its sizes, too few slots for its margin.
    const short = fixtureCheckins(30)
    const off = await written(false, short)
    const on = await written(true, short)
    expect(off.size).toBeGreaterThan(20)
    expect(JSON.stringify([...on])).toBe(JSON.stringify([...off]))
  })

  it('with the switch off, writes no adjusted row on the same record', async () => {
    const off = await written(false)
    expect([...off.values()].some((f) => f.adj !== undefined || f.adjBy !== undefined)).toBe(false)
  })
})
