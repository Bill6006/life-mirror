import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addDays } from './blocks'
import { db, type CheckIn } from './db'
import { briefData, runForecasting } from './forecastFlow'
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
