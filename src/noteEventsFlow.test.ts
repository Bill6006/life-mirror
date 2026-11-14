import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { APP, SYNCED_STORES } from './cloudOutbox'
import { memoryStore, type CloudRow, type MemoryStore } from './cloudStore'
import { BRAIN_APP, BRAIN_STORES, deleteCloudCopy, resetCloudForTests, setOnlineCheck, setStoreFactory, syncNow } from './cloudSync'
import { readPatterns, PATTERNS_ID } from './counted/stored'
import { forgetKeptPatterns } from './counted/table'
import { checkin, context, day } from './counted/testing'
import { db, updateSettings, wipeEverything } from './db'
import { noticedForExport } from './export'
import { forgetNoticed, markWrong, noticedNow } from './noteEvents/flow'
import { FORGET_ID, type NoteEvent } from './noteEvents/shared'
import { setEventTypesForTests, type EventType } from './noteEvents/types'
import { countedRecord, writePatternsRow } from './patternsFlow'
import { setTokenStorageForTests } from './tokenVault'

// What is noticed in notes, on the phone's own database (2026-11-13): the Worker's rows pulled and kept read-only,
// the phone's marks synced, the counts and the pattern table following a mark. Every token here is made up and never
// reaches a network; every type and every note is a stand-in.

const TYPES: readonly EventType[] = [{ id: 'raised-voice', label: 'Raised my voice', definition: 'A stand-in definition.', was: ['yelled'] }]
const TOKEN = 'test-token-never-real'
const A = 250
const SPAN = 56
const none = async (): Promise<void> => undefined
const NOW = new Date('2026-11-03T14:00:00.000Z')

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

/** Eight weeks of evenings, each with a note; the stand-in words in the first eight. Check-in ids run from 1. */
async function seedNotes(): Promise<void> {
  await db.checkins.bulkAdd(Array.from({ length: SPAN }, (_, i) => checkin(A + i, 'evening', { extras: { note: i < 8 ? `day ${i}: I yelled at the dog` : 'a quiet one' } })))
  await db.days.bulkAdd(Array.from({ length: SPAN }, (_, i) => context(A + i)))
}
const event = (n: number, over: Partial<NoteEvent> = {}): NoteEvent => ({ id: `e${n}`, type: 'raised-voice', note: { store: 'checkins', id: String(n), day: day(A + n - 1), block: 'evening' }, quote: 'I yelled at the dog', noticedAt: '2026-10-01T10:00:00.000Z', method: 'month-1', ...over })
const brainRow = (id: string, body: unknown, at: string, deleted: 0 | 1 = 0): CloudRow => ({ app: BRAIN_APP, store: 'noteEvents', id, day: null, body: deleted ? '{}' : JSON.stringify(body), updated_at: at, deleted, device_id: 'worker', synced_at: at })
const queued = async (store: string) => (await db.outbox.toArray()).filter((r) => r.store === store).map((r) => [r.key, r.op])

beforeEach(async () => {
  await fresh()
  setEventTypesForTests(TYPES)
})
afterEach(() => {
  setStoreFactory(null)
  setOnlineCheck(null)
  setTokenStorageForTests(null)
  setEventTypesForTests(null)
})

describe('a mark on something noticed', () => {
  it('is the phone’s own record, queued for the cloud; the Worker’s row is never queued', async () => {
    await seedNotes()
    await db.noteEvents.bulkPut([event(1), event(2)])
    expect((await noticedNow()).map((n) => [n.event.id, n.wrong])).toEqual([
      ['e2', false],
      ['e1', false],
    ])
    await markWrong('e1', true, NOW)
    expect(await db.noteMarks.toArray()).toEqual([{ id: 'event:e1', kind: 'wrong', at: NOW.toISOString(), updatedAt: NOW.toISOString() }])
    expect((await noticedNow()).map((n) => [n.event.id, n.wrong])).toEqual([
      ['e2', false],
      ['e1', true],
    ])
    expect(await queued('noteMarks')).toEqual([['event:e1', 'put']])
    // Taken back: the mark is gone, and that too is queued.
    await markWrong('e1', false)
    expect(await db.noteMarks.count()).toBe(0)
    expect((await noticedNow()).every((n) => !n.wrong)).toBe(true)
    expect((await queued('noteMarks')).at(-1)).toEqual(['event:e1', 'delete'])
    // What the Worker wrote is read-only here: nothing of it is ever sent back.
    expect(await queued('noteEvents')).toEqual([])
    expect(SYNCED_STORES).toContain('noteMarks')
    expect(SYNCED_STORES).not.toContain('noteEvents')
    // The Worker's rows are untouched by a mark.
    expect(await db.noteEvents.count()).toBe(2)
  })

  it('forgets everything noticed up to a moment, and keeps the Worker’s rows on record', async () => {
    await seedNotes()
    await db.noteEvents.bulkPut([event(1), event(2, { noticedAt: '2026-11-05T10:00:00.000Z' })])
    await forgetNoticed(NOW)
    expect(await db.noteMarks.get(FORGET_ID)).toEqual({ id: 'forget', kind: 'forget', at: NOW.toISOString(), updatedAt: NOW.toISOString() })
    // What was noticed before the moment is gone from view and from every count; what is noticed after it stands.
    expect((await noticedNow()).map((n) => n.event.id)).toEqual(['e2'])
    expect(await db.noteEvents.count()).toBe(2)
    expect(await queued('noteMarks')).toEqual([['forget', 'put']])
  })
})

