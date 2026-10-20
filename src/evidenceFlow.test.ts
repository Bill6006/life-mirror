import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, type CheckIn, type Offer } from './db'
import { bigSocialToday, evidence, movesTried } from './evidenceFlow'
import { NOTHING } from './offers'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'

// The record on the phone: Evidence counts the null offer, and a big social day is known only from that day's own mark,
// so the recovery gap never states its premise on another day (the final checklist).

const allAt = (ids: readonly ReadingId[], p: Position): Answers => Object.fromEntries(ids.map((id) => [id, p]))
const ci = (day: string, block: CheckIn['block'], p: Position, over: Partial<Answers> = {}): CheckIn => ({ day, block, answers: { ...allAt(blockReadings(block), p), ...over }, startedAt: '', completedAt: 'x', updatedAt: '', activeMs: 30_000 })

describe('the null offer and the big social day', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('counts the null offer kept to on the Evidence screen', async () => {
    // Three earlier mornings at the middle, so the morning forecast for mood is 3; kept to on the 10th, the morning after reads 4.
    await db.checkins.bulkAdd([ci('2026-09-07', 'morning', 3), ci('2026-09-08', 'morning', 3), ci('2026-09-09', 'morning', 3), ci('2026-09-11', 'morning', 3, { mood: 4 })])
    const offer: Offer = { kind: 'block', day: '2026-09-10', block: 'evening', at: '2026-09-10T20:00:00.000Z', situationKey: 'evening:mood', target: 'mood', stance: '', band: 'gettingBy', reading: 50, moveId: NOTHING, cardId: null, candidates: [NOTHING], coinFlip: true, passiveId: null, whyNot: null, skippedAt: null, closedAt: null }
    const id = await db.offers.add(offer)
    await db.outcomes.add({ offerId: id, moveId: NOTHING, day: '2026-09-11', block: 'morning', at: '', outcome: 'done', why: null, passiveOutcome: null })
    const ev = await evidence('2026-09-11')
    expect(ev.nothing).toEqual({ offered: 1, done: 1, skipped: 0 })
  })

  it('knows a big social day only from that day’s own mark: never the day after, and never a church day by itself (the final checklist)', async () => {
    expect(await bigSocialToday('2026-09-12')).toBe(false)
    // A church day is asked about at the evening's chips, never taken for a big social day.
    await db.days.put({ day: '2026-09-11', weekday: 5, withHer: true, studyNight: false, churchDay: true, pickupTime: null, soloUntil: '20:00', changed: false, createdAt: '' })
    expect(await bigSocialToday('2026-09-11')).toBe(false)
    expect(await bigSocialToday('2026-09-12')).toBe(false)
    // Marked on the 13th: that day is one; the day after is not.
    await db.checkins.add({ ...ci('2026-09-13', 'evening', 3), extras: { bigSocial: true } })
    expect(await bigSocialToday('2026-09-13')).toBe(true)
    expect(await bigSocialToday('2026-09-14')).toBe(false)
  })
})

describe('Now’s “how much it knows” line, counted from the record (stage 1, item p)', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('counts the moves done or partly done at least once, never Nothing extra or a No', async () => {
    expect(await movesTried()).toBe(0)
    const out = (offerId: number, moveId: string, outcome: 'done' | 'partly' | 'no') => db.outcomes.add({ offerId, moveId, day: '2026-09-10', block: 'afternoon', at: '2026-09-10T18:00:00.000Z', outcome, why: null, passiveOutcome: null })
    await out(1, 'walk-ten', 'done')
    await out(2, 'walk-ten', 'partly')
    await out(3, 'green-walk', 'partly')
    await out(4, 'dim-lights-hour', 'no')
    await out(5, NOTHING, 'done')
    expect(await movesTried()).toBe(2)
  })
})
