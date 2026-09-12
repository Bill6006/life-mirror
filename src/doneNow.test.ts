import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { moves } from './catalogue'
import { db, type Offer } from './db'
import { doneAvailableAt, doneOpen, pendingOffers, recordDoneNow } from './offerFlow'
import { NOTHING } from './offers'

// The Done tap on the card: the outcome as its own record with its own timestamp, the offer
// untouched, and the next check-in's question asked only when nothing was logged.

const move = moves.find((m) => m.minutes === 5) ?? moves[0]
const AT = new Date(2026, 8, 11, 20, 29)

function offer(moveId = move.id): Offer {
  return { kind: 'block', day: '2026-09-11', block: 'evening', at: AT.toISOString(), situationKey: 'evening:energy', target: 'energy', stance: 'Stabilize', band: 'gettingBy', reading: 50, moveId, cardId: null, candidates: [moveId], coinFlip: false, passiveId: null, whyNot: null, skippedAt: null, closedAt: null }
}

describe('the Done tap', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('opens once the move’s stated minutes have passed, and never for the null offer', () => {
    expect(doneAvailableAt(offer())).toBe(AT.getTime() + move.minutes * 60_000)
    expect(doneAvailableAt(offer(NOTHING))).toBeNull()
  })

  it('closes with its block: shut before the minutes have passed, open after them for the rest of the block, shut once the block is over', async () => {
    const o = { ...offer(), id: 1 }
    expect(doneOpen(o, new Date(2026, 8, 11, 20, 30))).toBe(false)
    expect(doneOpen(o, new Date(2026, 8, 11, 20, 40))).toBe(true)
    // The evening runs until four in the morning.
    expect(doneOpen(o, new Date(2026, 8, 12, 1, 30))).toBe(true)
    expect(doneOpen(o, new Date(2026, 8, 12, 8, 0))).toBe(false)
    const id = await db.offers.add(offer())
    await recordDoneNow({ ...offer(), id }, new Date(2026, 8, 12, 8, 0))
    expect(await db.outcomes.count()).toBe(0)
  })

  it('writes the outcome as its own record with its own timestamp, touches nothing on the offer, and answers the next check-in’s question', async () => {
    const id = await db.offers.add(offer())
    const before = await db.offers.get(id)
    const o = { ...(before as Offer) }
    const tapped = new Date(2026, 8, 11, 20, 40)
    await recordDoneNow(o, tapped)
    // Tapping twice writes nothing more.
    await recordDoneNow(o, new Date(2026, 8, 11, 20, 41))

    const outcomes = await db.outcomes.toArray()
    expect(outcomes).toHaveLength(1)
    expect(outcomes[0]).toMatchObject({ offerId: id, moveId: move.id, outcome: 'done', why: null, passiveOutcome: null, day: '2026-09-11', block: 'evening', at: tapped.toISOString() })
    expect(await db.offers.get(id)).toEqual(before)

    // The next check-in asks only about what was not logged.
    const other = await db.offers.add({ ...offer(), at: new Date(2026, 8, 11, 20, 30).toISOString() })
    const pending = await pendingOffers()
    expect(pending.map((p) => p.id)).toEqual([other])
  })
})