describe('the counts follow what stands', () => {
  it('hand the pattern table a kind once five stand, and take it away when a mark leaves four', async () => {
    await seedNotes()
    await db.noteEvents.bulkPut([1, 2, 3, 4].map((n) => event(n)))
    expect((await countedRecord()).noticed).toHaveLength(4)
    await writePatternsRow(day(A + SPAN), NOW, { pause: none })
    const kindsOf = async () => readPatterns(await db.patterns.get(PATTERNS_ID))?.kinds.map((k) => k.id) ?? []
    expect((await kindsOf()).some((id) => id.startsWith('noticed.'))).toBe(false)
    await db.noteEvents.put(event(5))
    await writePatternsRow(day(A + SPAN), new Date(NOW.getTime() + 60_000), { pause: none })
    const table = readPatterns(await db.patterns.get(PATTERNS_ID))
    expect(table?.kinds.find((k) => k.id === 'noticed.raised-voice')).toMatchObject({ label: 'Claude noticed in a note: Raised my voice (counted among the check-ins where you wrote a note)', category: 'notes', private: true, known: SPAN, occurrences: 5 })
    // Marked wrong, one leaves the count; under five there is no kind at the next build.
    await markWrong('e3', true, NOW)
    expect((await countedRecord()).noticed).toHaveLength(4)
    await writePatternsRow(day(A + SPAN), new Date(NOW.getTime() + 120_000), { pause: none })
    expect((await kindsOf()).some((id) => id.startsWith('noticed.'))).toBe(false)
    // With nothing standing the record handed to the core is the record it always was: no key for what was noticed.
    await db.noteEvents.clear()
    expect('noticed' in (await countedRecord())).toBe(false)
  })

  it('drop an event at once when its note is deleted or no longer holds the quoted words', async () => {
    await seedNotes()
    await db.noteEvents.bulkPut([1, 2, 3, 4, 5].map((n) => event(n)))
    expect((await countedRecord()).noticed).toHaveLength(5)
    // Edited: the words are no longer in the note.
    const first = await db.checkins.get(1)
    await db.checkins.put({ ...first!, extras: { note: 'day 0: a calm evening' } })
    expect((await countedRecord()).noticed?.map((n) => n.checkinId)).toEqual([5, 4, 3, 2])
    expect((await noticedNow()).map((n) => n.event.id)).toEqual(['e5', 'e4', 'e3', 'e2'])
    // Deleted: its check-in is gone from the record.
    await db.checkins.delete(2)
    expect((await countedRecord()).noticed?.map((n) => n.checkinId)).toEqual([5, 4, 3])
    // The words written back, the event stands again: nothing was lost by the edit.
    await db.checkins.put({ ...first!, extras: { note: 'so: I yelled at the dog, again' } })
    expect((await countedRecord()).noticed?.map((n) => n.checkinId)).toEqual([5, 4, 3, 1])
  })
})

