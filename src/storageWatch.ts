import type Dexie from 'dexie'

// The phone's storage interrupted under the app (2026-10-23, the blank Now). When the browser's storage fails under a page,
// Chrome aborts every transaction under way and closes the database's connection. Dexie then drops each live read so cut
// short without a word (its liveQuery swallows DatabaseClosedError and AbortError, which it also uses for its own aborts),
// and an interruption while the database opens makes the open fail, after which Dexie refuses every read and write until
// the database is opened again. Here: who hears that the storage closed under the app (each live read, which asks again:
// live.ts), the open made again when it failed, and the interruptions kept on this phone, as the engine's failures are,
// for the Worker's report alone. Never synced on their own, never anything of the record.

/** Where the interruptions are kept: this phone's own storage. */
export const STORAGE_FAULT_KEY = 'life-mirror.storage.faults'

export interface StorageFaults {
  /** How many times the storage closed under the app, or an open of the database failed. */
  count: number
  /** The first and the last, to the minute. */
  first: string
  last: string
  /** The last one's error name (an open that failed), or "closed"; never its message, which could carry what it was reading. */
  name: string
  /** How many times Now waited past its limit for the record, and which of its reads had not answered the last time. */
  waits?: number
  waited?: string[]
}

/** The page's storage, where there is one (the service worker has none). */
function page(): { localStorage?: { getItem(key: string): string | null; setItem(key: string, value: string): void } } {
  return globalThis as never
}

/** The interruptions kept on this phone, or null when there are none or the storage cannot be read. */
export function storageFaults(): StorageFaults | null {
  try {
    const raw = page().localStorage?.getItem(STORAGE_FAULT_KEY) ?? null
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<StorageFaults>
    if (typeof v.count !== 'number' || typeof v.first !== 'string' || typeof v.last !== 'string') return null
    return {
      count: v.count,
      first: v.first,
      last: v.last,
      name: typeof v.name === 'string' ? v.name : 'closed',
      ...(typeof v.waits === 'number' ? { waits: v.waits } : {}),
      ...(Array.isArray(v.waited) ? { waited: v.waited.filter((x): x is string => typeof x === 'string').slice(0, 8) } : {}),
    }
  } catch {
    return null
  }
}

function keep(change: (f: StorageFaults | null, at: string) => StorageFaults, now: Date): void {
  try {
    const store = page().localStorage
    if (!store) return
    store.setItem(STORAGE_FAULT_KEY, JSON.stringify(change(storageFaults(), now.toISOString().slice(0, 16))))
  } catch {
    // Storage that cannot be written keeps nothing; the reads still ask again.
  }
}

const listeners = new Set<() => void>()

/** Told each time the storage closes under the app; returns the way to stop. */
export function onStorageClosed(listener: () => void): () => void {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** The storage closed under the app, or an open failed: kept, and every live read told. */
export function storageClosed(name: string, now: Date = new Date()): void {
  keep((f, at) => (f ? { ...f, count: f.count + 1, last: at, name } : { count: 1, first: at, last: at, name }), now)
  for (const l of [...listeners]) l()
}

/** Now waited past its limit for the record: kept, with the reads that had not answered. */
export function nowWaited(missing: readonly string[], now: Date = new Date()): void {
  keep((f, at) => ({ ...(f ?? { count: 0, first: at, last: at, name: 'waited' }), waits: (f?.waits ?? 0) + 1, waited: [...missing].slice(0, 8) }), now)
}

/** Dexie's own state, read only here: whether the database is being opened, was closed on purpose, and why an open failed. */
interface DexieState {
  autoOpen?: boolean
  isBeingOpened?: boolean
  openComplete?: boolean
  dbOpenError?: { name?: unknown } | null
}

function stateOf(db: Dexie): DexieState | undefined {
  return (db as unknown as { _state?: DexieState })._state
}

/** While the database is closed here to be opened again, its close is no interruption. */
let reopening = false

/**
 * Opens the database again when it is shut but meant to be open, so the reads and writes Dexie would refuse go through
 * once the storage is back: after an open that failed, and after a connection closed while the database was opening, which
 * leaves Dexie thinking itself open with no connection, refusing everything and reporting no failure. An open database,
 * one being opened, and one closed on purpose (a wipe, the tests) are left as they are.
 */
export async function reopenIfClosed(db: Dexie): Promise<void> {
  const state = stateOf(db)
  if (db.isOpen() || state?.isBeingOpened || state?.autoOpen === false) return
  // Shut while it was opening, Dexie keeps that open's settled promise as the one a read waits on, and a read waiting on a
  // new open would then ask again without end, never letting the open finish: closed properly first, so it waits on this one.
  if (state?.openComplete && !db.hasFailed()) {
    reopening = true
    try {
      db.close({ disableAutoOpen: false })
    } finally {
      reopening = false
    }
  }
  try {
    await db.open()
  } catch {
    // Still out: the next read that asks again tries again.
  }
}

/**
 * Hears the storage close under the app. Dexie's close event comes for every close: a connection the browser closed, an open
 * that failed, and a close on purpose, which then turns its auto-open off just after (heard as none); a page the browser put
 * away whole (the back-forward cache) closes its own and opens it again on its return (heard as none either).
 */
export function installStorageWatch(db: Dexie): void {
  let away = false
  if (typeof addEventListener === 'function') {
    addEventListener('pagehide', (e) => {
      if ((e as Event & { persisted?: boolean }).persisted) away = true
    })
    addEventListener('pageshow', () => {
      away = false
    })
  }
  db.on('close', () => {
    if (away || reopening) return
    const failed = stateOf(db)?.dbOpenError?.name
    const name = typeof failed === 'string' ? failed : 'closed'
    // A close on purpose turns auto-open off once its close is done: read after it.
    queueMicrotask(() => {
      if (stateOf(db)?.autoOpen === false) return
      storageClosed(name)
    })
  })
}
