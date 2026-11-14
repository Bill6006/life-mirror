import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getBrainPrefs, setBrainSwitch, setMonthlyRead } from './brainPrefs'
import { APP } from './cloudOutbox'
import { memoryStore, type CloudRow, type MemoryStore } from './cloudStore'
import { askRunOf, BRAIN_APP, BRAIN_STORES, brainReadOf, coachRunOf, deleteCloudCopy, resetCloudForTests, setOnlineCheck, setStoreFactory, syncNow } from './cloudSync'
import { checkin, context, day } from './counted/testing'
import { db, updateSettings, wipeEverything } from './db'
import { writeUpsForExport } from './export'
import { forgetNoticed } from './noteEvents/flow'
import { setTokenStorageForTests } from './tokenVault'
import { followedNow, markObservation, writeUpsNow } from './writeups/flow'
import { obsMarkIdOf, type WriteUp } from './writeups/shared'

// The monthly write-ups on the phone's own database (2026-11-13): the Worker's rows pulled and kept read-only, the
// owner's marks synced, and what is shown following the record, the switches and the forget moment. Every token here
// is made up and never reaches a network; every write-up is a stand-in.

const TOKEN = 'test-token-never-real'
const A = 250
const NOW = new Date('2026-11-14T14:00:00.000Z')
const FP = 'a'.repeat(64)
const followed = { kind: 'chip.dinner', split: 'weekday', cell: '6', k: 4, n: 9, restK: 6, m: 40 }
/** A stand-in write-up of a month: two things recorded, two noticed, on days the stand-in record holds. */
const writeUp = (reading = 1, at = '2026-11-13T22:00:00.000Z'): WriteUp => ({
  id: `2026-10:${reading}`,
  month: '2026-10',
  reading,
  at,
  day: at.slice(0, 10),
  method: 1,
  model: 'stand-in',
  builtFrom: { counts: { days: 37 }, parts: 1, lines: 120, fingerprint: FP, builtAt: at },
  recorded: [
    { text: 'You wrote a note on most evenings.', days: [day(A), day(A + 1)], kinds: ['notes'] },
    { text: 'You went to church each Sunday.', days: [day(A + 2)], kinds: ['faith'] },
  ],
  noticed: [
    { text: 'A late dinner went with Saturdays.', days: [day(A + 3)], kinds: ['dayRecord'], followed },
    { text: 'You marked Standin beside late nights.', days: [day(A + 4)], kinds: ['privateItems'] },
  ],
})
const brainRow = (w: WriteUp, at: string, deleted: 0 | 1 = 0): CloudRow => {
  const { id, ...body } = w
  return { app: BRAIN_APP, store: 'writeups', id, day: w.day, body: deleted ? '{}' : JSON.stringify(body), updated_at: at, deleted, device_id: 'worker', synced_at: at }
}

async function withToken(store: MemoryStore): Promise<void> {
  setStoreFactory(async () => store)
  await updateSettings((s) => ({ ...s, cloud: { ...s.cloud, token: TOKEN } }))
}
async function fresh(): Promise<void> {
  await db.delete()
  await db.open()
  resetCloudForTests()
}
/** Ten days of evenings, so every day a stand-in write-up cites holds a record. */
async function seedDays(): Promise<void> {
  await db.checkins.bulkAdd(Array.from({ length: 10 }, (_, i) => checkin(A + i, 'evening')))
  await db.days.bulkAdd(Array.from({ length: 10 }, (_, i) => context(A + i)))
}
const shown = async () => (await writeUpsNow()).map((m) => [m.newest.id, m.newest.recorded.map((o) => o.place), m.newest.noticed.map((o) => o.place)])

beforeEach(fresh)
afterEach(() => {
  setStoreFactory(null)
  setOnlineCheck(null)
  setTokenStorageForTests(null)
})

