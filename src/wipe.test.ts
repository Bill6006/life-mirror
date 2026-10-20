import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, wipeEverything } from './db'

// Delete everything leaves nothing behind (Rule 13), the past records the retired engine left among it: its claims and
// belief rows are kept untouched until then, and go with everything else (moved here from claims.test.ts, 2026-10-20).

describe('the wipe', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('leaves every table empty, those added since the wipe was written and the retired engine’s past rows among them', async () => {
    await db.coachAsks.add({ aimId: 1, kind: 'skill', day: '2026-10-16', at: '2026-10-16T12:00:00.000Z', claude: false } as never)
    await db.claims.add({ cardId: 1, moveId: 'walk-ten', situationKey: 'afternoon:stress', target: 'stress', day: '2026-10-16', at: '2026-10-16T23:00:00.000Z', level: 'promising', interval: null, estimator: null, n: { done: 0, alternative: 0 }, engine: 'engine-2026-10-16' } as never)
    await db.journal.add({ day: '2026-10-16', text: 'Words of the night.', writtenAt: '2026-10-16T23:00:00.000Z', editedAt: null, updatedAt: '2026-10-16T23:00:00.000Z' })
    await db.beliefs.put({ situationKey: 'afternoon:stress', moveId: 'walk-ten' } as never)
    await db.tagBeliefs.put({ id: 'walk' } as never)
    expect(await db.claims.count()).toBe(1)
    expect(await db.beliefs.count()).toBe(1)
    await wipeEverything()
    for (const t of db.tables) expect(await t.count(), t.name).toBe(0)
  })
})
