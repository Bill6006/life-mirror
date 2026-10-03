import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APP } from './cloudOutbox'
import { memoryStore, type CloudRow, type CloudStore, type MemoryStore } from './cloudStore'
import { BRAIN_APP, getMeta, REPAIR, requestPersistence, resetCloudForTests, restartPull, setOnlineCheck, setStoreFactory, storagePersisted, syncNow } from './cloudSync'
import { db, saveAnswer, updateSettings } from './db'
import type { Block } from './blocks'
import { blockReadings, type Position } from './readings'
import { memoryKeyValue, raiseFloors, readFloors, setTokenStorageForTests, type KeyValue } from './tokenVault'
import { BASE_FLOOR, IN_STEP_KEY, markInStep } from './freshIds'

// Sync safety (2026-10-02). What a phone's browser can do, each part played out here: it clears the
// database while what is kept beside it (the token's second copy, and now the id floors) stays. A cleared phone must never hand out an id the cloud holds, a
// record held twice must be made one again rather than refused, and restoring twice must change nothing.
// Every token here is made up and never reaches a network.

const TOKEN = 'test-token-never-real'
let kv: KeyValue

/** The phone's browser clears the database. What is kept beside it stays. */
async function clearDatabase(): Promise<void> {
  await db.delete()
  await db.open()
  resetCloudForTests()
}

async function checkIn(day: string, block: Block, value: Position): Promise<void> {
  const asked = blockReadings(block)
  for (const id of asked) await saveAnswer({ day, block }, asked, id, value, 500)
}

async function connect(store: CloudStore): Promise<void> {
  setStoreFactory(async () => store)
  await updateSettings((s) => ({ ...s, cloud: { ...s.cloud, token: TOKEN } }))
}

const live = (store: MemoryStore, name: string): CloudRow[] => [...store.rows.values()].filter((r) => r.app === APP && r.store === name && !r.deleted)
const slot = (r: CloudRow): string => {
  const b = JSON.parse(r.body as string) as { day: string; block: string }
  return `${r.id}:${b.day}|${b.block}`
}

const FORECAST = { day: '2026-03-09', block: 'morning' as Block, horizon: 1, madeOn: '2026-03-08', model: 'sameBlock', point: 60, lo: 40, hi: 80, whatIf: null }

beforeEach(async () => {
  kv = memoryKeyValue()
  setTokenStorageForTests(kv)
  // A phone that has read the cloud before: what is kept beside the token says so (a new install is its own case, freshIds.test.ts).
  markInStep()
  await clearDatabase()
})

afterEach(() => {
  setStoreFactory(null)
  setOnlineCheck(null)
  setTokenStorageForTests(null)
})

