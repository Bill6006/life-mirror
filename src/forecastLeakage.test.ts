import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addDays, BLOCKS } from './blocks'
import { db, type CheckIn, type Forecast } from './db'
import { runForecasting } from './forecastFlow'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'
import { scorecard } from './weekly'

// The forecast's leakage rules against the real store (2026-11-14): a row once written is never touched, whatever is
// logged after it; no row is written for a slot already logged; and the hit-rate line counts stored rows alone, each
// written on a day before its slot's day. Stand-in records only.

const TODAY = '2026-09-18'
const allAt = (ids: readonly ReadingId[], p: Position): Answers => Object.fromEntries(ids.map((id) => [id, p]))
function ci(day: string, block: CheckIn['block'], p: Position): CheckIn {
  const at = new Date(`${day}T${block === 'morning' ? '07' : block === 'afternoon' ? '13' : '19'}:30:00`).toISOString()
  // Every reading at its middle phrase and mood at the one given: all readings at one phrase read the same out of 100 whatever the phrase, since half of them count downward.
  return { day, block, asked: [...blockReadings(block)], answers: { ...allAt(blockReadings(block), 3), mood: p }, startedAt: at, completedAt: at, updatedAt: at, activeMs: 30_000 }
}
const keyOf = (f: { day: string; block: string; horizon: number }): string => `${f.day}|${f.block}|${f.horizon}`
const byKey = (rows: readonly Forecast[]): Map<string, string> => new Map(rows.map((f) => [keyOf(f), JSON.stringify(f)]))

/** Three days lived one after another: each day the writer runs at the open, the day's check-ins are logged, and the writer runs again. */
async function threeDays(): Promise<{ first: Map<string, string>; afterEachDay: Map<string, string>[] }> {
  await runForecasting(TODAY)
  const first = byKey(await db.forecasts.toArray())
  const afterEachDay: Map<string, string>[] = []
  for (let i = 0; i < 3; i++) {
    const day = addDays(TODAY, i)
    await runForecasting(day)
    await db.checkins.bulkAdd(BLOCKS.map((b) => ci(day, b, i % 2 === 0 ? 1 : 5)))
    await runForecasting(day)
    afterEachDay.push(byKey(await db.forecasts.toArray()))
  }
  return { first, afterEachDay }
}

describe('the forecast’s leakage rules, against the store', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    const rows: CheckIn[] = []
    for (let back = 21; back >= 1; back--) {
      const day = addDays(TODAY, -back)
      rows.push(ci(day, 'morning', back % 3 === 0 ? 2 : 3), ci(day, 'afternoon', 3), ci(day, 'evening', back % 2 === 0 ? 4 : 3))
    }
    await db.checkins.bulkAdd(rows)
  })

  it('never rewrites a stored forecast: the writer run again after the outcome leaves every row byte for byte', async () => {
    const { first, afterEachDay } = await threeDays()
    expect(first.size).toBeGreaterThan(20)
    // Every row of the first run is there after each later day, exactly as it was written.
    for (const later of afterEachDay) for (const [key, row] of first) expect(later.get(key)).toBe(row)
    // And each day's rows are still the same after the days that followed it.
    for (const [key, row] of afterEachDay[0]) expect(afterEachDay[2].get(key)).toBe(row)
    // The probe that can say yes: the later days did write, and the outcomes came after the rows and off their points.
    expect(afterEachDay[2].size).toBeGreaterThan(first.size)
    const scores = await db.forecastScores.toArray()
    expect(scores.length).toBeGreaterThanOrEqual(9)
    expect(scores.some((s) => s.error !== 0)).toBe(true)
  })

  it('writes no forecast for a slot already logged', async () => {
    await db.checkins.add(ci(TODAY, 'morning', 4))
    await runForecasting(TODAY)
    const rows = await db.forecasts.toArray()
    expect(rows.filter((f) => f.day === TODAY).map((f) => f.block).sort()).toEqual(['afternoon', 'evening'])
    // Logged later the same day, the afternoon keeps the row written before it, and gains none.
    await db.checkins.add(ci(TODAY, 'afternoon', 1))
    await runForecasting(TODAY)
    expect(byKey(await db.forecasts.toArray())).toEqual(byKey(rows))
  })

  it('counts in the hit rate only stored forecasts, each written on a day before its slot’s day', async () => {
    await threeDays()
    const [forecasts, scores] = await Promise.all([db.forecasts.toArray(), db.forecastScores.toArray()])
    const stored = new Map(forecasts.map((f) => [keyOf(f), f]))
    const sc = scorecard(scores, [], null)
    const counted = scores.filter((s) => s.horizon === 1)
    // Two days had a day-ahead forecast on record before they were logged: six slots.
    expect(sc.scored).toBe(6)
    expect(counted).toHaveLength(6)
    for (const s of counted) {
      const f = stored.get(keyOf(s)) as Forecast
      // Each is a stored row, with the range it was written with, made the day before its slot.
      expect({ point: f.point, lo: f.lo, hi: f.hi, model: f.model }).toEqual({ point: s.point, lo: s.lo, hi: s.hi, model: s.model })
      expect(f.madeOn).toBe(addDays(s.day, -1))
      expect(f.madeOn < s.day).toBe(true)
    }
    // A slot's own same-day row is scored too, and never counted in the line.
    expect(scores.filter((s) => s.horizon === 0).length).toBeGreaterThan(0)
    expect(sc.hitRate).toBe(counted.filter((s) => s.hit).length / 6)
  })
})