describe('the Worker’s rows of what was noticed', () => {
  it('are asked for by name with its other rows, and applied by their ids: a row, a row again, a row deleted', async () => {
    expect(BRAIN_STORES).toEqual(['briefs', 'reads', 'coach', 'proposals', 'bridge', 'askAnswers', 'pathJobs', 'generated', 'noteEvents', 'writeups'])
    await seedNotes()
    const store = memoryStore()
    const { id: _id, ...body } = event(1)
    await store.upsert([brainRow('e1', body, '2026-11-01T10:00:00.000Z')])
    await withToken(store)
    expect(await syncNow()).toBe('done')
    expect(await db.noteEvents.toArray()).toEqual([event(1)])
    // The same row read again changes nothing.
    expect(await syncNow()).toBe('done')
    expect(await db.noteEvents.toArray()).toEqual([event(1)])
    // A second, and a row that is not an event: the first is kept, the other is not.
    await store.upsert([brainRow('e2', { ...event(2), id: undefined }, '2026-11-01T11:00:00.000Z'), brainRow('bad', { type: 'raised-voice' }, '2026-11-01T11:00:01.000Z')])
    expect(await syncNow()).toBe('done')
    expect((await db.noteEvents.toArray()).map((e) => e.id).sort()).toEqual(['e1', 'e2'])
    // Deleted by the Worker, it leaves the phone.
    await store.upsert([brainRow('e1', null, '2026-11-01T12:00:00.000Z', 1)])
    expect(await syncNow()).toBe('done')
    expect((await db.noteEvents.toArray()).map((e) => e.id)).toEqual(['e2'])
    // Nothing of it was ever queued for the cloud.
    expect(await queued('noteEvents')).toEqual([])
  })

  it('come back on a new phone with the marks made on them', async () => {
    await seedNotes()
    const store = memoryStore()
    const { id: _a, ...one } = event(1)
    const { id: _b, ...two } = event(2)
    await store.upsert([brainRow('e1', one, '2026-11-01T10:00:00.000Z'), brainRow('e2', two, '2026-11-01T10:00:01.000Z')])
    await withToken(store)
    expect(await syncNow()).toBe('done')
    await markWrong('e1', true, NOW)
    expect(await syncNow()).toBe('done')
    expect(store.rows.get(`${APP}|noteMarks|event:e1`)).toMatchObject({ deleted: 0 })
    // A new phone: the check-ins, the Worker's rows and the mark all come back, and the same things stand.
    await fresh()
    await withToken(store)
    expect(await syncNow()).toBe('done')
    expect(await db.noteMarks.toArray()).toEqual([{ id: 'event:e1', kind: 'wrong', at: NOW.toISOString(), updatedAt: NOW.toISOString() }])
    expect((await noticedNow()).map((n) => [n.event.id, n.wrong])).toEqual([
      ['e2', false],
      ['e1', true],
    ])
    // A restore run twice changes nothing, and queues nothing.
    expect(await syncNow()).toBe('done')
    expect(await db.outbox.count()).toBe(0)
    // The mark taken back on this phone leaves the cloud copy too.
    await markWrong('e1', false)
    expect(await syncNow()).toBe('done')
    expect(store.rows.get(`${APP}|noteMarks|event:e1`)).toMatchObject({ deleted: 1 })
  })

  it('are gone with the marks after everything is deleted, on the phone and in the cloud copy', async () => {
    await seedNotes()
    const store = memoryStore()
    await withToken(store)
    await db.noteEvents.bulkPut([event(1)])
    await markWrong('e1', true, NOW)
    await forgetNoticed(NOW)
    expect(await syncNow()).toBe('done')
    expect([...store.rows.values()].filter((r) => r.app === APP && r.store === 'noteMarks')).toHaveLength(2)
    await deleteCloudCopy()
    expect([...store.rows.values()].filter((r) => r.app === APP)).toEqual([])
    await wipeEverything()
    expect(await db.noteEvents.count()).toBe(0)
    expect(await db.noteMarks.count()).toBe(0)
  })
})

describe('the export', () => {
  it('lists what stands, with your own words, its note’s day and whether you marked it wrong; and nothing when nothing stands', async () => {
    await seedNotes()
    const checkins = await db.checkins.toArray()
    const events = [event(1), event(2), event(40)]
    const marks = [{ id: 'event:e2', kind: 'wrong' as const, at: NOW.toISOString(), updatedAt: NOW.toISOString() }]
    expect(noticedForExport({ events, marks }, checkins, [])).toEqual({
      claudeNoticed: [
        { what: 'Raised my voice', day: day(A + 1), checkIn: 'evening', fromAKeptNote: false, yourWords: 'I yelled at the dog', noticedAt: '2026-10-01T10:00:00.000Z', method: 'month-1', markedWrong: true },
        { what: 'Raised my voice', day: day(A), checkIn: 'evening', fromAKeptNote: false, yourWords: 'I yelled at the dog', noticedAt: '2026-10-01T10:00:00.000Z', method: 'month-1', markedWrong: false },
      ],
    })
    // The one whose note never held the words is not listed, as it is nowhere.
    expect(JSON.stringify(noticedForExport({ events, marks }, checkins, []))).not.toContain(day(A + 39))
    expect(noticedForExport({ events: [event(40)], marks: [] }, checkins, [])).toEqual({})
    expect(noticedForExport(undefined, checkins, [])).toEqual({})
    expect(noticedForExport({ events: [], marks }, checkins, [])).toEqual({})
  })
})
