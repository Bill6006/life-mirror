import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { APP, bodyForCloud } from './cloudOutbox'
import { memoryStore, type CloudRow, type MemoryStore } from './cloudStore'
import { BRAIN_APP, brainBriefOf, deleteCloudCopy, ensureDeviceId, getBrainMeta, getMeta, getOutsideMeta, latestPerRow, OUTSIDE_APP, outsideDayOf, PAGE, removeToken, resetCloudForTests, resolveToken, saveToken, setOnlineCheck, setStoreFactory, syncNow, wholeRuns } from './cloudSync'
import { addPrivateItem, archivePrivateItem, db, getSettings, saveAnswer, setWin, updateSettings, wipeEverything } from './db'
import { markSilent } from './cloudOutbox'
import { setBrainSwitch, setWriterModel } from './brainPrefs'
import { DEVICE_KEY, MARK_KEY, MIRROR_KEY, latestNotice, memoryKeyValue, readLog, setTokenStorageForTests, type KeyValue } from './tokenVault'
import { blockReadings } from './readings'

// The cloud copy, against a fake client. CI never has a token: every token here is made up and
// never reaches a network. Rule 21: the phone is the source of truth.

const TOKEN = 'test-token-never-real'
const DAY = '2026-09-11'

async function fresh(): Promise<void> {
  await db.delete()
  await db.open()
  resetCloudForTests()
}

async function withToken(store: MemoryStore): Promise<void> {
  setStoreFactory(async () => store)
  await updateSettings((s) => ({ ...s, cloud: { ...s.cloud, token: TOKEN } }))
}

const asked = blockReadings('afternoon')

async function oneCheckIn(): Promise<void> {
  for (const id of asked) await saveAnswer({ day: DAY, block: 'afternoon' }, asked, id, 3, 500)
}

const cloudRow = (store: string, id: string, body: Record<string, unknown> | null, updated_at: string, synced_at: string, deleted: 0 | 1 = 0): CloudRow => ({
  app: APP,
  store,
  id,
  day: DAY,
  body: body ? JSON.stringify(body) : null,
  updated_at,
  deleted,
  device_id: 'other-phone',
  synced_at,
})

beforeEach(fresh)
afterEach(() => {
  setStoreFactory(null)
  setOnlineCheck(null)
})

describe('the outbox', () => {
  it('queues every create, update and delete inside the same transaction, and nothing else', async () => {
    await oneCheckIn()
    const afterTaps = await db.outbox.toArray()
    expect(afterTaps.every((r) => r.store === 'checkins' && r.op === 'put')).toBe(true)
    expect(afterTaps.length).toBe(asked.length)
    const body = JSON.parse(afterTaps[afterTaps.length - 1].body as string)
    expect(body.id).toBe(1)
    expect(body.day).toBe(DAY)
    expect(afterTaps[0].day).toBe(DAY)
    expect(afterTaps[0].updatedAt).toBe(body.updatedAt === undefined ? afterTaps[0].updatedAt : JSON.parse(afterTaps[0].body as string).updatedAt)

    await addPrivateItem('Item one')
    await archivePrivateItem(1)
    const items = (await db.outbox.toArray()).filter((r) => r.store === 'privateItems')
    expect(items.map((r) => r.op)).toEqual(['put', 'put'])
    expect(JSON.parse(items[1].body as string).archived).toBe(1)

    await setWin('2026-09-12', DAY, 'One line')
    await setWin('2026-09-12', DAY, '')
    const wins = (await db.outbox.toArray()).filter((r) => r.store === 'wins')
    expect(wins.map((r) => r.op)).toEqual(['put', 'delete'])
    expect(wins[0].day).toBe('2026-09-12')
    expect(wins[1].body).toBeNull()
  })

  it('never carries the token, the push address or the reminders shown', async () => {
    await updateSettings((s) => ({ ...s, cloud: { token: TOKEN, deviceId: 'dev', tokenSavedAt: null }, direction: 'One line' }))
    const rows = (await db.outbox.toArray()).filter((r) => r.store === 'settings')
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      const body = JSON.parse(r.body as string)
      expect(body.cloud).toBeUndefined()
      expect(body.push).toBeUndefined()
      expect(body.reminded).toBeUndefined()
      expect(r.body).not.toContain(TOKEN)
    }
    expect(bodyForCloud('settings', { a: 1, cloud: { token: 'x' }, push: {}, reminded: {} })).toEqual({ a: 1 })
    expect(bodyForCloud('wins', { a: 1, cloud: 2 })).toEqual({ a: 1, cloud: 2 })
  })
})

