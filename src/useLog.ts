import Dexie from 'dexie'
import { addDays, blockAt } from './blocks'
import { outboxPut } from './cloudOutbox'
import { db, type UseKind, type UseRow } from './db'

// How Life Mirror is used (Part 34; Follow-up F1, 2026-09-24). The events are counts, times and
// fixed ids of use inside the app, never content, never anything outside it. Kept on this phone
// and, with the cloud copy on, in your own database. Two readings of them: the four weeks shown
// under Data and privacy, and the usage facts on the day's sheet, which Claude may be given under
// Settings → Brain once its access opens. A fact says what was observed and never why.

/** Rows older than this are dropped when the app opens. */
export const USE_KEEP_DAYS = 120

/** The window the Data and privacy summary covers. */
export const USE_WINDOW_DAYS = 28

/** Records one use. It never stands in the way: a failed write is dropped. */
export async function logUse(kind: UseKind, what?: string, now: Date = new Date()): Promise<void> {
  try {
    await db.useLog.add({ day: blockAt(now).day, at: now.toISOString(), kind, ...(what ? { what } : {}) })
  } catch {
    // The log is an instrument; the app never waits on it or fails for it.
  }
}

export async function pruneUseLog(today: string): Promise<void> {
  await db.useLog.where('day').below(addDays(today, -USE_KEEP_DAYS)).delete()
}

/** Every row, oldest first, for the export. */
export function useRows(): Promise<UseRow[]> {
  return db.useLog.orderBy('id').toArray()
}

/**
 * F1 syncs the use log with the rest of the record. Rows kept before it did are queued once: each
 * row neither queued nor known to the cloud copy. Safe to run at every open; it queues nothing twice.
 */
export async function queueUseRowsForCloud(now: Date = new Date()): Promise<number> {
  return db.transaction('rw', [db.useLog, db.outbox, db.cloudRows], async () => {
    const range = (t: typeof db.outbox | typeof db.cloudRows) => t.where('[store+key]').between(['useLog', Dexie.minKey], ['useLog', Dexie.maxKey]).toArray()
    const [rows, queued, known] = await Promise.all([db.useLog.toArray(), range(db.outbox), range(db.cloudRows)])
    const have = new Set([...queued, ...known].map((r) => r.key))
    const missing = rows.filter((r) => r.id !== undefined && !have.has(String(r.id)))
    const at = now.toISOString()
    if (missing.length) await db.outbox.bulkAdd(missing.map((r) => outboxPut('useLog', r.id, r as unknown as Record<string, unknown>, at)))
    return missing.length
  })
}
