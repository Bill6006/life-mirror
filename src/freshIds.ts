import type Dexie from 'dexie'
import type { DBCore, DBCoreMutateRequest, DBCoreMutateResponse, DBCoreTable, DBCoreTransaction } from 'dexie'
import { SYNCED_STORES } from './cloudOutbox'
import { tokenStorage } from './tokenVault'

// Sync safety (2026-10-03). Clearing a site's data wipes the database and local storage together: the
// phone is a new install, with no floors and no token. What it recorded before the token was pasted took
// ids from one, and its first sync wrote those records over the cloud's under the same ids (ten records,
// 2026-10-03). So until this storage has once read the cloud, the ids it hands out start far past any id
// the cloud's own count reaches, from a base taken from the clock, so that two such installs never share
// a range. Nothing is ever renumbered afterwards: every link between records stays as it was made.

/** Set once this storage has read the whole cloud; until then its own ids start at the fresh base. */
export const IN_STEP_KEY = 'lm.inStep'
/** The base this install's ids start from while it is not yet in step, chosen once. */
export const FRESH_BASE_KEY = 'lm.freshBase'
/** Past any id the record's own count reaches (the largest store holds hundreds a month). */
export const BASE_FLOOR = 10_000_000
/** The base counts seconds from 2026-01-01: an install a minute later starts sixty ids further on. */
const EPOCH_MS = Date.UTC(2026, 0, 1)

/** Whether this storage has read the cloud. Without local storage (the service worker, the tests under Node) it counts as in step, and ids run as they always did. */
export function inStep(): boolean {
  const kv = tokenStorage()
  if (!kv) return true
  try {
    return kv.getItem(IN_STEP_KEY) === '1'
  } catch {
    return true
  }
}

/** This storage has read the whole cloud: its ids run on from what it now holds. */
export function markInStep(): void {
  try {
    const kv = tokenStorage()
    kv?.setItem(IN_STEP_KEY, '1')
    kv?.removeItem(FRESH_BASE_KEY)
  } catch {
    // Without local storage there is nothing to mark.
  }
}

/** The base for a new install's own ids: chosen the first time it is needed, and kept until the install is in step. */
export function freshBase(now: number = Date.now()): number {
  const kv = tokenStorage()
  try {
    const kept = Number(kv?.getItem(FRESH_BASE_KEY))
    if (Number.isInteger(kept) && kept >= BASE_FLOOR) return kept
  } catch {
    // An unreadable base: a new one below.
  }
  const base = BASE_FLOOR + Math.max(0, Math.floor((now - EPOCH_MS) / 1000))
  try {
    kv?.setItem(FRESH_BASE_KEY, String(base))
  } catch {
    // Not kept: the next write takes a later base, never an earlier one.
  }
  return base
}

/** Moves a store's counter past the base, inside the write's own transaction: a placeholder at the base, removed at once. */
async function raisePast(table: DBCoreTable, trans: DBCoreTransaction, keyPath: string, base: number): Promise<void> {
  const { result } = await table.query({ trans, values: false, limit: 1, query: { index: table.schema.primaryKey, range: { type: 2, lower: base, lowerOpen: false, upper: Infinity, upperOpen: false } } })
  if ((result as unknown[]).length) return
  await table.mutate({ trans, type: 'add', values: [{ [keyPath]: base, placeholder: true }] })
  await table.mutate({ trans, type: 'delete', keys: [base] })
}

/**
 * `past`: the stores known to be past the base for as long as this database stays open, each entered only
 * once the transaction that raised it has committed (a raise that rolled back is looked for again).
 */
function freshTable(name: string, table: DBCoreTable, keyPath: string, past: Set<string>): DBCoreTable {
  return {
    ...table,
    async mutate(req: DBCoreMutateRequest): Promise<DBCoreMutateResponse> {
      if (!past.has(name) && (req.type === 'add' || req.type === 'put') && req.values.some((v) => (v as Record<string, unknown>)[keyPath] === undefined) && !inStep()) {
        await raisePast(table, req.trans, keyPath, freshBase())
        const target = req.trans as unknown as { addEventListener?: (type: string, listener: () => void) => void }
        target.addEventListener?.('complete', () => past.add(name))
      }
      return table.mutate(req)
    },
  }
}

/**
 * Below the outbox's layer, so the placeholder is never queued: every synced store whose ids the
 * database counts out itself takes its first new id past the fresh base while this storage is not yet in step.
 */
export function installFreshIds(db: Dexie): void {
  db.use({
    stack: 'dbcore',
    name: 'freshIds',
    level: 7,
    create: (down: DBCore): DBCore => {
      const past = new Set<string>()
      return {
        ...down,
        table: (name: string) => {
          const table = down.table(name)
          const pk = table.schema.primaryKey
          return SYNCED_STORES.includes(name) && pk.autoIncrement && typeof pk.keyPath === 'string' ? freshTable(name, table, pk.keyPath, past) : table
        },
      }
    },
  })
}
