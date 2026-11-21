import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { addDays } from './blocks'
import { setChallengerForTests } from './challenger'
import { FIXTURE_TODAY, fixtureCheckins } from './challengerTesting'
import { db, type Forecast, type ForecastScore } from './db'
import { buildExport, forecastAdjustment } from './export'
import { runForecasting, weeklyData } from './forecastFlow'
import { movedCheck } from './movedCheck'
import { alternating, checkDays, checkPair } from './movedCheckTesting'
import { DEFAULT_SETTINGS } from './settings'

// Batch 3 (2026-11-21), on the wired forecast writer, with the challenger switched on in tests alone: on a stand-in
// record where the day after a short night reads lower, so the challenger is picked and moves today's rows. Each moved
// row keeps the plain forecast it was moved from, the base way's row number for number; and once the moved forecasts'
// own check reads "switch it off", the writer moves nothing more, and leaves every row already written as it was.

const TODAY = FIXTURE_TODAY
const keyOf = (f: Pick<Forecast, 'day' | 'block' | 'horizon'>): string => `${f.day}|${f.block}|${f.horizon}`
/** Ten days of earlier moved forecasts and their scores, ending eleven days before today: their check's first look. */
const earlier = (a: number): { forecasts: Forecast[]; scores: ForecastScore[] } => checkDays(alternating(a, 10), addDays(TODAY, -20))

/** The writer run once on a fresh store holding the fixture's check-ins and these earlier rows; today's rows by slot. */
async function written(on: boolean, rows?: { forecasts: Forecast[]; scores: ForecastScore[] }): Promise<Map<string, Forecast>> {
  await db.delete()
  await db.open()
  await db.checkins.bulkAdd(fixtureCheckins())
  if (rows) {
    await db.forecasts.bulkAdd(rows.forecasts.map((f) => ({ ...f })))
    await db.forecastScores.bulkAdd(rows.scores.map((s) => ({ ...s })))
  }
  setChallengerForTests(on)
  await runForecasting(TODAY)
  return new Map((await db.forecasts.toArray()).filter((f) => f.madeOn === TODAY).map(({ id: _id, ...f }) => [keyOf(f), f]))
}

afterEach(() => setChallengerForTests(null))

describe('the forecast writer keeps the plain forecast beside each one it moves', () => {
  it('writes, on every row the challenger moves, the plain forecast it was moved from: the base way’s row, number for number', async () => {
    const plain = await written(false)
    const on = await written(true)
    const moved = [...on.values()].filter((f) => f.adj !== undefined)
    expect(moved.length).toBeGreaterThanOrEqual(3)
    for (const f of moved) {
      const base = plain.get(keyOf(f)) as Forecast
      expect(f.plain).toEqual({ point: base.point, lo: base.lo, hi: base.hi })
    }
    // A small adjustment can round to the plain point; on this record they part on some rows.
    expect(moved.some((f) => f.point !== (plain.get(keyOf(f)) as Forecast).point)).toBe(true)
    // A row it does not move carries none, and is the base way's row byte for byte.
    const still = [...on.values()].filter((f) => f.adj === undefined)
    expect(still.length).toBeGreaterThan(10)
    for (const f of still) {
      expect(f.plain).toBeUndefined()
      expect(JSON.stringify(f)).toBe(JSON.stringify(plain.get(keyOf(f))))
    }
  })

  it('with the switch off, writes no plain forecast and no moved row', async () => {
    const off = await written(false)
    expect([...off.values()].some((f) => f.plain !== undefined || f.adj !== undefined)).toBe(false)
  })
})

describe('the forecast writer, once the moved forecasts’ own check reads its verdict', () => {
  it('moves no row once the check reads “switch it off”: today’s rows are the base way’s, byte for byte', async () => {
    const plain = await written(false)
    const stopped = await written(true, earlier(-2.5))
    expect(movedCheck(await db.forecasts.toArray(), await db.forecastScores.toArray(), TODAY)).toMatchObject({ verdict: 'off', reading: { look: 1, n: 40 } })
    expect([...stopped.keys()]).toEqual([...plain.keys()])
    for (const [key, f] of stopped) expect(JSON.stringify(f)).toBe(JSON.stringify(plain.get(key)))
  })

  it('leaves every row already written as it was', async () => {
    const rows = earlier(-2.5)
    await written(true, rows)
    const kept = (await db.forecasts.toArray()).filter((f) => f.madeOn < TODAY).map(({ id: _id, ...f }) => f)
    expect(kept).toEqual(rows.forecasts)
  })

  it('moves rows as before while the check keeps watching, and once it reads “keep it”', async () => {
    for (const [a, verdict] of [
      [1, 'watch'],
      [2.5, 'keep'],
    ] as const) {
      const rows = await written(true, earlier(a))
      expect(movedCheck(await db.forecasts.toArray(), await db.forecastScores.toArray(), TODAY).verdict).toBe(verdict)
      expect([...rows.values()].some((f) => f.adj !== undefined && f.plain !== undefined)).toBe(true)
    }
  })

  it('carries the same check to the Weekly View that the writer read', async () => {
    await written(true, earlier(-2.5))
    const w = await weeklyData(TODAY)
    expect(w.movedCheck).toEqual(movedCheck(await db.forecasts.toArray(), await db.forecastScores.toArray(), TODAY))
    expect(w.movedCheck.verdict).toBe('off')
  })
})

describe('the export of the moved forecasts', () => {
  it('carries each moved forecast’s plain forecast beside the points added, and the day each score was scored', () => {
    const { forecast, score } = checkPair('2026-12-01', 0, 3)
    expect(forecastAdjustment(forecast, new Map(), false)).toEqual({ adj: 5, adjBy: ['sleep.short'], plain: { point: 46, lo: 41, hi: 51 } })
    expect(forecastAdjustment({ adj: 2, adjBy: [] }, new Map(), false)).toEqual({ adj: 2, adjBy: [] })
    const json = buildExport([], [], [], DEFAULT_SETTINGS, { includePrivate: false }, undefined, { offers: [], outcomes: [], cards: [], declarations: [], forecasts: [forecast], forecastScores: [score] }).json
    const compact = JSON.stringify(JSON.parse(json))
    expect(compact).toContain('"adj":5,"adjBy":["sleep.short"],"plain":{"point":46,"lo":41,"hi":51}')
    expect(compact).toContain('"hit":true,"scoredOn":"2026-12-01"')
  })
})