describe('the Worker’s write-ups', () => {
  it('are asked for by name with its other rows, and applied by their ids: a row, a row again, a row that does not read whole, a row deleted', async () => {
    expect(BRAIN_STORES).toContain('writeups')
    const store = memoryStore()
    await store.upsert([brainRow(writeUp(), '2026-11-13T22:00:01.000Z')])
    await withToken(store)
    expect(await syncNow()).toBe('done')
    expect(await db.writeups.toArray()).toEqual([writeUp()])
    expect(await syncNow()).toBe('done')
    expect(await db.writeups.toArray()).toEqual([writeUp()])
    // A later reading is a second row; a row that is no write-up is not kept.
    await store.upsert([brainRow(writeUp(2, '2026-11-20T10:00:00.000Z'), '2026-11-20T10:00:01.000Z'), { ...brainRow(writeUp(3), '2026-11-20T10:00:02.000Z'), id: '2026-10:3', body: JSON.stringify({ month: '2026-10' }) }])
    expect(await syncNow()).toBe('done')
    expect((await db.writeups.toArray()).map((w) => w.id).sort()).toEqual(['2026-10:1', '2026-10:2'])
    // Deleted by the Worker, it leaves the phone.
    await store.upsert([brainRow(writeUp(), '2026-11-21T10:00:00.000Z', 1)])
    expect(await syncNow()).toBe('done')
    expect((await db.writeups.toArray()).map((w) => w.id)).toEqual(['2026-10:2'])
    // Nothing of it was ever queued for the cloud.
    expect((await db.outbox.toArray()).filter((r) => r.store === 'writeups')).toEqual([])
  })

  it('come back on a new phone with the marks made on them', async () => {
    await seedDays()
    const store = memoryStore()
    await store.upsert([brainRow(writeUp(), '2026-11-13T22:00:01.000Z')])
    await withToken(store)
    expect(await syncNow()).toBe('done')
    const id = obsMarkIdOf('2026-10:1', 'noticed', 1)
    await markObservation(id, true, NOW)
    expect(await syncNow()).toBe('done')
    expect(store.rows.get(`${APP}|noteMarks|${id}`)).toMatchObject({ deleted: 0 })
    await fresh()
    await withToken(store)
    expect(await syncNow()).toBe('done')
    expect(await db.noteMarks.toArray()).toEqual([{ id, kind: 'wrong', at: NOW.toISOString(), updatedAt: NOW.toISOString() }])
    expect((await writeUpsNow())[0].newest.noticed.map((o) => o.wrong)).toEqual([true, false])
    // The mark taken back leaves the cloud copy too.
    await markObservation(id, false)
    expect(await syncNow()).toBe('done')
    expect(store.rows.get(`${APP}|noteMarks|${id}`)).toMatchObject({ deleted: 1 })
  })

  it('are gone after everything is deleted', async () => {
    await seedDays()
    const store = memoryStore()
    await withToken(store)
    await db.writeups.put(writeUp())
    await markObservation(obsMarkIdOf('2026-10:1', 'noticed', 1), true, NOW)
    expect(await syncNow()).toBe('done')
    await deleteCloudCopy()
    expect([...store.rows.values()].filter((r) => r.app === APP)).toEqual([])
    await wipeEverything()
    expect(await db.writeups.count()).toBe(0)
    expect(await db.noteMarks.count()).toBe(0)
  })
})

describe('what is shown of the write-ups on this phone', () => {
  beforeEach(async () => {
    await seedDays()
    await db.writeups.put(writeUp())
    await db.privateItems.add({ name: 'Standin', createdAt: '2026-10-01T12:00:00.000Z', archived: 0 } as never)
  })

  it('is every observation while nothing hides one, a private item’s name once names may be shown', async () => {
    // Names may not be shown outside their screen until the setting says so.
    expect(await shown()).toEqual([['2026-10:1', [1, 2], [1]]])
    await updateSettings((s) => ({ ...s, showPrivate: true }))
    expect(await shown()).toEqual([['2026-10:1', [1, 2], [1, 2]]])
  })

  it('follows the Brain’s switches and the faith setting at once', async () => {
    await setBrainSwitch('notes', false)
    expect(await shown()).toEqual([['2026-10:1', [2], [1]]])
    await setBrainSwitch('notes', true)
    await updateSettings((s) => ({ ...s, hideFaith: true }))
    expect(await shown()).toEqual([['2026-10:1', [1], [1]]])
  })

  it('leaves out an observation when a day it cites holds no record any more', async () => {
    await db.checkins.where('day').equals(day(A + 3)).delete()
    await db.days.delete(day(A + 3))
    expect(await shown()).toEqual([['2026-10:1', [1, 2], []]])
  })

  it('is nothing once everything learned is forgotten, and a write-up written after that is shown', async () => {
    await forgetNoticed(NOW)
    expect(await writeUpsNow()).toEqual([])
    await db.writeups.put(writeUp(2, '2026-11-20T10:00:00.000Z'))
    expect((await writeUpsNow()).map((m) => [m.newest.id, m.earlier.length])).toEqual([['2026-10:2', 0]])
  })

  it('gives the followed patterns that count: one marked wrong counts for nothing', async () => {
    expect((await followedNow()).map((f) => [f.kind, f.split, f.cell, f.noticedOn])).toEqual([['chip.dinner', 'weekday', '6', '2026-11-13']])
    await markObservation(obsMarkIdOf('2026-10:1', 'noticed', 1), true, NOW)
    expect(await followedNow()).toEqual([])
  })
})

