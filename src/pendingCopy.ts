import type Dexie from 'dexie'
import type { DBCore, DBCoreMutateRequest, DBCoreMutateResponse, DBCoreTable, DBCoreTransaction } from 'dexie'
import type { OutboxRow } from './cloudOutbox'
import { maxIds } from './idFloors'
import { raiseFloors, tokenStorage } from './tokenVault'

// Sync safety (2026-10-02, second part). The phone's browser cleared the app's database a third time,
// with its storage marked to be kept, and took with it every change the cloud had not received yet:
// a move, its answer and what rode alongside it. Local storage, a different engine in the same
// browser, came through each time, as the token's second copy and the id floors did. So every change
// waiting for the cloud is kept there too: written once the database has committed it, dropped once
// the queue lets it go. A cleared database gets back, after the history is pulled, each change the
// cloud never received (cloudSync's putBackPending). Nothing here is ever made up: only what the
// phone itself queued is kept.

export const PENDING_KEY = 'lm.pending'
/** The most the second copy takes, in characters: local storage is shared with the other apps at this address. */
export const PENDING_CAP = 1_000_000
/** What gives way first when the cap is reached: the use log and what the app derives; what you entered stays. */
const GIVES_WAY: ReadonlySet<string> = new Set(['useLog', 'facts', 'forecasts', 'forecastScores', 'briefLog'])

/** One queued change as kept: its place in the queue when it was kept, and the change itself. */
interface Kept {
  id: number
  row: OutboxRow
}

/** The second copy: the latest queued change of each record, by store and key. `partial` once the cap left something out, until the copy empties. */
export interface PendingCopy {
  rows: Record<string, Kept>
  partial?: boolean
}

type Change = { kind: 'put'; id: number; row: OutboxRow } | { kind: 'drop'; rows: OutboxRow[] }

const rowKey = (row: Pick<OutboxRow, 'store' | 'key'>): string => `${row.store}|${row.key}`

function isRow(v: unknown): v is OutboxRow {
  const r = v as Partial<OutboxRow> | null
  return Boolean(r) && typeof r?.store === 'string' && typeof r?.key === 'string' && (r?.op === 'put' || r?.op === 'delete') && typeof r?.updatedAt === 'string' && typeof r?.at === 'string'
}

/**
 * The same queued change. Matched by what it is, never by its place in the queue: a cleared database
 * counts the queue from one again, and a new change must never take an earlier one's leave.
 */
function sameChange(a: OutboxRow, b: OutboxRow): boolean {
  return a.store === b.store && a.key === b.key && a.op === b.op && a.at === b.at && a.updatedAt === b.updatedAt && (a.body ?? null) === (b.body ?? null)
}

/** Which of two kept changes of one record came later: by when each was queued, then by its place. */
const later = (a: Kept, b: Kept): boolean => a.row.at > b.row.at || (a.row.at === b.row.at && a.id > b.id)

/** The second copy as kept; empty when there is none or it cannot be read. */
export function readPending(): PendingCopy {
  try {
    const raw = tokenStorage()?.getItem(PENDING_KEY)
    if (!raw) return { rows: {} }
    const parsed = JSON.parse(raw) as Partial<PendingCopy> | null
    const rows: Record<string, Kept> = {}
    for (const [k, v] of Object.entries(parsed?.rows ?? {})) if (v && Number.isFinite(v.id) && isRow(v.row)) rows[k] = { id: v.id, row: v.row }
    return { rows, ...(parsed?.partial ? { partial: true } : {}) }
  } catch {
    return { rows: {} }
  }
}

/** The copy as written, within the cap: the rows that give way leave first, then the oldest, and the copy says it is partial. */
export function fitPending(copy: PendingCopy, cap: number = PENDING_CAP): string {
  const whole = JSON.stringify(copy)
  if (whole.length <= cap) return whole
  const entries = Object.entries(copy.rows).sort((a, b) => Number(GIVES_WAY.has(b[1].row.store)) - Number(GIVES_WAY.has(a[1].row.store)) || (later(b[1], a[1]) ? -1 : 1))
  const rows = { ...copy.rows }
  // Each entry's share of the text, counted once: the key, the colon, the value and a comma.
  let size = whole.length + (copy.partial ? 0 : ',"partial":true'.length)
  for (const [k, v] of entries) {
    if (size <= cap) break
    size -= JSON.stringify(k).length + JSON.stringify(v).length + 2
    delete rows[k]
  }
  let text = JSON.stringify({ rows, partial: true })
  for (const [k] of entries) {
    if (text.length <= cap) break
    if (!(k in rows)) continue
    delete rows[k]
    text = JSON.stringify({ rows, partial: true })
  }
  return text
}

function writePending(copy: PendingCopy): void {
  try {
    const kv = tokenStorage()
    if (!kv) return
    if (!Object.keys(copy.rows).length) {
      kv.removeItem(PENDING_KEY)
      return
    }
    kv.setItem(PENDING_KEY, fitPending(copy))
  } catch {
    // A full local storage: the database still holds every change, and the copy keeps what it had.
  }
}

