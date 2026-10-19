import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addDays } from '../blocks'
import { factSheet } from '../brainFlow'
import { LEARNING_REPAIR } from '../brainShared'
import { db } from '../db'
import { START, walkRecord } from './fixtures'

// The learning repair closed, as it ships until stage R6: the phone's fact sheet carries none of its facts, so the Worker's
// prompts read exactly as before (stage R5).

const DAY = addDays(START, 14)

describe('the sheet, with the repair closed', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('carries no ladder fact and no track record', async () => {
    expect(LEARNING_REPAIR).toBe('gated')
    const r = walkRecord(14, true)
    await db.checkins.bulkAdd(r.checkins.map((c) => ({ ...c })))
    await db.offers.bulkAdd(r.offers.map((o) => ({ ...o })))
    await db.outcomes.bulkAdd(r.outcomes.map((o) => ({ ...o })))
    await db.days.bulkAdd(r.days.map((d) => ({ ...d })))
    const sheet = await factSheet(DAY, new Date(2026, 8, 15, 13, 30))
    expect(sheet.facts.length).toBeGreaterThan(5)
    expect(sheet.facts.filter((f) => f.id.startsWith('ladder.') || f.id === 'track')).toEqual([])
  })
})
