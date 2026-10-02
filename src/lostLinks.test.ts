import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { APP } from './cloudOutbox'
import { memoryStore, type CloudRow } from './cloudStore'
import { getMeta, REPAIR, resetCloudForTests, setStoreFactory, syncNow } from './cloudSync'
import { db, updateSettings, type Intention, type Offer, type Outcome } from './db'
import { unlinkLost } from './lostLinks'
import { offerHistory, pendingOffers } from './offerFlow'
import { memoryKeyValue, setTokenStorageForTests } from './tokenVault'

// Sync safety (2026-10-02): links a reused id bent, in a made-up record. Offer 15 is now a move of
// the afternoon of 2026-03-09, answered soon after (outcome 34); outcome 35, given on the evening of
// 2026-03-07, named the offer that held id 15 before. Offer 16 is a move of the evening of 2026-03-09
// that was never asked, and outcome 36, given on the morning of 2026-03-08, named the old 16. Plan 2,
// of 2026-03-07, was started by the old 14. Every value here is made up.

const offer = (id: number, day: string, block: Offer['block'], at: string, extra: Partial<Offer> = {}): Offer => ({ id, kind: 'block', day, block, at, situationKey: 's', target: 'mood', stance: '', band: '', reading: 50, moveId: 'nothing', cardId: null, candidates: [], coinFlip: false, passiveId: null, whyNot: null, skippedAt: null, closedAt: at, ...extra })
const outcome = (id: number, offerId: number, day: string, block: Outcome['block'], at: string): Outcome => ({ id, offerId, moveId: 'nothing', day, block, at, outcome: 'done', why: null, passiveOutcome: null })
const plan = (id: number, day: string, offerId: number | null): Intention => ({ id, aimId: 1, day, cue: 'afterBreakfast' as Intention['cue'], time: '08:00', setAt: `${day}T08:00:00.000Z`, offerId })

const OFFERS = [
  offer(14, '2026-03-09', 'afternoon', '2026-03-09T18:10:00.000Z'),
  offer(15, '2026-03-09', 'afternoon', '2026-03-09T18:10:30.000Z'),
  offer(16, '2026-03-09', 'evening', '2026-03-10T00:30:00.000Z', { closedAt: null }),
  offer(17, '2026-03-08', 'morning', '2026-03-08T12:40:00.000Z'),
  // A session recorded with Did it already: offered and answered at the same moment.
  offer(20, '2026-03-10', 'afternoon', '2026-03-10T18:30:00.000Z', { kind: 'step', logged: true }),
  offer(4, '2026-03-04', 'afternoon', '2026-03-04T15:00:00.000Z'),
]
const OUTCOMES = [
  outcome(34, 15, '2026-03-09', 'afternoon', '2026-03-09T18:11:00.000Z'),
  outcome(35, 15, '2026-03-07', 'evening', '2026-03-08T01:05:00.000Z'),
  outcome(36, 16, '2026-03-08', 'morning', '2026-03-08T12:35:00.000Z'),
  // Answered two days late, as the app asks after a gap: a true link.
  outcome(37, 17, '2026-03-10', 'afternoon', '2026-03-10T16:20:00.000Z'),
  outcome(38, 20, '2026-03-10', 'afternoon', '2026-03-10T18:30:00.000Z'),
]
const PLANS = [plan(2, '2026-03-07', 14), plan(1, '2026-03-04', 4), plan(3, '2026-03-11', null)]

beforeEach(async () => {
  setTokenStorageForTests(memoryKeyValue())
  await db.delete()
  await db.open()
  resetCloudForTests()
})

afterEach(() => {
  setStoreFactory(null)
  setTokenStorageForTests(null)
})