/** The kept changes, in the order they were queued. */
export function pendingRows(): OutboxRow[] {
  return Object.values(readPending().rows)
    .sort((a, b) => (later(a, b) ? 1 : -1))
    .map((k) => k.row)
}

/** Drops kept changes the cloud already holds (by store and key): the copy had only missed their leaving. */
export function forgetPending(keys: readonly string[]): void {
  if (!keys.length) return
  const copy = readPending()
  for (const k of keys) delete copy.rows[k]
  writePending(copy)
}

/**
 * On start: what was queued before this version kept the copy (the phone's queue at the update), or
 * while a write to the copy did not go through, kept now. Each record's latest queued change.
 */
export async function keepQueued(db: Dexie): Promise<number> {
  if (!tokenStorage()) return 0
  const queued = ((await db.table('outbox').toArray()) as OutboxRow[]).filter((r) => typeof r.id === 'number' && isRow(r))
  if (!queued.length) return 0
  raiseFloors(maxIds(queued.map((r) => ({ store: r.store, key: r.key }))))
  const copy = readPending()
  const changed = new Set<string>()
  for (const r of queued) {
    const k = rowKey(r)
    const kept: Kept = { id: r.id as number, row: withoutId(r) }
    const have = copy.rows[k]
    if (have && (sameChange(have.row, kept.row) || later(have, kept))) continue
    copy.rows[k] = kept
    changed.add(k)
  }
  if (changed.size) writePending(copy)
  return changed.size
}

/** The wipe: nothing kept. */
export function clearPending(): void {
  try {
    tokenStorage()?.removeItem(PENDING_KEY)
  } catch {
    // Nothing to clear where there is no local storage.
  }
}

function apply(changes: readonly Change[]): void {
  if (!changes.length || !tokenStorage()) return
  // Every id the phone has used, known beside the token at once: a database cleared before the next
  // start or push hands none of them out again, so a change put back never meets another record under its id.
  raiseFloors(maxIds(changes.flatMap((c) => (c.kind === 'put' ? [{ store: c.row.store, key: c.row.key }] : []))))
  const copy = readPending()
  for (const c of changes) {
    if (c.kind === 'put') {
      copy.rows[rowKey(c.row)] = { id: c.id, row: c.row }
      continue
    }
    for (const r of c.rows) {
      const k = rowKey(r)
      const have = copy.rows[k]
      if (have && sameChange(have.row, r)) delete copy.rows[k]
    }
  }
  writePending(copy)
}

const staged = new WeakMap<object, Change[]>()

/** Held until the transaction commits: a change the database never committed is never kept. */
function stage(trans: DBCoreTransaction, change: Change): void {
  const target = trans as unknown as { addEventListener?: (type: string, listener: () => void) => void }
  if (typeof target.addEventListener !== 'function') return apply([change])
  let list = staged.get(trans)
  if (!list) {
    list = []
    staged.set(trans, list)
    target.addEventListener('complete', () => apply(staged.get(trans) ?? []))
  }
  list.push(change)
}

function withoutId(value: unknown): OutboxRow {
  const { id: _id, ...row } = value as OutboxRow
  return row as OutboxRow
}

function keptTable(table: DBCoreTable): DBCoreTable {
  return {
    ...table,
    async mutate(req: DBCoreMutateRequest): Promise<DBCoreMutateResponse> {
      if (req.type === 'add' || req.type === 'put') {
        const res = await table.mutate(req)
        const keys = res.results ?? req.keys ?? []
        req.values.forEach((value, i) => {
          if (res.failures[i]) return
          const id = Number(keys[i] ?? (value as OutboxRow).id)
          if (Number.isFinite(id) && isRow(value)) stage(req.trans, { kind: 'put', id, row: withoutId(value) })
        })
        return res
      }
      // A removal: the changes it takes first, so each kept copy leaves with its own change and no other.
      const leaving =
        req.type === 'delete'
          ? await table.getMany({ trans: req.trans, keys: req.keys })
          : (await table.query({ trans: req.trans, values: true, query: { index: table.schema.primaryKey, range: req.range }, limit: Infinity })).result
      const res = await table.mutate(req)
      stage(req.trans, { kind: 'drop', rows: (leaving as unknown[]).filter((v, i) => isRow(v) && !(req.type === 'delete' && res.failures[i])).map(withoutId) })
      return res
    },
  }
}

/**
 * Keeps the second copy in step with the queue. Below the outbox's own layer, so every change to the
 * queue passes through it: what a write to a synced table queues, what the merge queues directly, and
 * what a push or a pull takes out.
 */
export function installPendingCopy(db: Dexie): void {
  db.use({
    stack: 'dbcore',
    name: 'pendingCopy',
    level: 5,
    create: (down: DBCore): DBCore => ({
      ...down,
      table: (name: string) => (name === 'outbox' ? keptTable(down.table(name)) : down.table(name)),
    }),
  })
}
