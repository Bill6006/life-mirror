import 'fake-indexeddb/auto'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import Dexie from 'dexie'
import { expect, it, vi } from 'vitest'

// Personalization's database version (P6, 2026-11-07): a record kept under version 26 (Social and the speaking Path
// running, their steps answered, a Path request and a generated version pulled), opened by the app at version 27. Every
// row of every store comes back exactly as it was, the three new stores start empty, and each Path computes the same
// today as before the upgrade: nothing changes how a Path runs until you act.

// Since version 28 the app also holds the pattern table's store, new since 27 and tested in its own file: it too is no part of a version-26 record.
// Since version 29 it also holds the two stores for what is noticed in notes, new since 28 and tested in their own file.
const NEW_STORES = ['pathAdaptations', 'pathTests', 'pathTestDays', 'patterns', 'noteEvents', 'noteMarks']

it('keeps a version-26 record whole when the app opens it at the current version, every Path running as before', async () => {
  const { db: current } = await import('./db')
  await current.open()
  expect(current.verno).toBe(30)
  const specs = Object.fromEntries(current.tables.filter((t) => !NEW_STORES.includes(t.name)).map((t) => [t.name, [t.schema.primKey.src, ...t.schema.indexes.map((i) => i.src)].join(', ')]))
  current.close()

  const factory = new IDBFactory()
  Dexie.dependencies.indexedDB = factory
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  globalThis.indexedDB = factory
  const old = new Dexie('life-mirror')
  old.version(26).stores(specs)
  await old.open()
  const step = (id: number, moveId: string, day: string, path: string, setting: string, stage = 1) => ({ id, kind: 'step', day, block: 'morning', at: `${day}T14:00:00.000Z`, situationKey: `aim:path:${path}`, target: 'mood', stance: '', band: '', reading: 0, moveId, minutes: 5, cardId: null, candidates: [moveId], coinFlip: false, passiveId: null, whyNot: null, propensity: 1, propensities: { [moveId]: 1 }, chosenBy: 'app', paths: [path], setting, rule: 'only', stage, skippedAt: null, closedAt: `${day}T14:10:00.000Z` })
  const done = (id: number, offerId: number, moveId: string, day: string, extra: Record<string, unknown> = {}) => ({ id, offerId, moveId, day, block: 'morning', at: `${day}T14:10:00.000Z`, outcome: 'done', why: null, passiveOutcome: null, reason: 'done', seen: true, ...extra })
  const seeded: Record<string, unknown[]> = {
    aims: [
      { id: 1, kind: 'path', path: 'social', stepMoveId: null, createdAt: '2026-10-01T12:00:00.000Z', archivedAt: null },
      { id: 2, kind: 'path', path: 'speaking', stepMoveId: null, createdAt: '2026-11-01T12:00:00.000Z', archivedAt: null, strands: ['speaking', 'nerves'] },
    ],
    offers: [step(10, 'eye-contact-stranger', '2026-11-02', 'social', 'errand'), step(11, 'sp-record-point', '2026-11-03', 'speaking', 'solo'), step(12, 'sp-n-one-question', '2026-11-04', 'speaking', 'group')],
    outcomes: [done(20, 10, 'eye-contact-stranger', '2026-11-02'), done(21, 11, 'sp-record-point', '2026-11-03', { checks: ['opening'], effort: 4 }), { ...done(22, 12, 'sp-n-one-question', '2026-11-04'), outcome: 'no', why: 'noTime', reason: 'noTime', chance: true }],
    pathVersions: [{ id: 30, path: 'speaking', version: '1', hash: 'abc', decision: 'started', at: '2026-11-01T12:00:00.000Z', cards: [] }],
    pathRequests: [{ id: 40, at: '2026-11-05T15:00:00.000Z', day: '2026-11-05', goal: 'Grow vegetables in a small garden bed', where: 'home', minutes: 90, route: 'path', state: 'queued', updatedAt: '2026-11-05T15:00:00.000Z' }],
    pathMarks: [{ id: 50, path: 'social', kind: 'milestone', day: '2026-11-02', note: 'A first hello', at: '2026-11-02T18:00:00.000Z' }],
  }
  for (const [store, rows] of Object.entries(seeded)) await old.table(store).bulkAdd(rows)
  old.close()

  // Each Path's today on the version-26 record, before the upgrade.
  const { pathToday } = await import('./pathStage')
  const today = (aims: unknown[], offers: unknown[], outcomes: unknown[]) => (aims as Parameters<typeof pathToday>[0]['aim'][]).map((aim) => pathToday({ aim, offers: offers as never, outcomes: outcomes as never, ctx: null, day: '2026-11-07', block: 'evening' }))
  const before = today(seeded.aims, seeded.offers, seeded.outcomes)

  vi.resetModules()
  const { db } = await import('./db')
  await db.open()
  expect(db.verno).toBe(30)
  for (const [store, rows] of Object.entries(seeded)) expect(await db.table(store).toArray(), store).toEqual(rows)
  for (const store of NEW_STORES) expect(await db.table(store).count(), store).toBe(0)
  const after = today(await db.aims.toArray(), await db.offers.toArray(), await db.outcomes.toArray()).map((v, k) => ({ ...v, aim: before[k].aim }))
  expect(after.map((v) => [v.pick, v.state, v.strands.map((s) => [s.strand.id, s.state.stage])])).toEqual(before.map((v) => [v.pick, v.state, v.strands.map((s) => [s.strand.id, s.state.stage])]))
  expect(pathToday({ aim: (await db.aims.get(2)) as never, offers: await db.offers.toArray(), outcomes: await db.outcomes.toArray(), ctx: null, day: '2026-11-07', block: 'evening', adaptations: await db.pathAdaptations.toArray() })).toEqual(before[1])
  db.close()
})
