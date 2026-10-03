import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { factSheet } from './brainFlow'
import { moves } from './catalogue'
import { db, ensureDayContext, getSettings, type Offer } from './db'
import { factById } from './facts'
import { answerPassive, offerHistory, pendingOffers, recordDoneNow, recordOutcome } from './offerFlow'
import { NOTHING } from './offers'
import { pendingRows } from './pendingCopy'
import { memoryKeyValue, setTokenStorageForTests } from './tokenVault'
import { markInStep } from './freshIds'

// What the owner asked to be sure of (2026-10-02), on made-up records: a move answered Done is kept
// at once, in the record, in the queue for the cloud and in the copy beside the token; what rides
// alongside a move stays open until it is answered, whatever the clock says; a move never answered
// stays in History as offered; and History and the day's facts read the same records.

const DAY = '2026-03-12'
const move = moves.find((m) => m.minutes === 5) ?? moves[0]
const settled = () => new Promise((r) => setTimeout(r, 0))

function offered(over: Partial<Offer> = {}): Offer {
  return { kind: 'block', day: DAY, block: 'afternoon', at: new Date(2026, 2, 12, 14, 0).toISOString(), situationKey: 'afternoon:energy', target: 'energy', stance: 'Stabilize', band: 'gettingBy', reading: 50, moveId: move.id, cardId: null, candidates: [move.id], coinFlip: false, passiveId: 'caffeine-cutoff', whyNot: null, skippedAt: null, closedAt: null, ...over }
}

beforeEach(async () => {
  setTokenStorageForTests(memoryKeyValue())
  markInStep()
  await db.delete()
  await db.open()
})

afterEach(() => setTokenStorageForTests(null))

describe('a move answered, kept and shown', () => {
  it('Done on the card is kept at once: in the record, in the queue in the same write, and beside the token once committed', async () => {
    const id = (await db.offers.add(offered())) as number
    expect(await recordDoneNow((await db.offers.get(id)) as Offer, new Date(2026, 2, 12, 14, 40))).toBe(true)
    const outcome = (await db.outcomes.toArray())[0]
    expect(outcome).toMatchObject({ offerId: id, outcome: 'done', passiveOutcome: null })
    const queued = (await db.outbox.toArray()).filter((r) => r.store === 'outcomes')
    expect(queued.map((r) => r.key)).toEqual([String(outcome.id)])
    await settled()
    const kept = pendingRows().find((r) => r.store === 'outcomes')
    expect(JSON.parse(kept?.body as string)).toMatchObject({ offerId: id, outcome: 'done' })
  })

  it('what rides alongside stays open until it is answered: Done on the move never closes it, a later day never closes it, and the next check-in asks only it', async () => {
    const id = (await db.offers.add(offered())) as number
    await recordDoneNow((await db.offers.get(id)) as Offer, new Date(2026, 2, 12, 14, 40))
    // Still open after the move's Done, and still the question days later: nothing expires it.
    expect((await db.offers.get(id))?.closedAt).toBeNull()
    expect((await pendingOffers()).map((o) => o.id)).toEqual([id])
    const later = (await db.offers.add(offered({ day: '2026-03-15', block: 'morning', at: new Date(2026, 2, 15, 8, 0).toISOString(), passiveId: null }))) as number
    expect((await pendingOffers()).map((o) => o.id)).toEqual([id, later])
    // Answered at a check-in three days on: the same record completed, and the question closes.
    await recordOutcome((await db.offers.get(id)) as Offer, 'done', null, 'done', { day: '2026-03-15', block: 'morning' })
    const outcomes = await db.outcomes.where('offerId').equals(id).toArray()
    expect(outcomes).toHaveLength(1)
    expect(outcomes[0]).toMatchObject({ outcome: 'done', passiveOutcome: 'done' })
    expect((await pendingOffers()).map((o) => o.id)).toEqual([later])
  })

  it('answered from the card, the alongside item closes the question with the move’s own record', async () => {
    const id = (await db.offers.add(offered())) as number
    await recordDoneNow((await db.offers.get(id)) as Offer, new Date(2026, 2, 12, 14, 40))
    await answerPassive((await db.offers.get(id)) as Offer, 'done')
    expect((await db.outcomes.toArray()).map((x) => [x.offerId, x.outcome, x.passiveOutcome])).toEqual([[id, 'done', 'done']])
    expect(await pendingOffers()).toEqual([])
  })

  it('History and the day’s facts read the same records: a move answered Done shows done; one never answered stays, offered and unanswered', async () => {
    await ensureDayContext(DAY, await getSettings())
    const done = (await db.offers.add(offered())) as number
    await recordDoneNow((await db.offers.get(done)) as Offer, new Date(2026, 2, 12, 14, 40))
    const open = (await db.offers.add(offered({ block: 'morning', at: new Date(2026, 2, 12, 8, 0).toISOString(), moveId: NOTHING, passiveId: null, coinFlip: true }))) as number

    const history = await offerHistory('Nothing today')
    expect(history.map((h) => [h.offer.id, h.outcome?.outcome ?? null])).toEqual([
      [done, 'done'],
      [open, null],
    ])
    const sheet = await factSheet(DAY, new Date(2026, 2, 12, 20, 0))
    expect(factById(sheet, 'offers.7d')?.values).toMatchObject({ offered: 2, done: 1, unanswered: 1 })

    // Days on, the unanswered one is still in History, still unanswered: never removed, never closed by the clock.
    await db.offers.add(offered({ day: '2026-03-16', block: 'morning', at: new Date(2026, 2, 16, 8, 0).toISOString(), passiveId: null }))
    const after = await offerHistory('Nothing today')
    expect(after.find((h) => h.offer.id === open)?.outcome).toBeNull()
    expect((await db.offers.get(open))?.closedAt).toBeNull()
  })
})