describe('links a reused id bent', () => {
  it('takes back an answer given before the offer under its id, and a plan started by an offer of another day; nothing else changes', async () => {
    await db.offers.bulkAdd(OFFERS)
    await db.outcomes.bulkAdd(OUTCOMES)
    await db.intentions.bulkAdd(PLANS)
    const before = { offers: await db.offers.toArray(), outcomes: await db.outcomes.toArray() }
    await db.outbox.clear()

    expect(await unlinkLost()).toEqual({ outcomes: [35, 36], intentions: [2] })
    expect(await db.outcomes.get(35)).toEqual({ ...OUTCOMES[1], offerId: -15, lostOfferId: 15 })
    expect((await db.outcomes.get(36))?.offerId).toBe(-16)
    expect(await db.intentions.get(2)).toEqual({ ...PLANS[0], offerId: -14, lostOfferId: 14 })
    // The true links stand: the late answer, the session answered as it was offered, the plan of its own day.
    expect((await db.outcomes.bulkGet([34, 37, 38])).map((x) => x?.offerId)).toEqual([15, 17, 20])
    expect((await db.intentions.get(1))?.offerId).toBe(4)
    expect(await db.offers.toArray()).toEqual(before.offers)
    expect(await db.outcomes.count()).toBe(before.outcomes.length)

    // History shows each move with its own answer; the move never asked is asked at the next check-in, as designed.
    const history = await offerHistory('Nothing')
    expect(history.find((h) => h.offer.id === 15)?.outcome?.id).toBe(34)
    expect(history.find((h) => h.offer.id === 16)?.outcome).toBeNull()
    expect((await pendingOffers()).map((o) => o.id)).toEqual([16])

    // The change syncs like any change.
    expect((await db.outbox.toArray()).map((r) => `${r.store}:${r.key}`).sort()).toEqual(['intentions:2', 'outcomes:35', 'outcomes:36'])

    // A second run finds nothing to take back.
    expect(await unlinkLost()).toEqual({ outcomes: [], intentions: [] })
  })

  it('a phone restoring such a cloud takes the links back once, and the cloud then holds them taken back', async () => {
    const store = memoryStore()
    const at = '2026-03-11T00:00:00.000Z'
    const rows = (name: string, list: { id?: number; day?: string }[]): CloudRow[] => list.map((b, i) => ({ app: APP, store: name, id: String(b.id), day: b.day ?? null, body: JSON.stringify(b), updated_at: at, deleted: 0, device_id: 'phone', synced_at: `2026-03-11T00:0${name.length - 6}:${String(i).padStart(2, '0')}.000Z` }))
    await store.upsert([...rows('offers', OFFERS), ...rows('outcomes', OUTCOMES), ...rows('intentions', PLANS)])
    setStoreFactory(async () => store)
    await updateSettings((s) => ({ ...s, cloud: { ...s.cloud, token: 'test-token-never-real' } }))

    expect(await syncNow()).toBe('done')
    expect((await getMeta()).relinked).toBe(REPAIR)
    const cloud = (name: string, id: string) => JSON.parse([...store.rows.values()].find((r) => r.app === APP && r.store === name && r.id === id)?.body as string) as Record<string, unknown>
    expect(cloud('outcomes', '35')).toMatchObject({ offerId: -15, lostOfferId: 15, at: '2026-03-08T01:05:00.000Z' })
    expect(cloud('outcomes', '36')).toMatchObject({ offerId: -16, lostOfferId: 16 })
    expect(cloud('intentions', '2')).toMatchObject({ offerId: -14, lostOfferId: 14 })
    expect(cloud('outcomes', '34')).toMatchObject({ offerId: 15 })

    // Syncing again, and restoring all of it again from the start, changes nothing.
    const snapshot = () => JSON.stringify([...store.rows.values()].filter((r) => r.app === APP && r.store !== 'settings').map((r) => [r.store, r.id, r.body]).sort())
    const once = snapshot()
    expect(await syncNow()).toBe('done')
    await db.delete()
    await db.open()
    resetCloudForTests()
    await updateSettings((s) => ({ ...s, cloud: { ...s.cloud, token: 'test-token-never-real' } }))
    expect(await syncNow()).toBe('done')
    expect(snapshot()).toBe(once)
    expect((await db.outcomes.toArray()).filter((x) => x.lostOfferId !== undefined).map((x) => x.id)).toEqual([35, 36])
  })
})
