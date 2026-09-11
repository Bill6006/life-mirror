import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { APP, bodyForCloud } from './cloudOutbox'
import { memoryStore, type CloudRow, type MemoryStore } from './cloudStore'
import { deleteCloudCopy, getMeta, latestPerRow, resetCloudForTests, setOnlineCheck, setStoreFactory, syncNow } from './cloudSync'
import { addPrivateItem, archivePrivateItem, db, getSettings, saveAnswer, setWin, updateSettings, wipeEverything } from './db'
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
    await updateSettings((s) => ({ ...s, cloud: { token: TOKEN, deviceId: 'dev' }, direction: 'One line' }))
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
