import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setBrainSwitch, setWriterModel } from './brainPrefs'
import { APP, SYNCED_STORES } from './cloudOutbox'
import { memoryStore, type CloudRow, type MemoryStore } from './cloudStore'
import { deleteCloudCopy, keyFor, resetCloudForTests, setOnlineCheck, setStoreFactory, syncNow } from './cloudSync'
import { forgetKeptPatterns } from './counted/table'
import { checkin, context, day } from './counted/testing'
import { PATTERNS_ID, readPatterns } from './counted/stored'
import { db, updateSettings, wipeEverything } from './db'
import { writePatternsRow } from './patternsFlow'

// Records keyed by a name, in the cloud copy (2026-11-13). A synced record's key on the phone is read from its store's
// own schema. Until then the Brain settings' key, "prefs", was read as a number that is none: the first sync after a
// Brain setting was changed on the phone failed, and so did every sync after it. The pattern table is keyed by a name
// too. Every token here is made up and never reaches a network.

const TOKEN = 'test-token-never-real'

async function withToken(store: MemoryStore): Promise<void> {
  setStoreFactory(async () => store)
  await updateSettings((s) => ({ ...s, cloud: { ...s.cloud, token: TOKEN } }))
}

async function fresh(): Promise<void> {
  await db.delete()
  await db.open()
  resetCloudForTests()
  forgetKeptPatterns()
}

const row = (store: string, id: string, body: Record<string, unknown>, at = '2026-11-01T10:00:00.000Z'): CloudRow => ({ app: APP, store, id, day: null, body: JSON.stringify(body), updated_at: at, deleted: 0, device_id: 'other-phone', synced_at: at })

beforeEach(fresh)
afterEach(() => {
  setStoreFactory(null)
  setOnlineCheck(null)
})

describe('a synced record’s key on the phone', () => {
  it('is a number for a store keyed by a counted id and for the one settings record, and the word itself for every other', () => {
    expect(keyFor('checkins', '12')).toBe(12)
    expect(keyFor('settings', '1')).toBe(1)
    expect(keyFor('days', '2026-11-10')).toBe('2026-11-10')
    expect(keyFor('facts', '2026-11-10')).toBe('2026-11-10')
    expect(keyFor('herSkills', 'counting')).toBe('counting')
    expect(keyFor('brainPrefs', 'prefs')).toBe('prefs')
    expect(keyFor('patterns', 'table')).toBe('table')
    // Every synced store: its key is one the store itself can be asked for, never a number that is none.
    for (const store of SYNCED_STORES) {
      const auto = db.table(store).schema.primKey.auto
      const key = keyFor(store, auto || store === 'settings' ? '7' : 'a-name')
      expect(typeof key === 'number' ? Number.isFinite(key) : key.length > 0, store).toBe(true)
      expect(typeof key, store).toBe(auto || store === 'settings' ? 'number' : 'string')
    }
  })
})

describe('the Brain settings in the cloud copy', () => {
  it('do not stop the syncs after them: a setting changed on this phone, then sync after sync', async () => {
    const store = memoryStore()
    await withToken(store)
    expect(await syncNow()).toBe('done')
    await setBrainSwitch('notes', false)
    expect(await syncNow()).toBe('done')
    // The pull after the push reads this phone's own row again: the sync that once failed here, and every one after it.
    expect(await syncNow()).toBe('done')
    await setWriterModel('sonnet')
    expect(await syncNow()).toBe('done')
    expect(await syncNow()).toBe('done')
    expect(JSON.parse(store.rows.get(`${APP}|brainPrefs|prefs`)?.body ?? '{}')).toMatchObject({ id: 'prefs', writerModel: 'sonnet', switches: { notes: false } })
    expect(await db.brainPrefs.get('prefs')).toMatchObject({ writerModel: 'sonnet', switches: { notes: false } })
  })

  it('come back on a new phone, with everything else after them', async () => {
    const store = memoryStore()
    await store.upsert([
      row('brainPrefs', 'prefs', { id: 'prefs', writerModel: 'sonnet', switches: { notes: false }, updatedAt: '2026-11-01T10:00:00.000Z' }),
      // A row written after it: a pull that stopped at the settings would never reach it.
      row('wins', '5', { id: 5, day: '2026-11-01', text: 'kept going', createdAt: '2026-11-01T11:00:00.000Z', updatedAt: '2026-11-01T11:00:00.000Z' }, '2026-11-01T11:00:00.000Z'),
    ])
    await withToken(store)
    expect(await syncNow()).toBe('done')
    expect(await db.brainPrefs.get('prefs')).toMatchObject({ writerModel: 'sonnet', switches: { notes: false } })
    expect(await db.wins.get(5)).toMatchObject({ text: 'kept going' })
  })
})

describe('the pattern table in the cloud copy', () => {
  const A = 250
  const seed = async (): Promise<void> => {
    await db.checkins.bulkAdd(Array.from({ length: 56 }, (_, i) => checkin(A + i, 'evening', { extras: new Date(2026, 0, 1 + A + i).getDay() === 6 ? { dinner: true } : {} })))
    await db.days.bulkAdd(Array.from({ length: 56 }, (_, i) => context(A + i)))
  }
  const none = async (): Promise<void> => undefined
  const NOW = new Date('2026-11-03T14:00:00.000Z')

  it('syncs as one row, is pushed again only when it changed, and never stops a later sync', async () => {
    const store = memoryStore()
    await withToken(store)
    await seed()
    await writePatternsRow(day(A + 56), NOW, { pause: none })
    expect(await syncNow()).toBe('done')
    const cloud = [...store.rows.values()].filter((r) => r.app === APP && r.store === 'patterns')
    expect(cloud.map((r) => r.id)).toEqual(['table'])
    expect(readPatterns(JSON.parse(cloud[0].body ?? 'null'))).toMatchObject({ id: 'table', builtFor: day(A + 56) })
    const stamp = cloud[0].synced_at
    // Unchanged: nothing is queued, the row in the cloud is not written again, and the syncs go on.
    expect(await writePatternsRow(day(A + 56), new Date(NOW.getTime() + 60_000), { pause: none })).toBe(false)
    expect(await syncNow()).toBe('done')
    expect(await syncNow()).toBe('done')
    expect(store.rows.get(`${APP}|patterns|table`)?.synced_at).toBe(stamp)
    expect(await db.outbox.count()).toBe(0)
  })

  it('comes back on a new phone as the record it was', async () => {
    const store = memoryStore()
    await withToken(store)
    await seed()
    await writePatternsRow(day(A + 56), NOW, { pause: none })
    expect(await syncNow()).toBe('done')
    const kept = await db.patterns.get(PATTERNS_ID)
    await fresh()
    await withToken(store)
    expect(await db.patterns.count()).toBe(0)
    expect(await syncNow()).toBe('done')
    expect(await db.patterns.get(PATTERNS_ID)).toEqual(kept)
    // A restore run twice changes nothing.
    expect(await syncNow()).toBe('done')
    expect(await db.patterns.get(PATTERNS_ID)).toEqual(kept)
    expect(await db.outbox.count()).toBe(0)
  })

  it('is gone after everything is deleted, on the phone and in the cloud copy', async () => {
    const store = memoryStore()
    await withToken(store)
    await seed()
    await writePatternsRow(day(A + 56), NOW, { pause: none })
    expect(await syncNow()).toBe('done')
    expect(store.rows.has(`${APP}|patterns|table`)).toBe(true)
    await deleteCloudCopy()
    expect([...store.rows.values()].filter((r) => r.app === APP)).toEqual([])
    await wipeEverything()
    expect(await db.patterns.count()).toBe(0)
  })
})
