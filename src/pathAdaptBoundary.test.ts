import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addAim, studyAims } from './aimFlow'
import { factSheet } from './brainFlow'
import { db, ensureDayContext, getSettings } from './db'
import { keyOf, type PathAdaptation } from './pathAdapt'

// P6's boundary on the phone (2026-11-07): your changes to how a Path runs, and the small tests, stay off the fact sheet
// the Brain and the free models read. The sheet's step follows the row the phone offers, so a rep you set aside is never
// its step, but no change's words, origin or reason ever appears on it. The probe could say yes: the same marker in a
// commitment's name is on the sheet.

const DAY = '2026-11-20'
const NOW = new Date(2026, 10, 20, 9, 0)
const MARK = 'zq-adapt-marker'

function applied(r: Omit<PathAdaptation, 'key' | 'at' | 'day' | 'stateAt' | 'state' | 'version' | 'hash'>): PathAdaptation {
  const at = NOW.toISOString()
  return { ...r, at, day: DAY, version: '1', hash: 'h', state: 'applied', stateAt: at, key: keyOf(r) }
}

describe('the fact sheet', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await ensureDayContext(DAY, await getSettings())
  })

  it('never carries a change to how a Path runs, nor a small test, though its step follows the row', async () => {
    await db.aims.add({ kind: 'path', path: 'social', stepMoveId: null, pausedAt: null, createdAt: '2026-11-01T08:00:00.000Z', archivedAt: null })
    expect(JSON.stringify(await factSheet(DAY, NOW))).toContain('The Social path')
    await db.pathAdaptations.bulkAdd([
      applied({ path: 'social', kind: 'setAside', rep: 'eye-contact-stranger', origin: 'safety', why: `You said ${MARK}.` }),
      applied({ path: 'social', kind: 'prefer', rep: 'greet-by-name', origin: 'preference', why: MARK }),
    ])
    await db.pathTests.add({ path: 'social', lever: 'planLine', at: NOW.toISOString(), day: DAY })
    await db.pathTestDays.add({ test: 1, day: DAY, version: 1, chance: 0.5, at: NOW.toISOString() })
    const sheet = JSON.stringify(await factSheet(DAY, NOW))
    for (const word of [MARK, 'safety', 'setAside', 'planLine', 'adaptation']) expect(sheet, word).not.toContain(word)
    // The probe: the same marker as a commitment's name is on the sheet.
    await addAim('certification', null, MARK, 'language')
    expect((await studyAims()).length).toBe(1)
    expect(JSON.stringify(await factSheet(DAY, NOW))).toContain(MARK)
  })
})
