import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addDays } from './blocks'
import { db, type CheckIn } from './db'
import { tellsWeekdaysApart } from './forecast'
import { briefData, runForecasting, weeklyData } from './forecastFlow'
import { eveningWorkoutDays } from './workouts'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'

// The forecast writer against the real store: single-flight, add-only, each slot written once
// however many opens race it; and what-if, which speaks of an evening still to come, gone once
// the evening is logged.

const TODAY = '2026-09-18'
const allAt = (ids: readonly ReadingId[], p: Position): Answers => Object.fromEntries(ids.map((id) => [id, p]))
function ci(day: string, block: CheckIn['block'], p: Position): CheckIn {
  const at = new Date(`${day}T${block === 'morning' ? '07' : block === 'afternoon' ? '13' : '19'}:30:00`).toISOString()
  return { day, block, asked: [...blockReadings(block)], answers: allAt(blockReadings(block), p), startedAt: at, completedAt: at, updatedAt: at, activeMs: 30_000 }
}

describe('the forecast writer', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    const rows: CheckIn[] = []
    for (let back = 21; back >= 1; back--) {
      const day = addDays(TODAY, -back)
      rows.push(ci(day, 'morning', 2), ci(day, 'afternoon', 3), ci(day, 'evening', 4))
    }
    await db.checkins.bulkAdd(rows)
  })

  it('lets eight opens race it: every call resolves, nothing is rejected, and each slot is written once', async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => runForecasting(TODAY)))
    expect(results.filter((r) => r.status === 'rejected')).toEqual([])
    const rows = await db.forecasts.toArray()
    expect(rows.length).toBeGreaterThan(0)
    const keys = rows.map((f) => `${f.day}|${f.block}|${f.horizon}`)
    expect(new Set(keys).size).toBe(keys.length)
    // Add-only: another run finds nothing more to write for the same day.
    await runForecasting(TODAY)
    expect(await db.forecasts.count()).toBe(rows.length)
  })

  it('says what-if while the evening is still to come, and nothing once the evening is logged', async () => {
    await runForecasting(TODAY)
    expect((await briefData(TODAY)).whatIf).not.toBeNull()
    await db.checkins.add(ci(TODAY, 'evening', 3))
    expect((await briefData(TODAY)).whatIf).toBeNull()
  })
})

describe('the week ahead on the weekly view (truth audit, 2026-09-24)', () => {
  const UP = new Set(['mood', 'energy', 'focus'])
  const DOWN = new Set(['stress', 'overwhelm', 'irritation'])
  /** A check-in whose reading is (p - 1) × 25: the better-up readings at p, the better-down ones mirrored. */
  function at(day: string, block: CheckIn['block'], p: Position): CheckIn {
    const answers = Object.fromEntries(blockReadings(block).map((id) => [id, UP.has(id) ? p : DOWN.has(id) ? 6 - p : 3])) as Answers
    return { ...ci(day, block, 3), answers }
  }
  async function seed(positionOn: (day: string) => Position): Promise<void> {
    await db.delete()
    await db.open()
    const rows: CheckIn[] = []
    for (let back = 35; back >= 1; back--) {
      const day = addDays(TODAY, -back)
      for (const block of ['morning', 'afternoon', 'evening'] as const) rows.push(at(day, block, positionOn(day)))
    }
    await db.checkins.bulkAdd(rows)
    await runForecasting(TODAY)
  }
  const isMonday = (day: string) => new Date(`${day}T12:00:00`).getDay() === 1

  it('with a weekday-blind model, says the days come out alike and marks none of the seven as the lowest', async () => {
    await seed(() => 4)
    const w = await weeklyData(TODAY)
    expect(w.weekAheadReady).toBe(true)
    // A flat record ties every model; whichever wins, it is one blind to weekdays.
    expect(tellsWeekdaysApart(w.model!)).toBe(false)
    expect(new Set(w.weekAhead.map((r) => r.expected))).toEqual(new Set([75]))
    expect(w.weekAheadAlike).toBe(true)
    expect(w.weekAheadLow).toEqual([])
  })

  it('marks no lowest day when a weekday-blind model’s days differ by a point, and marks it when a weekday model’s do', async () => {
    await db.delete()
    await db.open()
    const points = [69, 69, 68, 69, 69, 69, 69]
    const rows = (model: string) => points.flatMap((point, i) => (['morning', 'afternoon', 'evening'] as const).map((block) => ({ day: addDays(TODAY, i + 1), block, horizon: i + 1, madeOn: TODAY, model, point, lo: point - 10, hi: point + 10, whatIf: null })))
    await db.forecasts.bulkAdd(rows('sameBlock'))
    expect((await weeklyData(TODAY)).weekAheadLow).toEqual([])
    await db.forecasts.clear()
    await db.forecasts.bulkAdd(rows('weekdayBlock'))
    expect((await weeklyData(TODAY)).weekAheadLow).toEqual([2])
  })

  it('with a Monday dip, names a weekday model, and marks the Monday as the lowest', async () => {
    await seed((day) => (isMonday(day) ? 2 : 4))
    const w = await weeklyData(TODAY)
    expect(w.model).toBe('weekdayBlock')
    expect(w.weekAheadAlike).toBe(false)
    const monday = w.weekAhead.findIndex((r) => isMonday(r.day))
    expect(w.weekAhead[monday].expected).toBe(25)
    expect(w.weekAheadLow).toEqual([monday])
  })
})

describe('last night’s workout (Part 33)', () => {
  it('counts a session finished in the evening, the small hours going to the evening before, and never a morning one', () => {
    const at = (d: number, h: number, m: number) => new Date(2026, 8, d, h, m).toISOString()
    const days = eveningWorkoutDays([{ at: at(20, 7, 30) }, { at: at(21, 18, 45) }, { at: at(23, 1, 10) }, { at: at(24, 16, 59) }, { at: 'not a time' }])
    expect([...days].sort()).toEqual(['2026-09-21', '2026-09-22'])
  })
})
