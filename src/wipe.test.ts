import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureDeviceId, resolveToken, saveToken } from './cloudSync'
import { db, getSettings, wipeEverything } from './db'
import { DEVICE_KEY, LOG_KEY, MARK_KEY, memoryKeyValue, MIRROR_KEY, readMirror, setTokenStorageForTests, type KeyValue } from './tokenVault'

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

// "Delete everything" and the token (2026-11-12). The token has a second home in the phone's local storage, so that a
// cleared database does not lose it. The wipe left that copy standing: the next start found it, put it back into the
// settings and connected to the cloud again without a word. It now goes with everything else, by name, with its mark,
// its log and the device id's copy; nothing else in that storage is touched, since every app at the address shares it.
describe('the wipe and the token’s second home', () => {
  const TOKEN = 'test-token-never-real'
  let kv: KeyValue
  beforeEach(async () => {
    await db.delete()
    await db.open()
    kv = memoryKeyValue()
    setTokenStorageForTests(kv)
    // Another app's own keys at the same address, and this app's that are not the token's.
    kv.setItem('another-app.choice', 'kept')
    kv.setItem('lm.idFloors', '{"checkins":12}')
    await saveToken(TOKEN)
    await ensureDeviceId()
  })
  afterEach(() => setTokenStorageForTests(null))

  it('leaves no token in either home, nor its mark, its log or the device id’s copy, and touches nothing else', async () => {
    // Both homes hold it before: the probe can say yes.
    expect((await getSettings()).cloud.token).toBe(TOKEN)
    expect(readMirror()).toBe(TOKEN)
    for (const key of [MIRROR_KEY, MARK_KEY, LOG_KEY, DEVICE_KEY]) expect(kv.getItem(key), key).not.toBeNull()
    expect(await wipeEverything()).toBe(true)
    expect([MIRROR_KEY, MARK_KEY, LOG_KEY, DEVICE_KEY]).toEqual(['lm.cloudToken', 'lm.cloudTokenMark', 'lm.cloudTokenLog', 'lm.cloudDevice'])
    for (const key of ['lm.cloudToken', 'lm.cloudTokenMark', 'lm.cloudTokenLog', 'lm.cloudDevice']) expect(kv.getItem(key), key).toBeNull()
    expect(kv.getItem('another-app.choice')).toBe('kept')
    // The id floors stay: they hold numbers alone, and only ever keep a later id from being handed out twice.
    expect(JSON.parse(kv.getItem('lm.idFloors') ?? '{}')).toMatchObject({ checkins: 12 })
    // The next start finds no token anywhere, so nothing syncs until one is pasted again.
    expect(await resolveToken()).toMatchObject({ token: null })
    expect((await getSettings()).cloud.token).toBeNull()
  })

  it('says so when the phone’s storage will not let the token go', async () => {
    const stuck: KeyValue = { getItem: (k) => kv.getItem(k), setItem: (k, v) => kv.setItem(k, v), removeItem: () => undefined }
    setTokenStorageForTests(stuck)
    expect(await wipeEverything()).toBe(false)
    const throwing: KeyValue = { getItem: (k) => kv.getItem(k), setItem: (k, v) => kv.setItem(k, v), removeItem: () => { throw new Error('the storage refused') } }
    setTokenStorageForTests(throwing)
    expect(await wipeEverything()).toBe(false)
  })
})
