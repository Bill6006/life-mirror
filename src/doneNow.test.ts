import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { moves } from './catalogue'
import { db, type Offer } from './db'
import { answerPassive, doneAvailableAt, doneOpen, pendingOffers, recordDoneNow, recordOutcome } from './offerFlow'
import { NOTHING } from './offers'
import { RUNG_MINUTES } from './ladder'

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

  it('writes the outcome as its own record with its own timestamp, closes the question when nothing is left to ask, and the next check-in does not ask', async () => {
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
    expect(await db.offers.get(id)).toEqual({ ...before, closedAt: tapped.toISOString() })

    // The next check-in asks only about what was not logged.
    const other = await db.offers.add({ ...offer(), at: new Date(2026, 8, 11, 20, 30).toISOString() })
    const pending = await pendingOffers()
    expect(pending.map((p) => p.id)).toEqual([other])
  })
})

describe('the Done tap, widened', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('opens after the span when the move takes longer than the sitting, and after a rung’s minutes for a step of the ladder', () => {
    const windows = moves.find((m) => m.id === 'open-windows')
    expect(windows?.minutes).toBe(1)
    expect(doneAvailableAt(offer('open-windows'))).toBe(AT.getTime() + 10 * 60_000)
    expect(doneAvailableAt({ ...offer(), moveId: 'rung:3:2' })).toBe(AT.getTime() + RUNG_MINUTES[2] * 60_000)
  })

  it('keeps the offer open for the passive item alone, asks only that next time, and closes it once answered', async () => {
    const id = await db.offers.add({ ...offer(), passiveId: 'caffeine-cutoff' })
    const o = (await db.offers.get(id)) as Offer
    await recordDoneNow(o, new Date(2026, 8, 11, 20, 40))
    expect((await db.offers.get(id))?.closedAt).toBeNull()
    expect((await pendingOffers()).map((p) => p.id)).toEqual([id])
    // The check-in's answer completes the same record rather than adding another.
    await recordOutcome(o, 'done', null, 'no', { day: '2026-09-12', block: 'morning' })
    const outcomes = await db.outcomes.toArray()
    expect(outcomes).toHaveLength(1)
    expect(outcomes[0]).toMatchObject({ outcome: 'done', passiveOutcome: 'no' })
    expect((await db.offers.get(id))?.closedAt).not.toBeNull()
    expect(await pendingOffers()).toEqual([])
  })

  it('takes the passive answer on the card too, and closes the question with it', async () => {
    const id = await db.offers.add({ ...offer(), passiveId: 'caffeine-cutoff' })
    const o = (await db.offers.get(id)) as Offer
    await recordDoneNow(o, new Date(2026, 8, 11, 20, 40))
    await answerPassive(o, 'done')
    expect((await db.outcomes.toArray())[0].passiveOutcome).toBe('done')
    expect((await db.offers.get(id))?.closedAt).not.toBeNull()
    expect(await pendingOffers()).toEqual([])
  })

  it('on a rung’s step, moves the skill up as the check-in would', async () => {
    await db.skills.add({ name: 'one', order: 1, createdAt: '', archivedAt: null })
    const id = await db.offers.add({ ...offer('rung:1:1'), kind: 'step', situationKey: 'aim:certification', target: 'focus', label: 'one · step' })
    const o = (await db.offers.get(id)) as Offer
    await recordDoneNow(o, new Date(2026, 8, 11, 21, 0))
    const marks = await db.rungMarks.toArray()
    expect(marks).toHaveLength(1)
    expect(marks[0]).toMatchObject({ skillId: 1, rung: 1, via: 'step' })
    expect((await db.offers.get(id))?.closedAt).not.toBeNull()
  })
})
