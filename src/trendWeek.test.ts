import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addDays } from './blocks'
import { factSheet } from './brainFlow'
import { db } from './db'
import type { Position } from './readings'

// Trends read by the week (stage 3, group 1): the seven days to yesterday against the seven before,
// each with its count; today's answers wait for tomorrow; none is said until each week holds three.

const DAY = '2026-10-22'
const NOW = new Date(2026, 9, 22, 21, 0)

async function mood(day: string, p: Position): Promise<void> {
  await db.checkins.add({ day, block: 'evening', answers: { mood: p }, startedAt: `${day}T23:00:00.000Z`, completedAt: `${day}T23:01:00.000Z`, updatedAt: `${day}T23:01:00.000Z`, activeMs: 60_000 })
}
const trend = async () => (await factSheet(DAY, NOW)).facts.find((f) => f.id === 'trend.mood')

describe('a reading’s trend', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('sets the seven days to yesterday against the seven before, and leaves today out', async () => {
    for (let back = 14; back >= 8; back--) await mood(addDays(DAY, -back), 2)
    for (let back = 7; back >= 1; back--) await mood(addDays(DAY, -back), 4)
    await mood(DAY, 1)
    const f = await trend()
    expect(f?.text).toBe('Mood: the 7 days to yesterday average 4 of 5 over 7 answers, against 2 over 7 answers the 7 days before.')
    expect(f?.values).toEqual({ recent: 4, prior: 2, recentAnswers: 7, priorAnswers: 7, days: 7 })
    expect(f?.n).toBe(7)
  })

  it('says nothing until each week holds three answers', async () => {
    for (const back of [9, 12]) await mood(addDays(DAY, -back), 2)
    for (const back of [1, 3, 5]) await mood(addDays(DAY, -back), 4)
    expect(await trend()).toBeUndefined()
    await mood(addDays(DAY, -14), 3)
    expect((await trend())?.text).toBe('Mood: the 7 days to yesterday average 4 of 5 over 3 answers, against 2.3 over 3 answers the 7 days before.')
  })
})
