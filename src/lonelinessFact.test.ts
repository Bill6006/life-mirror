import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { factSheet } from './brainFlow'
import { db } from './db'

// Part 42: the day's sheet names Loneliness by what it measures, so the phone's line, the free models
// and Claude read an answer the same way: closeness felt missing, never a wish for company.

describe('the Loneliness fact', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await db.checkins.add({ day: '2026-10-19', block: 'evening', answers: { loneliness: 3 }, startedAt: '2026-10-19T23:00:00.000Z', completedAt: '2026-10-19T23:01:00.000Z', updatedAt: '2026-10-19T23:01:00.000Z', activeMs: 60_000 })
  })

  it('says what the reading measures beside the answer, in the answer’s own word', async () => {
    const sheet = await factSheet('2026-10-20', new Date(2026, 9, 20, 9, 30))
    const f = sheet.facts.find((x) => x.id === 'context.loneliness')
    expect(f?.text).toBe('Loneliness (how much meaningful closeness feels missing, not a wish for company or how many people are around) read “Distant” (3 of 5) at the evening check-in on 2026-10-19.')
    expect(f?.values).toMatchObject({ position: 3, word: 'Distant' })
  })
})
