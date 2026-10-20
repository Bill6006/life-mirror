import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { factSheet } from './brainFlow'
import { db, ensureDayContext, getSettings, saveAnswer, setDayContext, type Offer } from './db'
import { evidence } from './evidenceFlow'
import { deferOutcome, ensureOffer, recordDoneNow, recordOutcome, redrawForDay, skipOffer } from './offerFlow'
import { NOTHING } from './offers'
import { blockReadings } from './readings'
import { usageFacts } from './usageFacts'

// Stage 3, item 5, part 1: when a Today, if different chip changes the day after this block's move was
// drawn, and nobody has touched the move, it is set aside, marked "the day changed", and drawn again under
// the day as it now is. The app's change, never your skip: no count of skips or offers shows it.

const DAY = '2026-09-18'
const AFTERNOON = new Date(2026, 8, 18, 14, 0)
const asked = blockReadings('afternoon')
const rng = () => 0.3

async function drawn(): Promise<Offer> {
  for (const id of asked) await saveAnswer({ day: DAY, block: 'afternoon' }, asked, id, 3, 500)
  return (await ensureOffer(DAY, 'afternoon', rng)) as Offer
}

/** An offer as the store keeps it. */
const row = (over: Partial<Offer>): Offer => ({ kind: 'block', day: DAY, block: 'afternoon', at: `${DAY}T15:00:00.000Z`, situationKey: 'afternoon:mood', target: 'mood', stance: '', band: 'gettingBy', reading: 50, moveId: 'nap-ten', cardId: null, candidates: ['nap-ten'], coinFlip: false, passiveId: null, whyNot: null, skippedAt: null, closedAt: null, ...over })

describe('a move drawn again when the day changes under it (stage 3, item 5)', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await ensureDayContext(DAY, await getSettings())
  })

  it('sets an untouched move aside, marked the day changed, and draws again under the day as it now is', async () => {
    const first = await drawn()
    await setDayContext(DAY, { atOffice: true })
    const next = (await redrawForDay(DAY, 'afternoon', AFTERNOON, rng)) as Offer
    expect(next.id).not.toBe(first.id)
    expect((await db.offers.get(next.id as number))?.redrawn).toBe(true)
    const old = await db.offers.get(first.id as number)
    expect(old?.skipReason).toBe('dayChanged')
    expect(old?.skippedAt).not.toBeNull()
    expect(await db.outcomes.count()).toBe(0)
    // No skip of yours: the new draw may still be Nothing extra, which a skip's replacement may not.
    expect(next.candidates).toContain(NOTHING)
  })

  it('leaves a move alone once it is answered', async () => {
    const first = await drawn()
    await recordOutcome(first, 'done', null, null, { day: DAY, block: 'afternoon' })
    expect(await redrawForDay(DAY, 'afternoon', AFTERNOON, rng)).toBeNull()
    expect((await db.offers.get(first.id as number))?.skippedAt).toBeNull()
  })

  it('leaves a move alone once it is done, while the item riding alongside is still to answer and the move stays open', async () => {
    const first = await drawn()
    await db.offers.update(first.id as number, { passiveId: 'phone-out-of-bedroom', at: AFTERNOON.toISOString() })
    const withItem = (await db.offers.get(first.id as number)) as Offer
    const later = new Date(AFTERNOON.getTime() + 60 * 60_000)
    expect(await recordDoneNow(withItem, later)).toBe(true)
    // The move stays open for that one question, its answer already written.
    expect((await db.offers.get(first.id as number))?.closedAt).toBeNull()
    expect(await redrawForDay(DAY, 'afternoon', later, rng)).toBeNull()
    expect((await db.offers.get(first.id as number))?.skippedAt).toBeNull()
  })

  it('leaves a move alone once it is put off, and after its block has passed', async () => {
    const first = await drawn()
    expect(await redrawForDay(DAY, 'afternoon', new Date(2026, 8, 18, 18, 0), rng)).toBeNull()
    await deferOutcome(first)
    expect(await redrawForDay(DAY, 'afternoon', AFTERNOON, rng)).toBeNull()
    expect((await db.offers.get(first.id as number))?.skippedAt).toBeNull()
  })

  it('keeps a skip of yours a skip, and draws again only the move that replaced it, still among real moves', async () => {
    const first = await drawn()
    const replacement = (await skipOffer(first)) as Offer
    const next = (await redrawForDay(DAY, 'afternoon', AFTERNOON, rng)) as Offer
    expect((await db.offers.get(first.id as number))?.skipReason).toBeUndefined()
    expect((await db.offers.get(replacement.id as number))?.skipReason).toBe('dayChanged')
    expect(next.candidates).not.toContain(NOTHING)
  })

  it('is not among the week’s offers, nor its skips', async () => {
    await drawn()
    await setDayContext(DAY, { atOffice: true })
    await redrawForDay(DAY, 'afternoon', AFTERNOON, rng)
    const sheet = await factSheet(DAY, AFTERNOON)
    expect(sheet.facts.find((f) => f.id === 'offers.7d')?.values).toMatchObject({ offered: 1, skipped: 0 })
  })

  it('is not among Nothing extra’s counts', async () => {
    await db.offers.add(row({ moveId: NOTHING, candidates: [NOTHING], skippedAt: `${DAY}T15:05:00.000Z`, skipReason: 'dayChanged' }))
    expect((await evidence(DAY)).nothing).toEqual({ offered: 0, done: 0, skipped: 0 })
  })

  it('is no suggestion you skipped again and again', () => {
    const offers = Array.from({ length: 4 }, (_, k) => row({ id: k + 1, day: '2026-10-10', at: '2026-10-10T15:00:00.000Z', skippedAt: '2026-10-10T15:05:00.000Z', skipReason: 'dayChanged' }))
    const input = { rows: [], briefs: [], log: [], picks: [], offers, outcomes: [], intentions: [], aims: [] }
    expect(usageFacts(input, '2026-10-20').find((f) => f.id === 'usage.skips')).toBeUndefined()
    // The same four skipped by you are named: the probe that could have said yes.
    expect(usageFacts({ ...input, offers: offers.map((o) => ({ ...o, skipReason: undefined })) }, '2026-10-20').find((f) => f.id === 'usage.skips')).toBeDefined()
  })
})
