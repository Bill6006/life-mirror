import 'fake-indexeddb/auto'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import Dexie from 'dexie'
import { expect, it, vi } from 'vitest'

// The generator's database version (P5, 2026-11-07): a record kept under version 25, its Paths running, opened by the
// app at version 26. Every row of every store comes back exactly as it was; the three new stores (your Path requests,
// the generated versions, the jobs' rows) start empty. Version 26 only adds stores, so nothing of yours is touched.

const NEW_STORES = ['pathRequests', 'generatedPaths', 'pathJobs']

it('keeps a version-25 record whole when the app opens it at version 26', async () => {
  // The schema of every store version 25 had, read from the app's own declaration.
  const { db: current } = await import('./db')
  await current.open()
  expect(current.verno).toBe(26)
  const specs = Object.fromEntries(current.tables.filter((t) => !NEW_STORES.includes(t.name)).map((t) => [t.name, [t.schema.primKey.src, ...t.schema.indexes.map((i) => i.src)].join(', ')]))
  current.close()

  // A fresh browser with a version-25 record in it: the Social path and the speaking Path running, their steps answered.
  const factory = new IDBFactory()
  Dexie.dependencies.indexedDB = factory
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  globalThis.indexedDB = factory
  const old = new Dexie('life-mirror')
  old.version(25).stores(specs)
  await old.open()
  const seeded: Record<string, unknown[]> = {
    aims: [
      { id: 1, kind: 'path', path: 'social', stepMoveId: null, createdAt: '2026-10-01T12:00:00.000Z', archivedAt: null },
      { id: 2, kind: 'path', path: 'speaking', stepMoveId: null, createdAt: '2026-11-06T12:00:00.000Z', archivedAt: null, strands: ['speaking'] },
    ],
    offers: [{ id: 10, kind: 'step', day: '2026-11-06', block: 'morning', at: '2026-11-06T14:00:00.000Z', situationKey: 'aim:path:speaking', target: 'mood', stance: '', band: '', reading: 0, moveId: 'sp-record-point', minutes: 5, cardId: null, candidates: ['sp-record-point'], coinFlip: false, passiveId: null, whyNot: null, propensity: 1, propensities: { 'sp-record-point': 1 }, chosenBy: 'app', paths: ['speaking'], setting: 'solo', rule: 'only', stage: 1, skippedAt: null, closedAt: '2026-11-06T14:10:00.000Z', prediction: 'I will rush the ending' }],
    outcomes: [{ id: 11, offerId: 10, moveId: 'sp-record-point', day: '2026-11-06', block: 'morning', at: '2026-11-06T14:10:00.000Z', outcome: 'done', why: null, passiveOutcome: null, reason: 'done', seen: true, checks: ['opening', 'pauses'], effort: 3 }],
    checkins: [{ id: 20, day: '2026-11-06', block: 'morning', at: '2026-11-06T13:00:00.000Z', answers: { mood: 3, energy: 2 }, extras: { note: 'A slow start.' } }],
    pathVersions: [{ id: 30, path: 'speaking', version: '1', hash: 'abc', decision: 'started', at: '2026-11-06T12:00:00.000Z', cards: [] }],
  }
  for (const [store, rows] of Object.entries(seeded)) await old.table(store).bulkAdd(rows)
  old.close()

  // The app opens the same browser's record at version 26.
  vi.resetModules()
  const { db } = await import('./db')
  await db.open()
  expect(db.verno).toBe(26)
  for (const [store, rows] of Object.entries(seeded)) expect(await db.table(store).toArray(), store).toEqual(rows)
  for (const store of NEW_STORES) expect(await db.table(store).count(), store).toBe(0)
  db.close()
})