describe('the owner’s switch for the monthly read', () => {
  it('is kept only when it is off, and read as on by a record that never set it', async () => {
    expect((await getBrainPrefs()).monthlyRead).toBeUndefined()
    await setMonthlyRead(false)
    expect((await getBrainPrefs()).monthlyRead).toBe(false)
    expect(await db.brainPrefs.get('prefs')).toMatchObject({ monthlyRead: false })
    await setMonthlyRead(true)
    expect(await db.brainPrefs.get('prefs')).not.toHaveProperty('monthlyRead')
    // The other settings are untouched by it.
    await setBrainSwitch('notes', false)
    await setMonthlyRead(false)
    expect((await getBrainPrefs()).switches).toEqual({ notes: false })
  })
})

describe('the export', () => {
  beforeEach(async () => {
    await seedDays()
    await db.writeups.bulkPut([writeUp(), writeUp(2, '2026-11-20T10:00:00.000Z')])
    await db.privateItems.add({ name: 'Standin', createdAt: '2026-10-01T12:00:00.000Z', archived: 0 } as never)
    await updateSettings((s) => ({ ...s, showPrivate: true }))
  })

  it('lists each month shown, its newest reading first, each observation with its days and whether you marked it wrong', async () => {
    await markObservation(obsMarkIdOf('2026-10:2', 'noticed', 1), true, NOW)
    const out = writeUpsForExport(await writeUpsNow(), true, true) as { monthlyWriteUps: { month: string; readings: { reading: number; readOn: string; youRecorded: unknown[]; claudeNoticed: unknown[] }[] }[] }
    expect(out.monthlyWriteUps.map((m) => [m.month, m.readings.map((r) => [r.reading, r.readOn])])).toEqual([['2026-10', [[2, '2026-11-20'], [1, '2026-11-13']]]])
    const newest = out.monthlyWriteUps[0].readings[0]
    expect(newest.youRecorded[0]).toEqual({ said: 'You wrote a note on most evenings.', days: [day(A), day(A + 1)], markedWrong: false })
    expect(newest.claudeNoticed[0]).toEqual({ said: 'A late dinner went with Saturdays.', days: [day(A + 3)], markedWrong: true, followed: { kind: 'chip.dinner', split: 'weekday', cell: '6', onTheDayNoticed: '4 of 9', elsewhere: '6 of 40' } })
    // The mark is on the newer reading alone.
    expect((out.monthlyWriteUps[0].readings[1].claudeNoticed[0] as { markedWrong: boolean }).markedWrong).toBe(false)
  })

  it('carries what drew on private items only with private items, and nothing at all when nothing is shown', async () => {
    const months = await writeUpsNow()
    const noticed = (includePrivate: boolean) => (writeUpsForExport(months, includePrivate, true) as { monthlyWriteUps: { readings: { claudeNoticed: unknown[] }[] }[] }).monthlyWriteUps[0].readings[0].claudeNoticed.length
    expect([noticed(true), noticed(false)]).toEqual([2, 1])
    expect(writeUpsForExport([], true, true)).toEqual({})
    expect(writeUpsForExport(undefined, true, true)).toEqual({})
  })

  it('carries what drew on the Partner path only with it', async () => {
    const w = writeUp(3, '2026-11-25T10:00:00.000Z')
    await db.writeups.put({ ...w, recorded: [{ text: 'A stand-in step on the Partner path.', days: [day(A)], kinds: ['partnerPath'] }], noticed: [] })
    const months = await writeUpsNow()
    const newest = (partner: boolean) => (writeUpsForExport(months, true, partner) as { monthlyWriteUps: { readings: { reading: number }[] }[] }).monthlyWriteUps[0].readings.map((r) => r.reading)
    // Without the Partner path the newest reading has nothing left to carry, and is not listed.
    expect([newest(true), newest(false)]).toEqual([[3, 2, 1], [2, 1]])
  })
})

describe('a read the monthly read logged', () => {
  it('is kept on the phone, and one of a task no list knows is not', () => {
    const row = { day: '2026-11-13', at: '2026-11-13T22:00:00.000Z', task: 'month', category: 'lookup.month', count: 148, bytes: 37888, via: 'context' }
    expect(brainReadOf('read:1', JSON.stringify(row))).toEqual({ id: 'read:1', ...row })
    expect(brainReadOf('read:2', JSON.stringify({ ...row, task: 'year' }))).toBeNull()
  })
})

describe('a month task’s own row', () => {
  it('is nothing the phone keeps: it is no run of the skill coach’s and no answer’s', () => {
    const row = JSON.stringify({ id: 'task:2026-10-01:month', kind: 'task', task: 'month', day: '2026-10-01', at: '2026-11-13T22:00:00.000Z', status: 'written', trigger: 'ask', factsDay: '2026-10-01', askedModel: 'opus', contextCalls: 3, contextBytes: 100, posts: 1, refusals: [], turns: [1], asks: [1] })
    expect(coachRunOf('task:2026-10-01:month', row)).toBeNull()
    expect(askRunOf('task:2026-10-01:month', row)).toBeNull()
  })
})
