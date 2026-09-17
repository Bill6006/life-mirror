import Dexie, { type DbSchema, type DBCore, type DBCoreMutateRequest, type DBCoreMutateResponse, type DBCoreTable, type DBCoreTransaction, type Transaction } from 'dexie'

// Rule 21: the phone is the source of truth and a copy syncs to a database you control. Every
// create, update and delete in every synced table is queued here, inside the same transaction,
// so the outbox can never disagree with the record. The sync worker drains it; a pull applying
// remote rows, and the wipe, run silently and queue nothing.

export const APP = 'life-mirror'

/** Every table that is part of your record. The outbox and the sync state are not. */
export const SYNCED_STORES: readonly string[] = ['checkins', 'settings', 'wins', 'privateItems', 'offers', 'cards', 'outcomes', 'days', 'studyNights', 'aims', 'skills', 'rungMarks', 'declarations', 'forecasts', 'forecastScores', 'anchorSwaps', 'herSkills', 'moments']

/** One queued change: a put with the record as JSON, or a delete (a tombstone in the cloud). */
export interface OutboxRow {
  id?: number
  store: string
  key: string
  op: 'put' | 'delete'
  body: string | null
  day: string | null
  updatedAt: string
  at: string
}

/** What the cloud copy is known to hold for one row, so a pull applies only what is newer. */
export interface CloudRowState {
  store: string
  key: string
  updatedAt: string
  syncedAt: string
}

/** The sync state, one record. Never synced itself. */
export interface CloudMeta {
  /** 'state' for this app's own rows; 'outside' for the other app's rows this app reads. */
  key: 'state' | 'outside'
  /** The latest synced_at pulled; the next pull asks for rows after it. */
  watermark: string
  lastSyncAt: string | null
  lastError: string | null
}

const silent = new WeakSet<Transaction>()

/** Inside a transaction: mark it as writing nothing to the outbox (a pull applying remote rows, or the wipe). */
export function markSilent(): void {
  const t = Dexie.currentTransaction
  if (t) silent.add(t)
}

function isSilent(): boolean {
  const t = Dexie.currentTransaction
  return t !== null && silent.has(t)
}

/** The settings record travels without its device credentials: the cloud token, the push address, the reminders already shown. */
export function bodyForCloud(store: string, body: Record<string, unknown>): Record<string, unknown> {
  if (store !== 'settings') return body
  const { cloud: _cloud, push: _push, reminded: _reminded, ...rest } = body
  return rest
}

/** The day a record belongs to, when it has one. */
export function dayOf(body: Record<string, unknown>): string | null {
  const d = body.day ?? body.forDay
  return typeof d === 'string' ? d : null
}

/** The record's own timestamp, or now. */
export function stampOf(body: Record<string, unknown>, now: string): string {
  return typeof body.updatedAt === 'string' && body.updatedAt ? body.updatedAt : now
}

export function outboxPut(store: string, key: unknown, value: Record<string, unknown>, now: string): OutboxRow {
  const body = bodyForCloud(store, value)
  return { store, key: String(key), op: 'put', body: JSON.stringify(body), day: dayOf(value), updatedAt: stampOf(value, now), at: now }
}

export function outboxDelete(store: string, key: unknown, now: string): OutboxRow {
  return { store, key: String(key), op: 'delete', body: null, day: null, updatedAt: now, at: now }
}

type Listener = () => void
const listeners = new Set<Listener>()

/** Called after anything was queued; the sync worker uses it to push soon. */
export function onOutboxChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify(): void {
  for (const l of listeners) l()
}

function tracked(name: string, table: DBCoreTable, outbox: () => DBCoreTable): DBCoreTable {
  const keyPath = table.schema.primaryKey.keyPath
  const enqueue = async (trans: DBCoreTransaction, rows: OutboxRow[]) => {
    if (!rows.length) return
    await outbox().mutate({ trans, type: 'add', values: rows })
    notify()
  }
  const withKey = (value: Record<string, unknown>, key: unknown): Record<string, unknown> => (typeof keyPath === 'string' ? { ...value, [keyPath]: key } : value)

  return {
    ...table,
    async mutate(req: DBCoreMutateRequest): Promise<DBCoreMutateResponse> {
      const quiet = isSilent()
      const now = new Date().toISOString()
      if (quiet) return table.mutate(req)
      if (req.type === 'deleteRange') {
        // Table.clear() and range deletes: find the keys first so each gets its tombstone.
        const { result: keys } = await table.query({ trans: req.trans, values: false, query: { index: table.schema.primaryKey, range: req.range }, limit: Infinity })
        const res = await table.mutate(req)
        await enqueue(req.trans, (keys as unknown[]).map((k) => outboxDelete(name, k, now)))
        return res
      }
      if (req.type === 'delete') {
        const res = await table.mutate(req)
        await enqueue(req.trans, req.keys.filter((_, i) => !res.failures[i]).map((k) => outboxDelete(name, k, now)))
        return res
      }
      const res = await table.mutate(req)
      const keys = res.results ?? req.keys ?? []
      const rows: OutboxRow[] = []
      req.values.forEach((value, i) => {
        if (res.failures[i]) return
        const key = keys[i] ?? (typeof keyPath === 'string' ? (value as Record<string, unknown>)[keyPath] : undefined)
        if (key === undefined) return
        rows.push(outboxPut(name, key, withKey(value as Record<string, unknown>, key), now))
      })
      await enqueue(req.trans, rows)
      return res
    },
  }
}

/**
 * Installs the outbox: every read-write transaction that touches a synced table also holds the
 * outbox, and every mutation on a synced table queues its change in that same transaction.
 */
export function installOutbox(db: Dexie): void {
  db._createTransaction = Dexie.override(
    db._createTransaction,
    (orig: typeof db._createTransaction) =>
      function (this: Dexie, mode: IDBTransactionMode, storeNames: ArrayLike<string>, dbschema: DbSchema, parent?: Transaction | null) {
        let names = Array.from(storeNames)
        if (mode === 'readwrite' && !names.includes('outbox') && names.some((n) => SYNCED_STORES.includes(n))) names = [...names, 'outbox']
        return orig.call(this, mode, names, dbschema, parent)
      },
  )
  db.use({
    stack: 'dbcore',
    name: 'cloudOutbox',
    create: (down: DBCore): DBCore => ({
      ...down,
      table: (name: string) => {
        const table = down.table(name)
        return SYNCED_STORES.includes(name) ? tracked(name, table, () => down.table('outbox')) : table
      },
    }),
  })
}