describe('the sync worker', () => {
  it('does nothing at all without a token', async () => {
    let created = 0
    setStoreFactory(async () => {
      created++
      return memoryStore()
    })
    await oneCheckIn()
    expect(await syncNow()).toBe('noToken')
    expect(created).toBe(0)
    expect(await db.outbox.count()).toBe(asked.length)
  })

  it('drains the outbox in batches, latest change per row, registers the phone, and records what the cloud holds', async () => {
    const store = memoryStore()
    await withToken(store)
    await oneCheckIn()
    expect(await syncNow()).toBe('done')
    expect(await db.outbox.count()).toBe(0)
    const rows = [...store.rows.values()]
    const checkins = rows.filter((r) => r.store === 'checkins')
    expect(checkins.length).toBe(1)
    expect(checkins[0].app).toBe(APP)
    expect(checkins[0].id).toBe('1')
    expect(checkins[0].day).toBe(DAY)
    expect(checkins[0].deleted).toBe(0)
    expect(JSON.parse(checkins[0].body as string).answers[asked[0]]).toBe(3)
    const settings = await getSettings()
    expect(settings.cloud.deviceId).not.toBe('')
    expect(checkins[0].device_id).toBe(settings.cloud.deviceId)
    expect(store.devices.get(settings.cloud.deviceId)?.app).toBe(APP)
    const known = await db.cloudRows.get(['checkins', '1'])
    expect(known?.updatedAt).toBe(checkins[0].updated_at)
    const meta = await getMeta()
    expect(meta.lastSyncAt).not.toBeNull()
    expect(meta.lastError).toBeNull()
    expect(rows.some((r) => r.body?.includes(TOKEN))).toBe(false)
  })

  it('keeps one row per record when many changes queue', () => {
    const at = '2026-09-11T10:00:00.000Z'
    const rows = [
      { store: 'checkins', key: '1', op: 'put' as const, body: '{"a":1}', day: DAY, updatedAt: at, at },
      { store: 'checkins', key: '1', op: 'put' as const, body: '{"a":2}', day: DAY, updatedAt: at, at },
      { store: 'wins', key: '3', op: 'put' as const, body: '{}', day: DAY, updatedAt: at, at },
      { store: 'wins', key: '3', op: 'delete' as const, body: null, day: null, updatedAt: at, at },
    ]
    const latest = latestPerRow(rows)
    expect(latest.length).toBe(2)
    expect(latest[0].body).toBe('{"a":2}')
    expect(latest[1].op).toBe('delete')
  })

  it('applies a pull only where the remote is newer, deletes on tombstones, and never re-enqueues', async () => {
    const store = memoryStore()
    await withToken(store)
    await oneCheckIn()
    await setWin('2026-09-12', DAY, 'Mine')
    await syncNow()
    expect(await db.outbox.count()).toBe(0)
    const local = (await db.checkins.get(1))!
    const older = { ...local, activeMs: 999, updatedAt: '2000-01-01T00:00:00.000Z' }
    const newer = { ...local, activeMs: 4242, updatedAt: '2999-01-01T00:00:00.000Z' }
    store.rows.set(`${APP}|checkins|1`, cloudRow('checkins', '1', older, older.updatedAt, '2999-01-01T00:00:00.000Z'))
    expect(await syncNow()).toBe('done')
    expect((await db.checkins.get(1))?.activeMs).toBe(local.activeMs)
    store.rows.set(`${APP}|checkins|1`, cloudRow('checkins', '1', newer, newer.updatedAt, '2999-01-02T00:00:00.000Z'))
    store.rows.set(`${APP}|wins|1`, cloudRow('wins', '1', null, '2999-01-02T00:00:00.000Z', '2999-01-02T00:00:01.000Z', 1))
    store.rows.set(`other-app|checkins|1`, { ...cloudRow('checkins', '1', { theirs: true }, '2999-01-03T00:00:00.000Z', '2999-01-03T00:00:00.000Z'), app: 'other-app' })
    expect(await syncNow()).toBe('done')
    expect((await db.checkins.get(1))?.activeMs).toBe(4242)
    expect(await db.wins.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
    expect((await getMeta()).watermark).toBe('2999-01-02T00:00:01.000Z')
    expect(store.rows.get('other-app|checkins|1')?.body).toContain('theirs')
  })

  it('queues while offline and drains when the network is back, and retries after a failure', async () => {
    const store = memoryStore()
    await withToken(store)
    await oneCheckIn()
    setOnlineCheck(() => false)
    expect(await syncNow()).toBe('offline')
    expect(store.calls).toBe(0)
    const queued = async () => (await db.outbox.toArray()).filter((r) => r.store === 'checkins').length
    expect(await queued()).toBe(asked.length)
    setOnlineCheck(() => true)
    store.failWith = new Error('connection refused')
    expect(await syncNow()).toBe('failed')
    expect(await queued()).toBe(asked.length)
    expect((await getMeta()).lastError).toBe('connection refused')
    store.failWith = null
    resetCloudForTests()
    expect(await syncNow()).toBe('done')
    expect(await db.outbox.count()).toBe(0)
    expect((await getMeta()).lastError).toBeNull()
  })

  it('deletes only this app\'s cloud rows on a wipe, and nothing without a token', async () => {
    const store = memoryStore()
    store.rows.set('other-app|x|1', { ...cloudRow('x', '1', { theirs: true }, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'), app: 'other-app' })
    expect(await deleteCloudCopy()).toBe(true)
    expect(store.calls).toBe(0)
    await withToken(store)
    await oneCheckIn()
    await syncNow()
    expect([...store.rows.values()].filter((r) => r.app === APP).length).toBeGreaterThan(0)
    expect(await deleteCloudCopy()).toBe(true)
    expect([...store.rows.values()].filter((r) => r.app === APP).length).toBe(0)
    expect(store.rows.get('other-app|x|1')).toBeDefined()
    expect(store.devices.size).toBe(0)
    await wipeEverything()
    expect(await db.outbox.count()).toBe(0)
    expect(await db.checkins.count()).toBe(0)
    store.failWith = new Error('offline')
    await updateSettings((s) => ({ ...s, cloud: { ...s.cloud, token: TOKEN } }))
    expect(await deleteCloudCopy()).toBe(false)
  })

  it('restores everything on a fresh install with the token, keeping the token', async () => {
    const store = memoryStore()
    await withToken(store)
    await updateSettings((s) => ({ ...s, direction: 'I finish what I start.' }))
    await oneCheckIn()
    await setWin('2026-09-12', DAY, 'One line')
    await addPrivateItem('Item one')
    await syncNow()
    const before = [...store.rows.values()].filter((r) => r.app === APP).length
    expect(before).toBeGreaterThanOrEqual(4)

    await fresh()
    await withToken(store)
    expect(await syncNow()).toBe('done')
    expect(await db.checkins.count()).toBe(1)
    expect((await db.checkins.get(1))?.day).toBe(DAY)
    expect((await db.wins.toArray())[0]?.text).toBe('One line')
    expect((await db.privateItems.toArray())[0]?.name).toBe('Item one')
    const settings = await getSettings()
    expect(settings.direction).toBe('I finish what I start.')
    expect(settings.cloud.token).toBe(TOKEN)
    // Restored rows are known to the cloud and never queued again.
    expect(await db.outbox.count()).toBe(0)
    expect([...store.rows.values()].filter((r) => r.app === APP).length).toBe(before)
  })
})

describe('the token on the phone', () => {
  let phone: KeyValue
  beforeEach(() => {
    phone = memoryKeyValue()
    setTokenStorageForTests(phone)
  })
  afterEach(() => setTokenStorageForTests(null))

  /** A check-in gone from the phone with no tombstone and no queue entry: the way a record was lost. */
  async function loseCheckIn(): Promise<void> {
    await db.transaction('rw', [db.checkins, db.outbox], async () => {
      markSilent()
      await db.checkins.clear()
    })
    expect(await db.checkins.count()).toBe(0)
  }

  /** The token gone from the app's database with no removal: the way it was lost. */
  async function loseDatabaseToken(): Promise<void> {
    await updateSettings((s) => ({ ...s, cloud: { ...s.cloud, token: null, tokenSavedAt: null } }))
  }

  /** Saves, pushes one check-in, then syncs again so the watermark sits past the pushed rows, as on the phone. */
  async function connectAndSettle(store: MemoryStore): Promise<number> {
    setStoreFactory(async () => store)
    await saveToken(TOKEN)
    await oneCheckIn()
    expect(await syncNow()).toBe('done')
    expect(await syncNow()).toBe('done')
    const rows = [...store.rows.values()].filter((r) => r.app === APP)
    expect(rows.some((r) => r.store === 'checkins')).toBe(true)
    expect((await getMeta()).watermark).toBe(rows.map((r) => r.synced_at).sort().at(-1))
    return rows.length
  }

  it('keeps the token in both homes, reads it back, starts the next pull from the beginning, and the log never carries it', async () => {
    const store = memoryStore()
    setStoreFactory(async () => store)
    await saveToken(`  ${TOKEN}  `)
    const s = await getSettings()
    expect(s.cloud.token).toBe(TOKEN)
    expect(s.cloud.tokenSavedAt).toBeTruthy()
    expect(phone.getItem(MIRROR_KEY)).toBe(TOKEN)
    expect(JSON.parse(phone.getItem(MARK_KEY) ?? '{}')).toMatchObject({ savedAt: s.cloud.tokenSavedAt })
    expect(readLog().map((e) => e.kind)).toEqual(['saved'])
    expect(JSON.stringify(readLog())).not.toContain(TOKEN)
    expect(phone.getItem(MARK_KEY)).not.toContain(TOKEN)
    expect((await getMeta()).watermark).toBe('')
    expect(await syncNow()).toBe('done')
    expect(latestNotice()).toBeNull()
  })

  it('a database that lost the token gets it back from the phone, and a lost record comes back with it', async () => {
    const store = memoryStore()
    const before = await connectAndSettle(store)
    await loseDatabaseToken()
    await loseCheckIn()

    expect(await syncNow()).toBe('done')
    expect((await getSettings()).cloud.token).toBe(TOKEN)
    expect(await db.checkins.count()).toBe(1)
    expect((await db.checkins.get(1))?.day).toBe(DAY)
    expect(readLog().map((e) => e.kind)).toEqual(['saved', 'restored'])
    expect(latestNotice()?.detail).toMatch(/database had lost the token/)
    // Nothing in the cloud was touched: no tombstone, no new row.
    const rows = [...store.rows.values()].filter((r) => r.app === APP)
    expect(rows.length).toBe(before)
    expect(rows.every((r) => r.deleted === 0)).toBe(true)
  })

  it('with the token intact a routine sync cannot see an old row; a token pasted again walks everything back', async () => {
    const store = memoryStore()
    const before = await connectAndSettle(store)
    await loseCheckIn()

    expect(await syncNow()).toBe('done')
    expect(await db.checkins.count()).toBe(0)
    await saveToken(TOKEN)
    expect(await syncNow()).toBe('done')
    expect(await db.checkins.count()).toBe(1)
    expect([...store.rows.values()].filter((r) => r.app === APP).length).toBe(before)
  })

  it('both homes empty after a save: says missing once, with when it was last seen, and pasting again restores everything', async () => {
    const store = memoryStore()
    await connectAndSettle(store)
    const lastSeen = JSON.parse(phone.getItem(MARK_KEY) ?? '{}').lastSeenAt as string
    await loseDatabaseToken()
    phone.removeItem(MIRROR_KEY)
    await loseCheckIn()

    const calls = store.calls
    expect(await syncNow()).toBe('noToken')
    expect(store.calls).toBe(calls)
    const lost = await resolveToken()
    expect(lost.token).toBeNull()
    expect(lost.notice).toMatchObject({ kind: 'missing', lastSeenAt: lastSeen })
    expect(readLog().filter((e) => e.kind === 'missing')).toHaveLength(1)

    await saveToken(TOKEN)
    expect(await syncNow()).toBe('done')
    expect(await db.checkins.count()).toBe(1)
    expect(latestNotice()).toBeNull()
    expect([...store.rows.values()].every((r) => r.deleted === 0)).toBe(true)
  })

  it('removing the token clears both homes and the marks, keeps the log, and is not a loss', async () => {
    const store = memoryStore()
    setStoreFactory(async () => store)
    await saveToken(TOKEN)
    await removeToken()
    expect((await getSettings()).cloud).toMatchObject({ token: null, tokenSavedAt: null })
    expect(phone.getItem(MIRROR_KEY)).toBeNull()
    expect(phone.getItem(MARK_KEY)).toBeNull()
    expect(readLog().map((e) => e.kind)).toEqual(['saved', 'removed'])
    expect(await syncNow()).toBe('noToken')
    expect((await resolveToken()).notice).toBeNull()
  })

  it('a phone from before the second copy writes it on the first run and walks the history once, quietly', async () => {
    const store = memoryStore()
    await withToken(store)
    expect(await syncNow()).toBe('done')
    expect(phone.getItem(MIRROR_KEY)).toBe(TOKEN)
    expect((await getSettings()).cloud.tokenSavedAt).toBeTruthy()
    expect(readLog()).toHaveLength(1)
    expect(readLog()[0]).toMatchObject({ kind: 'saved' })
    expect(readLog()[0]?.detail).toMatch(/second copy/)
    expect(latestNotice()).toBeNull()
    expect(await syncNow()).toBe('done')
    expect(readLog()).toHaveLength(1)
  })

  it('a phone that lost its settings keeps its device id from the second copy', async () => {
    const id = await ensureDeviceId()
    expect(phone.getItem(DEVICE_KEY)).toBe(id)
    await updateSettings((s) => ({ ...s, cloud: { ...s.cloud, deviceId: '' } }))
    expect(await ensureDeviceId()).toBe(id)
  })
})

describe('the other app’s finished workouts, read from the same database', () => {
  const outsideRow = (id: string, body: Record<string, unknown> | null, synced_at: string, deleted: 0 | 1 = 0): CloudRow => ({
    app: OUTSIDE_APP,
    store: 'workouts',
    id,
    day: null,
    body: body ? JSON.stringify(body) : null,
    updated_at: synced_at,
    deleted,
    device_id: 'other-app',
    synced_at,
  })

  it('reads a completed workout as an outside day on its local date, takes a deleted one back, and never writes the other app’s rows', async () => {
    const store = memoryStore()
    await store.upsert([
      outsideRow('w1', { id: 'w1', startedAt: '2026-09-10T22:30:00.000Z', completedAt: new Date(2026, 8, 11, 7, 45).toISOString(), elapsedSeconds: 2700 }, '2026-09-11T08:00:00.000Z'),
      outsideRow('w2', { id: 'w2', startedAt: '2026-09-12T10:00:00.000Z', completedAt: null }, '2026-09-12T11:00:00.000Z'),
      outsideRow('w3', { id: 'w3', completedAt: new Date(2026, 8, 13, 18, 0).toISOString() }, '2026-09-13T19:00:00.000Z'),
    ])
    await withToken(store)
    await syncNow()
    const days = await db.outside.toArray()
    expect(days.map((d) => d.id).sort()).toEqual(['w1', 'w3'])
    expect(days.find((d) => d.id === 'w1')).toMatchObject({ day: '2026-09-11', minutes: 45, source: 'workout' })
    expect(days.find((d) => d.id === 'w3')?.minutes).toBeNull()
    expect((await getOutsideMeta()).watermark).toBe('2026-09-13T19:00:00.000Z')
    expect([...store.rows.values()].filter((r) => r.app === OUTSIDE_APP)).toHaveLength(3)

    await store.upsert([outsideRow('w1', null, '2026-09-14T09:00:00.000Z', 1)])
    await syncNow()
    expect((await db.outside.toArray()).map((d) => d.id)).toEqual(['w3'])
  })

  it('never loses a workout to a page that ends inside a batch the other app stamped with one time', async () => {
    const store = memoryStore()
    const stamp = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, 0, n)).toISOString()
    // Its other stores fill most of a page; then five workouts pushed in one batch share a timestamp, and the page boundary falls among them.
    const filler: CloudRow[] = Array.from({ length: PAGE - 2 }, (_, n) => ({ app: OUTSIDE_APP, store: 'meta', id: 'm' + n, day: null, body: '{}', updated_at: stamp(n), deleted: 0, device_id: 'other-app', synced_at: stamp(n) }))
    const batch = Array.from({ length: 5 }, (_, n) => outsideRow('b' + n, { id: 'b' + n, completedAt: new Date(2026, 8, 10 + n, 7, 0).toISOString() }, stamp(PAGE)))
    await store.upsert([...filler, ...batch, outsideRow('later', { id: 'later', completedAt: new Date(2026, 8, 16, 7, 0).toISOString() }, stamp(PAGE + 1))])
    await withToken(store)
    await syncNow()
    expect((await db.outside.toArray()).map((d) => d.id).sort()).toEqual(['b0', 'b1', 'b2', 'b3', 'b4', 'later'])
    expect((await getOutsideMeta()).watermark).toBe(stamp(PAGE + 1))
    // The rule on its own: a short page is whole; a full page gives up its last run; a page that is one run is taken as it is.
    const r = (s: string) => ({ synced_at: s })
    expect(wholeRuns([r('a'), r('b')], 3)).toHaveLength(2)
    expect(wholeRuns([r('a'), r('b'), r('b')], 3)).toEqual([r('a')])
    expect(wholeRuns([r('b'), r('b'), r('b')], 3)).toHaveLength(3)
  })

  it('says what an outside row means, and nothing for one it cannot read', () => {
    expect(outsideDayOf('not json')).toBeNull()
    expect(outsideDayOf(JSON.stringify({ completedAt: 'yesterday' }))).toBeNull()
    expect(outsideDayOf(JSON.stringify({ completedAt: new Date(2026, 8, 11, 7, 45).toISOString(), elapsedSeconds: 90 }))).toMatchObject({ day: '2026-09-11', minutes: 2 })
  })

  it('reads each session’s detail from the same row, and leaves out what a row lacks or holds in another shape (Part 35)', () => {
    const set = (kind: string, rir: number | null, completed = true) => ({ kind, reps: 8, weight: 60, rir, completed })
    const full = outsideDayOf(
      JSON.stringify({
        startedAt: new Date(2026, 8, 20, 18, 0).toISOString(),
        completedAt: new Date(2026, 8, 20, 18, 50).toISOString(),
        elapsedSeconds: 2940,
        title: 'Push + arms',
        endedEarly: false,
        entries: [{ exerciseId: 'a', sets: [set('warmup', null), set('working', 2), set('working', 1), set('working', null)] }, { exerciseId: 'b', sets: [set('working', 0), set('working', 3, false), set('drop', 0)] }],
        rating: { effort: 'too-hard', energyAfter: 4, pain: false, note: 'kept private' },
      }),
    )
    expect(full).toMatchObject({ day: '2026-09-20', minutes: 49, title: 'Push + arms', endedEarly: false, workingSets: 4, effort: 'too-hard', energyAfter: 4, avgRir: 1 })
    expect(full).not.toHaveProperty('imported')
    expect(JSON.stringify(full)).not.toContain('kept private')
    const bare = outsideDayOf(JSON.stringify({ completedAt: new Date(2026, 8, 21, 7, 0).toISOString(), rating: { effort: 'hard?', energyAfter: 9 }, entries: 'none', source: 'legacy-import' }))
    expect(bare).toMatchObject({ day: '2026-09-21', imported: true })
    for (const k of ['startedAt', 'title', 'effort', 'energyAfter', 'avgRir', 'workingSets']) expect(bare).not.toHaveProperty(k)
  })

  it('re-reads every workout once from the start when the reading of them grows, so the ones already kept gain their detail (Part 35)', async () => {
    const store = memoryStore()
    await store.upsert([outsideRow('w1', { id: 'w1', completedAt: new Date(2026, 8, 11, 19, 0).toISOString(), title: 'Lower body', rating: { effort: 'right', energyAfter: 3 } }, '2026-09-11T20:00:00.000Z')])
    // A phone that read these rows before Part 35: its watermark is past the row, and it kept no detail.
    await db.outside.put({ id: 'w1', day: '2026-09-11', minutes: null, at: new Date(2026, 8, 11, 19, 0).toISOString(), source: 'workout' })
    await db.cloudMeta.put({ key: 'outside', watermark: '2026-09-12T00:00:00.000Z', lastSyncAt: null, lastError: null })
    await withToken(store)
    await syncNow()
    expect(await db.outside.get('w1')).toMatchObject({ title: 'Lower body', effort: 'right', energyAfter: 3 })
    expect((await getOutsideMeta()).detail).toBe(2)
    // Once only: the next pull starts from its watermark again.
    await db.outside.update('w1', { title: 'kept here' })
    await syncNow()
    expect((await db.outside.get('w1'))?.title).toBe('kept here')
  })
})

describe('the brain’s lines, read from the same database', () => {
  const brainRow = (id: string, body: Record<string, unknown> | null, synced_at: string, deleted: 0 | 1 = 0): CloudRow => ({ app: BRAIN_APP, store: 'briefs', id, day: null, body: body ? JSON.stringify(body) : null, updated_at: synced_at, deleted, device_id: 'worker', synced_at })

  it('reads a line the Worker wrote, takes a deleted one back, and writes none of its rows', async () => {
    const store = memoryStore()
    await store.upsert([
      brainRow('2026-09-18:brief', { day: '2026-09-18', kind: 'brief', text: 'One line.', mode: 'observation', factIds: ['record'], cardIds: [], model: 'm', at: '2026-09-18T09:15:00.000Z' }, '2026-09-18T09:15:01.000Z'),
      brainRow('x', { day: '2026-09-18' }, '2026-09-18T09:15:02.000Z'),
    ])
    await withToken(store)
    await syncNow()
    const rows = await db.brainBriefs.toArray()
    expect(rows.map((r) => r.id)).toEqual(['2026-09-18:brief'])
    expect(rows[0]).toMatchObject({ day: '2026-09-18', kind: 'brief', text: 'One line.', model: 'm' })
    expect((await getBrainMeta()).watermark).toBe('2026-09-18T09:15:02.000Z')
    expect([...store.rows.values()].filter((r) => r.app === BRAIN_APP)).toHaveLength(2)
    await store.upsert([brainRow('2026-09-18:brief', null, '2026-09-19T09:00:00.000Z', 1)])
    await syncNow()
    expect(await db.brainBriefs.count()).toBe(0)
    expect(brainBriefOf('y', 'not json')).toBeNull()
    expect(brainBriefOf('y', JSON.stringify({ day: '2026-09-18', text: 'T', kind: 'review' }))?.kind).toBe('review')
    // Part 34: what Claude said it lacked arrives with the line, known ids only.
    expect(brainBriefOf('y', JSON.stringify({ day: '2026-09-18', text: 'T', lacked: ['notes', 'x', 'notes'] }))?.lacked).toEqual(['notes'])
    expect(brainBriefOf('y', JSON.stringify({ day: '2026-09-18', text: 'T', lacked: 'notes' }))).not.toHaveProperty('lacked')
  })
})

describe('the Brain settings and what Claude read (Part 30)', () => {
  const brainRow = (store: string, id: string, body: Record<string, unknown>, synced_at: string): CloudRow => ({ app: BRAIN_APP, store, id, day: null, body: JSON.stringify(body), updated_at: synced_at, deleted: 0, device_id: 'worker', synced_at })

  it('syncs the Brain settings as the one row the Worker reads', async () => {
    const store = memoryStore()
    await withToken(store)
    await setWriterModel('sonnet')
    await setBrainSwitch('notes', false)
    await syncNow()
    const row = store.rows.get(`${APP}|brainPrefs|prefs`)
    expect(JSON.parse(row?.body ?? '{}')).toMatchObject({ id: 'prefs', writerModel: 'sonnet', switches: { notes: false } })
  })

  it('reads who wrote a line, and each read by its counts alone, whatever else a row carries', async () => {
    const store = memoryStore()
    await store.upsert([
      brainRow('briefs', '2026-09-18:brief', { day: '2026-09-18', kind: 'brief', text: 'One line.', mode: 'observation', factIds: ['record'], cardIds: [], model: 'claude-opus-5-5', at: '2026-09-18T11:48:00.000Z', writer: 'claude', askedModel: 'opus' }, '2026-09-18T11:48:01.000Z'),
      brainRow('reads', 'read:1', { day: '2026-09-18', at: '2026-09-18T11:47:00.000Z', task: 'line', category: 'notes', count: 3, bytes: 240, via: 'briefing', text: 'never kept' }, '2026-09-18T11:47:01.000Z'),
      brainRow('reads', 'read:2', { day: '2026-09-18', task: 'nothing' }, '2026-09-18T11:47:02.000Z'),
    ])
    await withToken(store)
    await syncNow()
    expect(await db.brainBriefs.get('2026-09-18:brief')).toMatchObject({ writer: 'claude', askedModel: 'opus', model: 'claude-opus-5-5' })
    expect(await db.brainReads.toArray()).toEqual([{ id: 'read:1', day: '2026-09-18', at: '2026-09-18T11:47:00.000Z', task: 'line', category: 'notes', count: 3, bytes: 240, via: 'briefing' }])
  })

  it('keeps a test run’s reads marked as one', async () => {
    const store = memoryStore()
    await store.upsert([brainRow('reads', 'read:9', { day: '2026-09-23', at: '2026-09-23T23:00:00.000Z', task: 'coach', category: 'notes', count: 1, bytes: 80, via: 'context', dry: true }, '2026-09-23T23:00:01.000Z')])
    await withToken(store)
    await syncNow()
    expect(await db.brainReads.get('read:9')).toMatchObject({ task: 'coach', dry: true })
  })

  it('reads the coach’s pick, and drops it when the Worker takes it back', async () => {
    const store = memoryStore()
    const pick = { day: '2026-09-24', block: 'morning', path: 'social', ids: ['greet-by-name'], versions: { 'greet-by-name': 'Greet one colleague by name.' }, model: 'claude-opus-5-5', at: '2026-09-24T11:52:00.000Z' }
    await store.upsert([brainRow('coach', '2026-09-24:coach', pick, '2026-09-24T11:52:01.000Z')])
    await withToken(store)
    await syncNow()
    expect(await db.coachPicks.get('2026-09-24:coach')).toMatchObject({ ids: ['greet-by-name'] })
    // Taken back: the row stays in the database, marked deleted with a new sync time.
    await store.upsert([{ ...brainRow('coach', '2026-09-24:coach', pick, '2026-09-24T16:00:00.000Z'), deleted: 1 }])
    await syncNow()
    expect(await db.coachPicks.count()).toBe(0)
  })
})
