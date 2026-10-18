import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addDays } from './blocks'
import { factSheet } from './brainFlow'
import { db, type CheckIn } from './db'
import { factById } from './facts'
import library from './library.json'
import type { ClaimCard } from './libraryTypes'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'
import { retrieve } from '../worker/src/library'

// Stage 3, item 5, part 5: Outside a while today, compared like the other chips. Its fact carries the tag the library's
// daylight, nature-walk, nature-attention and green-exercise cards carry: nature (the design said outdoors; the
// library holds no such tag, so nature, recorded as the builder's correction).

const DAY = '2026-09-20'
const allAt = (ids: readonly ReadingId[], p: Position): Answers => Object.fromEntries(ids.map((id) => [id, p]))
const ci = (day: string, block: CheckIn['block'], p: Position, extras?: CheckIn['extras']): CheckIn => ({ day, block, answers: allAt(blockReadings(block), p), startedAt: '', completedAt: `${day}T21:00:00.000Z`, updatedAt: '', activeMs: 30_000, extras })

describe('Outside a while today on the day’s sheet', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('files its comparison under nature, which brings the library’s nature cards with it', async () => {
    const rows: CheckIn[] = []
    for (let k = 1; k <= 6; k++) {
      const day = addDays(DAY, -2 * k)
      rows.push(ci(day, 'evening', 3, { chipsShown: { outside: true }, ...(k % 2 ? { outside: true as const } : {}) }), ci(addDays(day, 1), 'morning', k % 2 ? 4 : 2))
    }
    await db.checkins.bulkAdd(rows)
    const sheet = await factSheet(DAY, new Date(2026, 8, 20, 20, 0))
    const outside = factById(sheet, 'assoc.outside')
    expect(outside?.tags).toEqual(['nature'])
    expect(outside?.values).toMatchObject({ times: 3 })
    const cards = (library as unknown as ClaimCard[]).filter((c) => c.status === 'admitted')
    const nature = cards.filter((c) => c.tags.includes('nature')).map((c) => c.id)
    expect(nature).toEqual(expect.arrayContaining(['daylight-and-mood', 'nature-walk-rumination', 'nature-attention-restoration', 'green-exercise-dose']))
    const picked = retrieve(cards, { ...sheet, facts: [outside as NonNullable<typeof outside>] }).map((c) => c.id)
    expect(picked.some((id) => nature.includes(id))).toBe(true)
  })
})
