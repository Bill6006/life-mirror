import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { NOTHING } from '../catalogue'
import { db, ensureDayContext, getSettings, saveAnswer, type Offer } from '../db'
import { replacementsFor } from '../offerFlow'
import { blockReadings } from '../readings'

// Skip's count (D6) since the old engine was retired (2026-10-20): what a skip could show, counted by the same day rule as
// the new engine's draw of the replacement, so Skip never promises a move the draw may not give.

const DAY = '2026-09-18'
const AT = new Date(2026, 8, 18, 14, 0)
const asked = blockReadings('afternoon')

function offer(over: Partial<Offer>): Offer {
  return { kind: 'block', day: DAY, block: 'afternoon', at: AT.toISOString(), situationKey: 'stress|low', target: 'stress', stance: '', band: 'low', reading: 2, moveId: 'walk-ten', cardId: null, candidates: ['walk-ten', NOTHING], coinFlip: false, passiveId: null, whyNot: null, propensity: 0.5, propensities: { 'walk-ten': 0.5, [NOTHING]: 0.5 }, skippedAt: null, closedAt: null, ...over }
}

describe('Skip’s count', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await ensureDayContext(DAY, await getSettings())
    for (const id of asked) await saveAnswer({ day: DAY, block: 'afternoon' }, asked, id, 3, 500)
  })

  it('leaves out moves with a day’s window once one was offered that day, as the draw of the replacement does', async () => {
    const here = (await db.offers.get(await db.offers.add(offer({})))) as Offer
    const before = await replacementsFor(here, AT)
    // An evening move for the next morning, offered aside today: never among the afternoon's own moves, so only the day's rule can count it.
    await db.offers.add(offer({ kind: 'pickup', moveId: 'todo-list-before-bed', candidates: ['todo-list-before-bed'], propensities: { 'todo-list-before-bed': 1 } }))
    const after = await replacementsFor(here, AT)
    expect(before).toBeGreaterThan(0)
    expect(after).toBeGreaterThan(0)
    expect(after).toBeLessThan(before)
  })
})
