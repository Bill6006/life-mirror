import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { factSheet } from './brainFlow'
import { db } from './db'
import { readingById } from './readings'

// Item 4 of the after-window list (the owner's word, 2026-10-09): Stress and Overwhelm reworded so
// they read as two things, the headwords kept, the day of the change noted, and a comparison across
// it saying so.

async function answers(days: readonly string[], stress: 1 | 2 | 3 | 4 | 5): Promise<void> {
  for (const day of days) await db.checkins.add({ day, block: 'evening', answers: { stress }, startedAt: `${day}T23:00:00.000Z`, completedAt: `${day}T23:01:00.000Z`, updatedAt: `${day}T23:01:00.000Z`, activeMs: 60_000 })
}

describe('Stress and Overwhelm, reworded (item 4)', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('asks as agreed, keeps the headwords, and notes the day of the change', () => {
    const s = readingById('stress')
    const o = readingById('overwhelm')
    expect(s.prompt).toBe('How heavy or urgent things feel')
    expect(o.prompt).toBe('How many things are competing for your attention, even small ones')
    expect(s.anchors.map((a) => a.split(' — ')[0])).toEqual(['Loose', 'Light', 'Middling', 'Wound tight', 'Crushing'])
    expect(s.alternates?.map((a) => (a ? a.split(' — ')[0] : null))).toEqual(['Easy', 'Mild', null, 'Braced', 'Flattened'])
    expect(s.anchors[1]).toBe('Light — a little pressure, nothing urgent')
    expect(s.alternates?.[3]).toBe('Braced — pressure I can only just carry')
    expect(s.anchors[4]).toBe('Crushing — more pressure than I can carry')
    // Nothing in Stress counts things any more: that is Overwhelm's job.
    for (const a of [...s.anchors, ...(s.alternates ?? [])]) if (a) expect(a).not.toMatch(/a task or two|a thing or two/)
    expect([s.reworded, o.reworded]).toEqual(['2026-10-16', '2026-10-16'])
  })

  it('says so when the trend compares answers from both sides of the change, and not otherwise', async () => {
    await answers(['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'], 2)
    await answers(['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21'], 3)
    const across = (await factSheet('2026-10-22', new Date(2026, 9, 22, 9, 0))).facts.find((f) => f.id === 'trend.stress')
    expect(across?.text).toBe('Stress: the last 6 answers average 3 of 5 against 2 for the 6 before; its words changed on 2026-10-16, so answers either side may differ a little for that alone.')
    expect(across?.values).toMatchObject({ reworded: '2026-10-16' })
    await db.checkins.clear()
    await answers(['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28'], 3)
    const after = (await factSheet('2026-10-29', new Date(2026, 9, 29, 9, 0))).facts.find((f) => f.id === 'trend.stress')
    expect(after?.text).toBe('Stress: the last 6 answers average 3 of 5 against 3 for the 6 before.')
    expect(after?.values).not.toHaveProperty('reworded')
  })
})
