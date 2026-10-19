import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The repair's switch opened for these tests alone: in the app it stays gated until stage R6.
vi.mock('../brainShared', async (importOriginal) => ({ ...(await importOriginal<typeof import('../brainShared')>()), LEARNING_REPAIR: 'open' }))

import { addDays } from '../blocks'
import { factSheet } from '../brainFlow'
import { db } from '../db'
import { START, walkRecord } from './fixtures'

// The learning repair on the phone's fact sheet (stage R5): while the repair is on, the sheet the Worker reads carries its
// tests on the evidence ladder and its track record, beside the cards, findings the owner can act on first.

const DAY = addDays(START, 14)

async function seed(): Promise<void> {
  const r = walkRecord(14, true)
  await db.checkins.bulkAdd(r.checkins.map((c) => ({ ...c })))
  await db.offers.bulkAdd(r.offers.map((o) => ({ ...o })))
  await db.outcomes.bulkAdd(r.outcomes.map((o) => ({ ...o })))
  await db.days.bulkAdd(r.days.map((d) => ({ ...d })))
}

describe('the sheet, with the repair on', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('carries the repair’s tests and its track record, the test that helps first, the record after them', async () => {
    await seed()
    const sheet = await factSheet(DAY, new Date(2026, 8, 15, 13, 30))
    const ids = sheet.facts.map((f) => f.id)
    const ladder = ids.filter((id) => id.startsWith('ladder.'))
    expect(ladder[0]).toBe('ladder.walk-ten.stress')
    expect(sheet.facts.find((f) => f.id === 'ladder.walk-ten.stress')?.values.direction).toBe('helps')
    expect(ids).toContain('track')
    expect(ids.indexOf('track')).toBeGreaterThan(ids.indexOf(ladder[ladder.length - 1]))
  })
})