describe('sync safety after the phone clears the database', () => {
  it('a cleared phone never hands out an id the cloud holds, so no earlier record is written over', async () => {
    const store = memoryStore()
    await connect(store)
    await checkIn('2026-03-07', 'morning', 3)
    await checkIn('2026-03-07', 'afternoon', 3)
    expect(await syncNow()).toBe('done')
    expect(readFloors().checkins).toBe(2)
    const before = live(store, 'checkins').map(slot)

    await clearDatabase()
    setStoreFactory(async () => store)
    // Before anything comes back, the evening is entered on the cleared phone: it takes an id past the floor.
    await checkIn('2026-03-08', 'evening', 4)
    expect((await db.checkins.toArray()).map((c) => c.id)).toEqual([4])
    expect(await syncNow()).toBe('done')
    // The cloud keeps both earlier check-ins whole and holds the new one under its own id; the phone has all three.
    expect(live(store, 'checkins').map(slot).sort()).toEqual([...before, '4:2026-03-08|evening'].sort())
    expect((await db.checkins.toArray()).map((c) => c.id).sort()).toEqual([1, 2, 4])
  })

  it('a phone that only restored keeps the floors of what came back, so a second clearing reuses nothing either', async () => {
    const store = memoryStore()
    await connect(store)
    await checkIn('2026-03-05', 'morning', 3)
    await checkIn('2026-03-05', 'evening', 3)
    expect(await syncNow()).toBe('done')
    // Another phone: a new store of floors, the same cloud. It restores everything and creates nothing.
    kv = memoryKeyValue()
    setTokenStorageForTests(kv)
    markInStep()
    await clearDatabase()
    await connect(store)
    expect(await syncNow()).toBe('done')
    expect(readFloors().checkins).toBe(2)
    // Cleared again: the next check-in still takes an id past what the cloud holds.
    await clearDatabase()
    setStoreFactory(async () => store)
    await checkIn('2026-03-11', 'evening', 4)
    expect((await db.checkins.toArray()).map((c) => c.id)).toEqual([4])
    expect(await syncNow()).toBe('done')
    expect(live(store, 'checkins').map(slot).sort()).toEqual(['1:2026-03-05|morning', '2:2026-03-05|evening', '4:2026-03-11|evening'])
  })

  it('a forecast derived again before the original is back is made one again: no refusal, the original kept, nothing queued for the copy', async () => {
    const store = memoryStore()
    await connect(store)
    await db.forecasts.add({ ...FORECAST })
    expect(await syncNow()).toBe('done')

    await clearDatabase()
    setStoreFactory(async () => store)
    await db.forecasts.add({ ...FORECAST, point: 55 })
    await syncNow()
    // Without the merge this is the refusal: Unable to add key to index '[day+block+horizon]'.
    expect((await getMeta()).lastError).toBeNull()
    const rows = await db.forecasts.where('[day+block+horizon]').equals(['2026-03-09', 'morning', 1]).toArray()
    expect(rows.map((r) => [r.id, r.point])).toEqual([[1, 60]])
    expect((await db.outbox.toArray()).filter((r) => r.store === 'forecasts')).toEqual([])
    expect(live(store, 'forecasts').map((r) => r.id)).toEqual(['1'])
    expect((await getMeta()).merged).toBe(1)

    // The whole history walked again changes nothing.
    await restartPull()
    expect(await syncNow()).toBe('done')
    expect(await db.forecasts.count()).toBe(1)
    expect((await getMeta()).merged).toBe(1)
  })

  it('a check-in held twice keeps the latest, keeps the earlier whole in the cloud aside, and leaves one per slot', async () => {
    const store = memoryStore()
    await connect(store)
    await checkIn('2026-03-08', 'morning', 2)
    expect(await syncNow()).toBe('done')

    await clearDatabase()
    setStoreFactory(async () => store)
    await new Promise((r) => setTimeout(r, 5))
    // The morning is entered again on the cleared phone before the cloud's is back.
    await checkIn('2026-03-08', 'morning', 4)
    expect(await syncNow()).toBe('done')
    const mine = await db.checkins.where('[day+block]').equals(['2026-03-08', 'morning']).toArray()
    expect(mine).toHaveLength(1)
    expect(Object.values(mine[0].answers).every((v) => v === 4)).toBe(true)
    // One live check-in for the slot in the cloud; the earlier tombstoned, and kept whole where nothing reads it.
    expect(live(store, 'checkins').map((r) => r.id)).toEqual([String(mine[0].id)])
    const aside = [...store.rows.values()].find((r) => r.app === APP && r.store === 'superseded' && r.id === 'checkins:1')
    expect(aside).toBeTruthy()
    const kept = JSON.parse(aside?.body as string) as { store: string; id: string; body: { answers: Record<string, number> } }
    expect(kept.store).toBe('checkins')
    expect(Object.values(kept.body.answers).every((v) => v === 2)).toBe(true)

    // Again, from the start: nothing changes, and nothing comes back twice.
    await restartPull()
    expect(await syncNow()).toBe('done')
    expect(await db.checkins.count()).toBe(1)
    expect(live(store, 'checkins')).toHaveLength(1)
  })

  it('the Worker’s lines come back even while the phone’s own rows cannot, and nothing is pushed over a cloud the phone could not read', async () => {
    const store = memoryStore()
    await store.upsert([
      { app: BRAIN_APP, store: 'briefs', id: '2026-03-09:brief', day: null, body: JSON.stringify({ day: '2026-03-09', kind: 'brief', text: 'One line.', mode: 'observation', factIds: ['record'], cardIds: [], model: 'm', at: '2026-03-09T09:15:00.000Z' }), updated_at: '2026-03-09T09:15:01.000Z', deleted: 0, device_id: 'worker', synced_at: '2026-03-09T09:15:01.000Z' },
    ])
    const refusing: CloudStore = {
      ...store,
      pull: (app, after, limit) => (app === APP ? Promise.reject(new Error('Unable to add key to index')) : store.pull(app, after, limit)),
    }
    await connect(refusing)
    await checkIn('2026-03-09', 'morning', 3)
    expect(await syncNow()).toBe('failed')
    expect((await db.brainBriefs.toArray()).map((r) => r.id)).toEqual(['2026-03-09:brief'])
    expect(live(store, 'checkins')).toEqual([])
    expect(await db.outbox.count()).toBeGreaterThan(0)
    // Nor are links taken back over a history only partly restored.
    expect((await getMeta()).relinked).toBeUndefined()
  })

  it('restoring the token twice and walking the whole history twice changes nothing', async () => {
    const store = memoryStore()
    await connect(store)
    await checkIn('2026-03-06', 'morning', 3)
    await checkIn('2026-03-06', 'evening', 4)
    await db.forecasts.add({ ...FORECAST })
    expect(await syncNow()).toBe('done')
    const cloud = () => [...store.rows.values()].filter((r) => r.app === APP && r.store !== 'settings').map((r) => `${r.store}:${r.id}:${r.deleted}:${r.body}`).sort()
    const before = cloud()

    await clearDatabase()
    setStoreFactory(async () => store)
    expect(await syncNow()).toBe('done')
    const local = async () => ({ checkins: (await db.checkins.toArray()).map((c) => `${c.id}:${c.day}|${c.block}`).sort(), forecasts: (await db.forecasts.toArray()).map((f) => `${f.id}:${f.day}|${f.block}|${f.horizon}`).sort() })
    const once = await local()
    expect(once.checkins).toEqual(['1:2026-03-06|morning', '2:2026-03-06|evening'])

    // The database copy of the token goes again: back from the phone's copy a second time, and the history walked again.
    await updateSettings((s) => ({ ...s, cloud: { ...s.cloud, token: null } }))
    expect(await syncNow()).toBe('done')
    await restartPull()
    expect(await syncNow()).toBe('done')
    expect(await local()).toEqual(once)
    expect(cloud()).toEqual(before)
  })

  it('walks the whole history once under the safe merge when this version first syncs', async () => {
    const store = memoryStore()
    await connect(store)
    expect((await getMeta()).repair).toBeUndefined()
    expect(await syncNow()).toBe('done')
    expect((await getMeta()).repair).toBe(REPAIR)
  })

  it('a forecast derived on a phone that lost its floors as well never displaces the cloud’s original', async () => {
    const store = memoryStore()
    // The cloud holds the original under id 7; the phone, cleared of everything (its mark of having read the cloud too), derives the same slot again, past the fresh base.
    kv.removeItem(IN_STEP_KEY)
    await store.upsert([{ app: APP, store: 'forecasts', id: '7', day: FORECAST.day, body: JSON.stringify({ ...FORECAST, id: 7 }), updated_at: '2026-03-08T09:00:00.000Z', deleted: 0, device_id: 'phone', synced_at: '2026-03-08T09:00:01.000Z' }])
    await connect(store)
    await db.forecasts.add({ ...FORECAST, point: 55 })
    expect((await db.forecasts.toArray()).every((f) => (f.id as number) > BASE_FLOOR)).toBe(true)
    expect(await syncNow()).toBe('done')
    expect((await db.forecasts.toArray()).map((f) => [f.id, f.point])).toEqual([[7, 60]])
    expect([...store.rows.values()].filter((r) => r.app === APP && r.store === 'forecasts').map((r) => [r.id, r.deleted])).toEqual([['7', 0]])
  })

  it('a check-in the cloud holds newer than the phone’s copy wins, and the phone’s copy is kept aside rather than lost', async () => {
    const store = memoryStore()
    await connect(store)
    await checkIn('2026-03-08', 'afternoon', 2)
    const mine = (await db.checkins.toArray())[0]
    // The cloud's copy of the same slot, under another id and saved later.
    const later = { ...mine, id: 9, answers: Object.fromEntries(Object.keys(mine.answers).map((k) => [k, 5])), updatedAt: '2999-01-01T00:00:00.000Z' }
    await store.upsert([{ app: APP, store: 'checkins', id: '9', day: later.day, body: JSON.stringify(later), updated_at: later.updatedAt, deleted: 0, device_id: 'phone', synced_at: '2026-03-08T19:00:00.000Z' }])
    expect(await syncNow()).toBe('done')
    const now = await db.checkins.toArray()
    expect(now.map((c) => c.id)).toEqual([9])
    expect(Object.values(now[0].answers).every((v) => v === 5)).toBe(true)
    const aside = [...store.rows.values()].find((r) => r.app === APP && r.store === 'superseded' && r.id === `checkins:${mine.id}`)
    expect(JSON.parse(aside?.body as string).body.answers).toEqual(mine.answers)
    // The phone's copy never reached the cloud as a check-in, so nothing stands there for it.
    expect(live(store, 'checkins').map((r) => r.id)).toEqual(['9'])
  })

  it('asks the browser to keep the storage, asks only once it is not already kept, and says so when it cannot tell', async () => {
    let asked = 0
    const storage = (kept: boolean, grant: boolean) => ({ persisted: async () => kept, persist: async () => (asked++, grant) })
    vi.stubGlobal('navigator', { storage: storage(false, true) })
    expect(await requestPersistence()).toBe(true)
    expect(asked).toBe(1)
    vi.stubGlobal('navigator', { storage: storage(true, true) })
    expect(await requestPersistence()).toBe(true)
    expect(asked).toBe(1)
    vi.stubGlobal('navigator', { storage: storage(false, false) })
    expect(await requestPersistence()).toBe(false)
    vi.stubGlobal('navigator', {})
    expect(await requestPersistence()).toBeNull()
    expect(storagePersisted()).toBeNull()
    vi.unstubAllGlobals()
  })

  it('the floors only rise, and raising a counter leaves no record behind and queues nothing', async () => {
    raiseFloors({ checkins: 5 })
    raiseFloors({ checkins: 3, offers: 2 })
    expect(readFloors()).toEqual({ checkins: 5, offers: 2 })
    await clearDatabase()
    expect(await db.checkins.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
    await checkIn('2026-03-10', 'morning', 3)
    expect((await db.checkins.toArray()).map((c) => c.id)).toEqual([7])
  })
})

describe('the floors never stand in the way', () => {
  it('a counter that cannot be raised (a full disk) never keeps the database from opening', async () => {
    raiseFloors({ checkins: 5 })
    // Every table is rebuilt when the database opens again, so the refusal goes on what they all share.
    const proto = db.Table.prototype as { add: (...a: unknown[]) => Promise<unknown> }
    const add = vi.spyOn(proto, 'add').mockRejectedValue(new Error('QuotaExceededError'))
    await expect(clearDatabase()).resolves.toBeUndefined()
    expect(add).toHaveBeenCalled()
    add.mockRestore()
    expect(db.isOpen()).toBe(true)
    expect(await db.checkins.count()).toBe(0)
  })

  it('a floor past any real count is ignored rather than using up the ids', async () => {
    kv.setItem('lm.idFloors', JSON.stringify({ checkins: 2 ** 53, offers: 'x', outcomes: 4 }))
    expect(readFloors()).toEqual({ outcomes: 4 })
    raiseFloors({ checkins: 2 ** 40 })
    expect(readFloors().checkins).toBeUndefined()
  })
})
