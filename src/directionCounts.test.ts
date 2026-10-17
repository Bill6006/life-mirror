import 'fake-indexeddb/auto'
import { beforeAll, describe, expect, it } from 'vitest'
import { addLearning, logSession, studyAims } from './aimFlow'
import { stepFor } from './aims'
import { factSheet } from './brainFlow'
import { db, ensureDayContext, getSettings } from './db'

// The counts under the direction in the fact the Brain reads, each in the singular at one: an
// instance of the wording defects (stage 1, item q) that stage 1 left, found on Now in group 4's
// screenshots. The line on Now is tested with the judgment engine.

const DAY = '2026-10-04'
const NOW = new Date(2026, 9, 4, 7, 45)

describe('the counts under the direction, in the fact the Brain reads (stage 1, item q)', () => {
  beforeAll(async () => {
    await db.delete()
    await db.open()
    await ensureDayContext(DAY, await getSettings())
    await addLearning('Learn Veltish', 'A phrasebook', 'Ten words', 'I can read a little', new Date(2026, 8, 20, 9, 0))
    const [aim] = await studyAims()
    const skills = await db.skills.toArray()
    await logSession(aim, stepFor(aim, skills, [], [aim]), new Date(2026, 9, 1, 20, 0))
  })

  it('says one study session in the singular, and the counts of none in the plural', async () => {
    const sheet = await factSheet(DAY, NOW)
    expect(sheet.facts.find((f) => f.id === 'becoming')?.text).toBe('Under the direction: 1 study session, 0 conversations started, 0 faith practices, 0 times with her.')
  })
})
