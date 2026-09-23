import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { caffeineWords } from './caffeine'
import { db, getCheckIn, getSettings, markCaffeineShown, setCaffeine, type CheckIn } from './db'
import { buildExport } from './export'
import { blockReadings, type Answers } from './readings'
import { readingOf } from './score'

// Caffeine (Part 21): one optional item, a band per check-in window, no "None" and never a
// stored zero; the reading out of 100 never moves by it.

const DAY = '2026-09-23'
const done = (block: CheckIn['block'], hour: number): CheckIn => {
  const at = new Date(2026, 8, 23, hour, 0).toISOString()
  const answers = Object.fromEntries(blockReadings(block).map((id) => [id, 3])) as Answers
  return { day: DAY, block, asked: [...blockReadings(block)], answers, startedAt: at, completedAt: at, updatedAt: at, activeMs: 30_000 }
}

describe('the Caffeine item', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('stores the band with its window: since waking for the day’s first, since the previous check-in after that', async () => {
    await db.checkins.add(done('morning', 7))
    await setCaffeine({ day: DAY, block: 'morning' }, [], 2, new Date(2026, 8, 23, 7, 5))
    expect((await getCheckIn(DAY, 'morning'))?.extras?.caffeineIntake).toEqual({ band: 2, at: new Date(2026, 8, 23, 7, 5).toISOString(), since: null })
    await db.checkins.add(done('afternoon', 13))
    await setCaffeine({ day: DAY, block: 'afternoon' }, [], 1, new Date(2026, 8, 23, 13, 5))
    expect((await getCheckIn(DAY, 'afternoon'))?.extras?.caffeineIntake).toMatchObject({ band: 1, since: new Date(2026, 8, 23, 7, 0).toISOString() })
  })

  it('changes the band, clears it on a second tap of the same one, and never writes a zero', async () => {
    await db.checkins.add(done('morning', 7))
    const slot = { day: DAY, block: 'morning' as const }
    await setCaffeine(slot, [], 3)
    await setCaffeine(slot, [], 2)
    expect((await getCheckIn(DAY, 'morning'))?.extras?.caffeineIntake?.band).toBe(2)
    await setCaffeine(slot, [], null)
    const ex = (await getCheckIn(DAY, 'morning'))?.extras
    expect(ex?.caffeineIntake).toBeUndefined()
    expect(ex?.caffeineShown).toBe(true)
    expect(JSON.stringify(ex)).not.toMatch(/"band":0/)
  })

  it('marks the item shown only on a check-in that exists, once', async () => {
    await markCaffeineShown({ day: DAY, block: 'morning' })
    expect(await getCheckIn(DAY, 'morning')).toBeNull()
    await db.checkins.add(done('morning', 7))
    await markCaffeineShown({ day: DAY, block: 'morning' })
    expect((await getCheckIn(DAY, 'morning'))?.extras).toEqual({ caffeineShown: true })
  })

  it('leaves the reading out of 100 exactly as reported', async () => {
    const plain = done('morning', 7)
    const withCaffeine: CheckIn = { ...plain, extras: { caffeineIntake: { band: 4, at: plain.completedAt as string, since: null }, caffeineShown: true } }
    expect(readingOf(withCaffeine)).toEqual(readingOf(plain))
  })

  it('reads older records as some caffeine, amount unknown, and exports the band beside the old columns', async () => {
    expect(caffeineWords({ extras: { heavyCaffeine: true } })).toBe('Recorded before amounts: caffeine, amount unknown.')
    expect(caffeineWords({ extras: { caffeineIntake: { band: 3, at: '', since: null } } })).toBe('200–299 mg')
    expect(caffeineWords({ extras: { caffeineShown: true } })).toBeNull()
    const rows = [
      { ...done('morning', 7), extras: { caffeineIntake: { band: 2, at: '2026-09-23T11:05:00.000Z', since: null }, caffeineShown: true } as CheckIn['extras'] },
      { ...done('evening', 19), extras: { caffeine: true } as CheckIn['extras'] },
    ]
    const out = buildExport(rows, [], [], await getSettings(), { includePrivate: false })
    const json = JSON.parse(out.json)
    expect(json.checkins[0].extras).toMatchObject({ caffeineBand: 2, caffeineSince: null, caffeineShown: true, heavyCaffeineThisMorning: false })
    expect(json.checkins[1].extras).toMatchObject({ caffeineBand: null, caffeineAfterMidday: true })
    expect(out.csv.split('\n')[0]).toContain('caffeine_band,caffeine_since,caffeine_at,caffeine_shown')
  })
})
