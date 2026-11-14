import 'fake-indexeddb/auto'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import Dexie from 'dexie'
import { expect, it, vi } from 'vitest'

// The pattern table's database version (2026-11-13): a record kept under version 27, opened by the app at version 28.
// Every row of every store comes back exactly as it was, and the one new store starts empty: the step moves no data.

// Since version 29 the app also holds the two stores for what is noticed in notes, new since 28 and tested in their own file.
const NEW_STORES = ['patterns', 'noteEvents', 'noteMarks']

it('keeps a version-27 record whole when the app opens it at the current version, and starts the pattern table empty', async () => {
  const { db: current } = await import('./db')
  await current.open()
  expect(current.verno).toBe(30)
  expect(current.tables.map((t) => t.name)).toContain('patterns')
  expect(current.table('patterns').schema.primKey.src).toBe('id')
  const specs = Object.fromEntries(current.tables.filter((t) => !NEW_STORES.includes(t.name)).map((t) => [t.name, [t.schema.primKey.src, ...t.schema.indexes.map((i) => i.src)].join(', ')]))
  current.close()

  const factory = new IDBFactory()
  Dexie.dependencies.indexedDB = factory
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  globalThis.indexedDB = factory
  const old = new Dexie('life-mirror')
  old.version(27).stores(specs)
  await old.open()
  expect(old.tables.map((t) => t.name)).not.toContain('patterns')
  const seeded: Record<string, unknown[]> = {
    checkins: [
      { id: 1, day: '2026-11-10', block: 'morning', startedAt: '2026-11-10T12:00:00.000Z', completedAt: '2026-11-10T12:05:00.000Z', updatedAt: '2026-11-10T12:05:00.000Z', answers: { mood: 3, sleepHours: 2 }, activeMs: 1000 },
      { id: 2, day: '2026-11-10', block: 'evening', startedAt: '2026-11-11T01:00:00.000Z', completedAt: '2026-11-11T01:05:00.000Z', updatedAt: '2026-11-11T01:05:00.000Z', answers: { mood: 4 }, activeMs: 900, extras: { dinner: true, note: 'a long day' } },
    ],
    days: [{ day: '2026-11-10', weekday: 2, withHer: true, studyNight: false, churchDay: false, pickupTime: '17:15', soloUntil: '08:00' }],
    privateItems: [{ id: 7, name: 'a private thing', createdAt: '2026-10-01T12:00:00.000Z', archived: 0 }],
    offers: [{ id: 10, kind: 'block', day: '2026-11-10', block: 'morning', at: '2026-11-10T13:00:00.000Z', situationKey: 'x', target: 'mood', stance: '', band: 'solid', reading: 62, moveId: 'walk-ten', cardId: null, candidates: ['walk-ten'], coinFlip: false }],
    outcomes: [{ id: 20, offerId: 10, moveId: 'walk-ten', day: '2026-11-10', block: 'morning', at: '2026-11-10T13:20:00.000Z', outcome: 'done', why: null, passiveOutcome: null }],
    facts: [{ day: '2026-11-10', builtAt: '2026-11-10T12:06:00.000Z', updatedAt: '2026-11-10T12:06:00.000Z', sheet: { version: 1, day: '2026-11-10', facts: [] } }],
    brainPrefs: [{ id: 'prefs', writerModel: 'opus', switches: { notes: false }, updatedAt: '2026-11-01T10:00:00.000Z' }],
    pathAdaptations: [{ id: 70, path: 'social', kind: 'setAside', rep: 'eye-contact-stranger', origin: 'preference', why: 'not this week', state: 'applied', day: '2026-11-09', at: '2026-11-09T12:00:00.000Z' }],
    pathTests: [{ id: 71, path: 'social', lever: 'planLine', day: '2026-11-09', at: '2026-11-09T12:00:00.000Z' }],
    pathTestDays: [{ id: 72, test: 71, day: '2026-11-09', version: 1, chance: 0.5, at: '2026-11-09T12:00:00.000Z' }],
    outbox: [{ id: 1, store: 'checkins', key: '2', op: 'put', body: '{"id":2}', day: '2026-11-10', updatedAt: '2026-11-11T01:05:00.000Z', at: '2026-11-11T01:05:00.000Z' }],
  }
  for (const [store, rows] of Object.entries(seeded)) await old.table(store).bulkAdd(rows)
  old.close()

  vi.resetModules()
  const { db } = await import('./db')
  await db.open()
  expect(db.verno).toBe(30)
  for (const [store, rows] of Object.entries(seeded)) expect(await db.table(store).toArray(), store).toEqual(rows)
  for (const store of NEW_STORES) expect(await db.table(store).count(), store).toBe(0)
  // Nothing was queued for the cloud by the step itself: the queue holds what it held.
  expect(await db.outbox.count()).toBe(1)
  db.close()
})
